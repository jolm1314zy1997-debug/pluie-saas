import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

/**
 * 批量爬取代理 → 后端 /api/scrape/batch
 * 从搜索结果转移到查联系方式时调用
 */
export async function POST(req: NextRequest) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 600_000); // 10分钟超时（批量）

  try {
    const body = await req.json();
    const backendRes = await fetch(`${BACKEND_URL}/api/scrape/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const data = await backendRes.json();
    clearTimeout(timeoutId);
    return NextResponse.json(data, { status: backendRes.status });
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Scrape Batch Proxy] Error:', message);
    return NextResponse.json(
      { detail: `批量爬取失败: ${message}` },
      { status: 504 }
    );
  }
}
