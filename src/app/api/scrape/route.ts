import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

/**
 * 前端代理 → 后端爬虫接口
 * 后端使用 Jina Reader 抓取干净 Markdown + Kimi K2.5 AI 提取
 * 
 * POST /api/scrape/single  → 后端 /api/scrape/single
 * POST /api/scrape/batch   → 后端 /api/scrape/batch
 */
export async function POST(req: NextRequest) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 300_000); // 5分钟超时（批量爬取）

  try {
    const body = await req.json();
    const backendRes = await fetch(`${BACKEND_URL}/api/scrape/single`, {
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
    console.error('[Scraper Proxy] Error:', message);
    return NextResponse.json(
      { detail: `爬取失败: ${message}` },
      { status: 504 }
    );
  }
}
