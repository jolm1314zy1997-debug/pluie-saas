import { NextRequest, NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export async function POST(req: NextRequest) {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return NextResponse.json(
        { detail: 'Supabase 环境变量未配置' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const action = body.action;

    if (action === 'signup') {
      return await proxySupabaseAuth('/auth/v1/signup', {
        email: body.email,
        password: body.password,
        data: {
          display_name: body.displayName || String(body.email || '').split('@')[0],
        },
      });
    }

    if (action === 'signin') {
      return await proxySupabaseAuth('/auth/v1/token?grant_type=password', {
        email: body.email,
        password: body.password,
      });
    }

    if (action === 'user') {
      const token = getBearerToken(req);
      if (!token) return NextResponse.json({ user: null, session: null });
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) return NextResponse.json({ user: null, session: null });
      return NextResponse.json({ user: data, session: { access_token: token, user: data } });
    }

    return NextResponse.json({ detail: 'Unknown auth action' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown auth error';
    return NextResponse.json({ detail: formatNetworkError(message) }, { status: 502 });
  }
}

async function proxySupabaseAuth(path: string, payload: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    return NextResponse.json(
      { detail: data?.msg || data?.error_description || data?.message || 'Supabase Auth 请求失败' },
      { status: res.status }
    );
  }

  const user = data?.user || data;
  const session = data?.access_token ? { ...data, user } : data?.session || null;
  return NextResponse.json({ user, session });
}

function getBearerToken(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || '';
}

function formatNetworkError(message: string) {
  if (message.includes('ENOTFOUND') || message.includes('fetch failed')) {
    return 'Supabase 项目地址无法访问。请检查 Vercel 的 NEXT_PUBLIC_SUPABASE_URL 是否复制正确，格式应为 https://项目ID.supabase.co，不能带 /rest/v1/。';
  }
  return `账号服务请求失败: ${message}`;
}
