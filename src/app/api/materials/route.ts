import { NextRequest, NextResponse } from 'next/server';
import {
  appendItem,
  deleteObject,
  getR2Config,
  getUploadKey,
  isR2Configured,
  presignPut,
  publicUrlFor,
  readManifest,
  removeItem,
  type ManifestItem,
} from '@/lib/r2';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * 物料库 API（基于 Cloudflare R2）
 *
 * 路由约定：
 *   GET    /api/materials                         列出所有物料（公开可读）
 *   POST   /api/materials  body: { action: 'presign', filename, content_type }
 *                                              获取直传 R2 的 presigned PUT URL
 *   POST   /api/materials  body: { action: 'register', ... }
 *                                              上传完成后落 manifest
 *   DELETE /api/materials?id=xxx                  删除物料（+ 一并清 R2 文件）
 *
 * 写操作（presign / register / delete）需要团队口令：
 *   - Header: X-Team-Key: <MATERIALS_UPLOAD_KEY>
 *   - 或 body.team_key 字段
 *
 * 列表（GET）默认放开，方便业务员快速翻阅；如果你想锁起来，把 requireKey 设成 true。
 */

const REQUIRE_KEY_FOR_LIST = false; // 改 true 则浏览也要团队口令

function configMissingResponse() {
  return NextResponse.json(
    {
      detail:
        '物料库后端 R2 未配置。请在 Vercel 设置 R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME / R2_PUBLIC_URL / MATERIALS_UPLOAD_KEY，参考 supabase/materials-setup.md',
      config_missing: true,
    },
    { status: 503 }
  );
}

function extractTeamKey(req: NextRequest, fallbackFromBody?: string): string {
  const header = req.headers.get('x-team-key') || '';
  const query = new URL(req.url).searchParams.get('team_key') || '';
  return (header || query || fallbackFromBody || '').trim();
}

function checkKey(req: NextRequest, fallbackFromBody?: string): NextResponse | null {
  const expected = getUploadKey();
  if (!expected) {
    return NextResponse.json(
      { detail: '后端未配置 MATERIALS_UPLOAD_KEY，无法启用团队口令上传' },
      { status: 503 }
    );
  }
  const provided = extractTeamKey(req, fallbackFromBody);
  if (provided !== expected) {
    return NextResponse.json({ detail: '团队口令错误' }, { status: 401 });
  }
  return null;
}

function safeFilename(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || `file-${Date.now()}`
  );
}

function newId(): string {
  // Node 18+ 自带 crypto.randomUUID()
  // @ts-ignore — Edge runtime 也有，nodejs runtime 也有
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/* ─────────── GET：列表 ─────────── */

export async function GET(req: NextRequest) {
  if (!isR2Configured()) return configMissingResponse();
  if (REQUIRE_KEY_FOR_LIST) {
    const denied = checkKey(req);
    if (denied) return denied;
  }

  try {
    const manifest = await readManifest();
    const url = new URL(req.url);
    const category = url.searchParams.get('category')?.trim() || '';
    const q = url.searchParams.get('q')?.trim().toLowerCase() || '';
    const product = url.searchParams.get('product')?.trim().toLowerCase() || '';

    let items = manifest.items;
    if (category && category !== 'all') items = items.filter((i) => i.category === category);
    if (product) items = items.filter((i) => (i.product || '').toLowerCase().includes(product));
    if (q) {
      items = items.filter((i) => {
        const hay = [
          i.title,
          i.description || '',
          i.product || '',
          (i.tags || []).join(' '),
        ]
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      });
    }
    return NextResponse.json({ items });
  } catch (err: any) {
    console.error('[materials GET]', err);
    return NextResponse.json({ detail: err?.message || '读取失败' }, { status: 500 });
  }
}

/* ─────────── POST：presign / register ─────────── */

export async function POST(req: NextRequest) {
  if (!isR2Configured()) return configMissingResponse();
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ detail: '请求体不是合法 JSON' }, { status: 400 });

  const denied = checkKey(req, body.team_key);
  if (denied) return denied;

  const action = String(body.action || '').trim();
  if (action === 'presign') {
    return await handlePresign(body);
  }
  if (action === 'register') {
    return await handleRegister(body);
  }
  return NextResponse.json({ detail: `未知 action: ${action}` }, { status: 400 });
}

async function handlePresign(body: any) {
  const filename = String(body.filename || '').trim();
  const contentType = String(body.content_type || 'application/octet-stream');
  const category = String(body.category || '产品实拍图').trim();
  if (!filename) return NextResponse.json({ detail: '缺少 filename' }, { status: 400 });

  const cfg = getR2Config()!;
  const ts = Date.now();
  const objectKey = `${encodeURIComponent(category)}/${ts}-${safeFilename(filename)}`;
  try {
    const presignedUrl = await presignPut(objectKey, contentType);
    return NextResponse.json({
      upload_url: presignedUrl,
      file_path: objectKey,
      file_url: publicUrlFor(cfg, objectKey),
      content_type: contentType,
    });
  } catch (err: any) {
    console.error('[materials presign]', err);
    return NextResponse.json({ detail: err?.message || 'presign 失败' }, { status: 500 });
  }
}

async function handleRegister(body: any) {
  const title = String(body.title || '').trim();
  const filePath = String(body.file_path || '').trim();
  const fileUrl = String(body.file_url || '').trim();
  if (!title) return NextResponse.json({ detail: 'title 必填' }, { status: 400 });
  if (!filePath || !fileUrl)
    return NextResponse.json({ detail: 'file_path / file_url 必填' }, { status: 400 });

  const item: ManifestItem = {
    id: newId(),
    title,
    description: body.description ? String(body.description).trim() || null : null,
    category: String(body.category || '产品实拍图').trim(),
    product: body.product ? String(body.product).trim() || null : null,
    tags: Array.isArray(body.tags)
      ? body.tags.map((t: unknown) => String(t).trim()).filter(Boolean)
      : [],
    file_path: filePath,
    file_url: fileUrl,
    file_type: body.file_type ? String(body.file_type) : null,
    file_size: typeof body.file_size === 'number' ? body.file_size : null,
    thumbnail_url: body.thumbnail_url ? String(body.thumbnail_url) : null,
    uploaded_by: body.uploaded_by ? String(body.uploaded_by).trim() || null : null,
    uploaded_at: new Date().toISOString(),
  };
  try {
    await appendItem(item);
    return NextResponse.json({ item });
  } catch (err: any) {
    console.error('[materials register]', err);
    return NextResponse.json({ detail: err?.message || '写 manifest 失败' }, { status: 500 });
  }
}

/* ─────────── DELETE：按 id 删除 ─────────── */

export async function DELETE(req: NextRequest) {
  if (!isR2Configured()) return configMissingResponse();
  const denied = checkKey(req);
  if (denied) return denied;

  const id = new URL(req.url).searchParams.get('id')?.trim() || '';
  if (!id) return NextResponse.json({ detail: '缺少 id' }, { status: 400 });

  try {
    const { removed } = await removeItem(id);
    if (!removed) return NextResponse.json({ detail: '找不到该物料' }, { status: 404 });
    if (removed.file_path) {
      await deleteObject(removed.file_path).catch((err) => {
        console.warn('[materials delete] R2 object remove failed:', err?.message);
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[materials DELETE]', err);
    return NextResponse.json({ detail: err?.message || '删除失败' }, { status: 500 });
  }
}
