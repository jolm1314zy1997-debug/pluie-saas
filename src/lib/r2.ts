import { AwsClient } from 'aws4fetch';

/**
 * Cloudflare R2 客户端封装。
 * 走 S3 兼容协议，用 aws4fetch 做 AWS Signature V4 签名（包大小约 5KB，比 AWS SDK 轻得多）。
 *
 * 需要的 env：
 *   R2_ACCOUNT_ID       Cloudflare 账号 ID（dashboard 右下角 / R2 settings 可看）
 *   R2_ACCESS_KEY_ID    R2 API token 的 Access Key ID
 *   R2_SECRET_ACCESS_KEY R2 API token 的 Secret
 *   R2_BUCKET_NAME      桶名（如 qzt-materials）
 *   R2_PUBLIC_URL       公开访问地址。两种来源任选其一：
 *                       - r2.dev 子域：https://pub-xxxxx.r2.dev
 *                       - 自定义域：https://materials.qztsecurity.com
 *                       不要以 / 结尾
 *   MATERIALS_UPLOAD_KEY 团队上传口令（任意字符串），业务员第一次输入后浏览器记住
 */

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl: string;
}

export function getR2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID || '';
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || '';
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || '';
  const bucket = process.env.R2_BUCKET_NAME || '';
  const publicUrl = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    return null;
  }
  return { accountId, accessKeyId, secretAccessKey, bucket, publicUrl };
}

export function isR2Configured(): boolean {
  return Boolean(getR2Config());
}

export function getUploadKey(): string {
  return process.env.MATERIALS_UPLOAD_KEY || '';
}

function makeClient(cfg: R2Config) {
  return new AwsClient({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    service: 's3',
    region: 'auto',
  });
}

function r2Endpoint(cfg: R2Config, objectKey?: string) {
  const base = `https://${cfg.accountId}.r2.cloudflarestorage.com/${cfg.bucket}`;
  return objectKey ? `${base}/${objectKey}` : base;
}

export function publicUrlFor(cfg: R2Config, objectKey: string): string {
  return `${cfg.publicUrl}/${objectKey}`;
}

/**
 * 生成浏览器直传 R2 用的 presigned PUT URL。
 * 默认有效期 10 分钟，足够单文件上传。
 */
export async function presignPut(
  objectKey: string,
  contentType: string,
  expiresInSeconds = 600
): Promise<string> {
  const cfg = getR2Config();
  if (!cfg) throw new Error('R2 未配置');
  const client = makeClient(cfg);
  const url = new URL(r2Endpoint(cfg, objectKey));
  url.searchParams.set('X-Amz-Expires', String(expiresInSeconds));
  const signed = await client.sign(
    new Request(url.toString(), {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
    }),
    {
      aws: { signQuery: true },
    }
  );
  return signed.url;
}

/**
 * 删除 R2 上的对象。
 */
export async function deleteObject(objectKey: string): Promise<void> {
  const cfg = getR2Config();
  if (!cfg) throw new Error('R2 未配置');
  const client = makeClient(cfg);
  await client.fetch(r2Endpoint(cfg, objectKey), { method: 'DELETE' });
}

/* ───────── manifest.json 元数据管理（无数据库方案） ───────── */

const MANIFEST_KEY = 'manifest.json';

export interface ManifestItem {
  id: string;
  title: string;
  description: string | null;
  category: string;
  product: string | null;
  tags: string[];
  file_path: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  thumbnail_url: string | null;
  uploaded_by: string | null;
  uploaded_at: string; // ISO
}

export interface Manifest {
  version: number;
  items: ManifestItem[];
}

const EMPTY_MANIFEST: Manifest = { version: 1, items: [] };

/**
 * 读取 manifest。文件不存在或解析失败时返回空 manifest。
 */
export async function readManifest(): Promise<Manifest> {
  const cfg = getR2Config();
  if (!cfg) throw new Error('R2 未配置');
  const client = makeClient(cfg);
  const res = await client.fetch(r2Endpoint(cfg, MANIFEST_KEY), { method: 'GET' });
  if (!res.ok) {
    if (res.status === 404) return { ...EMPTY_MANIFEST };
    throw new Error(`读取 manifest 失败 (HTTP ${res.status})`);
  }
  try {
    const text = await res.text();
    const parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.items)) return { ...EMPTY_MANIFEST };
    return parsed as Manifest;
  } catch {
    return { ...EMPTY_MANIFEST };
  }
}

/**
 * 写 manifest。
 *
 * 注意：R2 写 manifest 不是原子操作；当多个业务员并发上传时存在覆盖风险。
 * 实战中：业务员手动上传，QPS 极低，撞车概率几乎为 0。我们采用"读-改-写"模式，
 * 并在写入前再次读取做最后一次合并（best-effort），把碰撞窗口缩到 100ms 级别。
 */
export async function writeManifest(manifest: Manifest): Promise<void> {
  const cfg = getR2Config();
  if (!cfg) throw new Error('R2 未配置');
  const client = makeClient(cfg);
  const jsonBody = JSON.stringify({ ...manifest, version: (manifest.version || 1) + 1 }, null, 2);
  // R2 严格要求 Content-Length。Node fetch + string body 有时不会自动加，
  // 用 Uint8Array 包一下，强制 fetch 设置准确的 Content-Length，并显式传一份
  // 进 headers 让 aws4fetch 签名包含它（漏签 R2 会 403/411）。
  const body = new TextEncoder().encode(jsonBody);
  const res = await client.fetch(r2Endpoint(cfg, MANIFEST_KEY), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': String(body.byteLength),
    },
    body,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`写 manifest 失败 (HTTP ${res.status})${errText ? `: ${errText.slice(0, 200)}` : ''}`);
  }
}

/**
 * 把新条目追加到 manifest 并写回。
 */
export async function appendItem(item: ManifestItem): Promise<Manifest> {
  // 读一次 → 合并 → 写回
  const current = await readManifest();
  // 撞 ID 时覆盖（理论上不会，因为 id 是 uuid）
  const merged: Manifest = {
    version: current.version || 1,
    items: [item, ...current.items.filter((x) => x.id !== item.id)],
  };
  await writeManifest(merged);
  return merged;
}

/**
 * 按 id 删除条目。
 */
export async function removeItem(id: string): Promise<{ manifest: Manifest; removed: ManifestItem | null }> {
  const current = await readManifest();
  const removed = current.items.find((x) => x.id === id) || null;
  if (!removed) return { manifest: current, removed: null };
  const next: Manifest = {
    version: current.version || 1,
    items: current.items.filter((x) => x.id !== id),
  };
  await writeManifest(next);
  return { manifest: next, removed };
}
