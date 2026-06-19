import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/test-api-key
 * 测试 aihubmix API Key 是否有效
 * 前端 ApiKeyConfig 组件的「测试连接」按钮调用此接口
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const apiKey = body.api_key || '';
    const baseUrl = (body.base_url || '').replace(/\/+$/, '');

    if (!apiKey || !baseUrl) {
      return NextResponse.json(
        { success: false, detail: '请先填写 API Key 和 Base URL' },
        { status: 400 }
      );
    }

    // 用一个最简单的请求测试连通性
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gemini-2.0-flash',
        messages: [
          { role: 'user', content: 'Reply with exactly: OK' },
        ],
        max_tokens: 5,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (res.status === 401 || res.status === 403) {
      return NextResponse.json({
        success: false,
        detail: `API Key 无效 (${res.status} Unauthorized)，请检查 Key 是否正确`,
      });
    }

    if (res.status === 429) {
      // 429 说明 Key 有效，只是频率限制
      return NextResponse.json({
        success: true,
        model: 'key-valid (rate limited)',
        message: 'API Key 有效，但当前请求频率受限',
      });
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return NextResponse.json({
        success: false,
        detail: `API 返回错误 (HTTP ${res.status}): ${errText.slice(0, 200)}`,
      });
    }

    const data = await res.json();
    const model = data?.model || 'unknown';
    const content = data?.choices?.[0]?.message?.content || '';

    return NextResponse.json({
      success: true,
      model,
      message: content ? `响应正常: "${content.trim().slice(0, 50)}"` : '响应正常（内容为空）',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('timeout') || message.includes('Timeout') || message.includes('abort')) {
      return NextResponse.json({
        success: false,
        detail: '连接超时（>15秒），请检查 Base URL 是否正确，网络是否通畅',
      });
    }
    return NextResponse.json({
      success: false,
      detail: `网络错误: ${message}`,
    });
  }
}
