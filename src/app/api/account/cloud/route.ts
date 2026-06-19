import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ detail: '请先登录账号' }, { status: 401 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return NextResponse.json({ detail: '登录已失效，请重新登录' }, { status: 401 });
    }

    const body = await req.json();
    const action = body.action;
    const userId = userData.user.id;

    if (action === 'loadAppState') {
      const { data, error } = await supabase
        .from('user_app_state')
        .select('search_results,enriched_leads,copy_customer')
        .maybeSingle();
      if (error) return cloudError(error);
      return NextResponse.json({
        searchResults: Array.isArray(data?.search_results) ? data.search_results : [],
        enrichedLeads: Array.isArray(data?.enriched_leads) ? data.enriched_leads : [],
        copyCustomer: data?.copy_customer || null,
        exists: Boolean(data),
      });
    }

    if (action === 'saveAppState') {
      const state = body.state || {};
      const { error } = await supabase.from('user_app_state').upsert({
        user_id: userId,
        search_results: Array.isArray(state.searchResults) ? state.searchResults : [],
        enriched_leads: Array.isArray(state.enrichedLeads) ? state.enrichedLeads : [],
        copy_customer: state.copyCustomer || null,
        updated_at: new Date().toISOString(),
      });
      if (error) return cloudError(error);
      return NextResponse.json({ ok: true });
    }

    if (action === 'loadBlocklist') {
      // 屏蔽列表两个搜索模式共用。scope 参数已废弃，保留只为兼容旧客户端。
      const { data, error } = await supabase
        .from('lead_blocklist')
        .select('company_name')
        .order('created_at', { ascending: true });
      if (error) return cloudError(error);
      return NextResponse.json({ names: (data || []).map((row) => row.company_name).filter(Boolean) });
    }

    if (action === 'saveBlocklist') {
      const names: string[] = Array.from(
        new Set((body.names || []).map((name: string) => String(name).trim()).filter(Boolean))
      );
      // 直接覆盖该用户的全部屏蔽行（无视 scope）
      const { error: deleteError } = await supabase
        .from('lead_blocklist')
        .delete()
        .eq('user_id', userId);
      if (deleteError) return cloudError(deleteError);

      if (names.length > 0) {
        const { error } = await supabase.from('lead_blocklist').insert(
          names.map((name) => ({
            user_id: userId,
            company_name: name,
            normalized_name: normalizeCompanyName(name),
            scope: 'all',
          }))
        );
        if (error) return cloudError(error);
      }
      return NextResponse.json({ ok: true });
    }

    if (action === 'saveCopyDraft') {
      const draft = body.draft || {};
      if (!Array.isArray(draft.versions) || draft.versions.length === 0) {
        return NextResponse.json({ ok: true });
      }
      const { error } = await supabase.from('copy_drafts').insert({
        user_id: userId,
        mode: draft.mode,
        channel: draft.channel,
        customer_company: draft.customerCompany || null,
        customer_background: draft.customerBackground || null,
        objective: draft.objective || null,
        versions: draft.versions,
      });
      if (error) return cloudError(error);
      return NextResponse.json({ ok: true });
    }

    if (action === 'saveChatImport') {
      const payload = body.payload || {};
      if (!String(payload.chatText || '').trim()) return NextResponse.json({ ok: true });
      const { error } = await supabase.from('chat_imports').insert({
        user_id: userId,
        source: payload.source || 'whatsapp_extension',
        contact_label: payload.contactLabel || null,
        chat_text: payload.chatText,
      });
      if (error) return cloudError(error);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ detail: 'Unknown cloud action' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown cloud error';
    return NextResponse.json({ detail: formatNetworkError(message) }, { status: 502 });
  }
}

function cloudError(error: { message?: string; code?: string }) {
  return NextResponse.json(
    { detail: error.message || 'Supabase 数据请求失败', code: error.code },
    { status: 502 }
  );
}

function getBearerToken(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || '';
}

function normalizeCompanyName(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatNetworkError(message: string) {
  if (message.includes('ENOTFOUND') || message.includes('fetch failed')) {
    return 'Supabase 项目地址无法访问。请检查 Vercel 的 NEXT_PUBLIC_SUPABASE_URL 是否复制正确，格式应为 https://项目ID.supabase.co，不能带 /rest/v1/。';
  }
  return `云端同步失败: ${message}`;
}
