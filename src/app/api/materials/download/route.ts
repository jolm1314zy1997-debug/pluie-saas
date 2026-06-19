import { NextRequest } from 'next/server';
import { getR2Config, isR2Configured } from '@/lib/r2';

export const runtime = 'nodejs';
export const maxDuration = 300; // Fluid 撑住大视频的 stream

/**
 * GET /api/materials/download?path=<r2-object-key>&filename=<想要的下载文件名>
 *
 * 为什么要走中转：浏览器对跨域 URL 上的 <a download> 属性会忽略，直接当成新页面打开。
 * R2 公共 r2.dev URL 跨域 → 想真正触发"下载"必须用同源响应 + Content-Disposition: attachment。
 *
 * 实现：服务端从 R2 拿到文件流，原封不动转发给浏览器，加上 attachment 头让浏览器存盘。
 * R2 egress 免费，Vercel 100 GB/月免费带宽够销售团队用。
 */

function badRequest(msg: string) {
  return new Response(msg, { status: 400 });
}

export async function GET(req: NextRequest) {
  if (!isR2Configured()) {
    return new Response('R2 not configured', { status: 503 });
  }

  const cfg = getR2Config()!;
  const url = new URL(req.url);
  const filePath = url.searchParams.get('path')?.trim();
  if (!filePath) return badRequest('missing ?path=');

  // 反 path traversal——只允许相对路径，不能带域名 / 协议 / 起始斜杠
  if (filePath.includes('://') || filePath.startsWith('/') || filePath.includes('..')) {
    return badRequest('invalid path');
  }

  // 想要的下载文件名（默认从 path 末尾取）
  const rawFilename = url.searchParams.get('filename')?.trim() || filePath.split('/').pop() || 'material';
  // 过滤危险字符
  const safeFilename = rawFilename.replace(/[\r\n\t]/g, '').slice(0, 200) || 'material';

  // 用 R2 公开 URL 拉流（R2 → Vercel 是免费的）
  const r2Url = `${cfg.publicUrl}/${filePath}`;
  let r2Res: Response;
  try {
    r2Res = await fetch(r2Url);
  } catch (err: any) {
    return new Response(`R2 fetch error: ${err?.message || err}`, { status: 502 });
  }
  if (!r2Res.ok || !r2Res.body) {
    return new Response(`R2 fetch failed: HTTP ${r2Res.status}`, { status: r2Res.status });
  }

  // 透传必要的响应头
  const headers = new Headers();
  const ct = r2Res.headers.get('content-type') || 'application/octet-stream';
  headers.set('Content-Type', ct);
  const cl = r2Res.headers.get('content-length');
  if (cl) headers.set('Content-Length', cl);
  // HTTP 头只能是 ASCII（Latin-1），所以 filename="" 里的中文/特殊字符要换成 _，
  // 真正的 UTF-8 名字走 filename*=UTF-8'' 那段（RFC 5987），现代浏览器都优先用后者。
  // 不做这一步的话 Node 会在 headers.set 抛错 → 500，Chrome 显示"网站出问题了"。
  const asciiFallback = safeFilename
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/"/g, '');
  const encodedName = encodeURIComponent(safeFilename);
  headers.set(
    'Content-Disposition',
    `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedName}`,
  );
  // 不缓存（避免业务员看到旧版本）
  headers.set('Cache-Control', 'private, no-store');

  return new Response(r2Res.body, { headers, status: 200 });
}
