import { NextRequest, NextResponse } from 'next/server';
import type { CopywritingPayload, CopywritingResponse } from '@/types/api';
import { COMPANY } from '@/config/company';

// Fluid Compute 启用后 Hobby 免费版 300 秒超时（vercel.json）

const DEFAULT_BASE_URL = 'https://api.aihubmix.com/v1';
const DEFAULT_API_KEY = process.env.AIHUBMIX_API_KEY || '';

// 跟公司 RAG bot 同款模型：低成本、速度快，适合销售建议和即时回复
const COPY_MODEL = 'deepseek-v4-flash';

type CopyMode = NonNullable<CopywritingPayload['mode']>;

export async function POST(req: NextRequest) {
  const timeoutId = setTimeout(() => undefined, 180_000);

  try {
    const rawBody = await req.json();

    const apiKey = rawBody._api_key || DEFAULT_API_KEY;
    const baseUrl = rawBody._base_url || DEFAULT_BASE_URL;

    if (!apiKey) {
      clearTimeout(timeoutId);
      return NextResponse.json(
        { detail: '请先配置 API Key（点击右上角「配置」按钮填入，或联系管理员配置默认 Key）' },
        { status: 400 }
      );
    }

    const { _api_key: _1, _base_url: _2, ...payload }: CopywritingPayload = rawBody;

    if (!payload.channel) {
      clearTimeout(timeoutId);
      return NextResponse.json({ detail: '缺少必填字段: channel' }, { status: 400 });
    }
    const result = await callCopyDirectly(apiKey, baseUrl, payload);
    clearTimeout(timeoutId);
    const status = result.success ? 200 : 502;
    return NextResponse.json(result, { status });
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Copy] Error:', message);
    return NextResponse.json(
      { detail: `文案生成失败: ${message}` },
      { status: 504 }
    );
  }
}

/* ── RAG 上下文 ── */

// KB URL / key 来自公司 profile（[src/config/company.ts]）
// 不同公司用自己的 Apps Script 知识库 + 自己的 RAG worker

async function fetchKBContext(keyword: string): Promise<string> {
  if (!COMPANY.kb.enabled || !COMPANY.kb.apiUrl) return '';
  try {
    const params = new URLSearchParams({
      action: 'search',
      query: keyword,
      token: COMPANY.kb.apiKey,
      top_k: '5',
    });

    const res = await fetch(`${COMPANY.kb.apiUrl}?${params}`, {
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) return '';

    const data = await res.json();
    if (data && data.results && Array.isArray(data.results)) {
      return data.results
        .map((r: any) => r.content || r.text || '')
        .filter(Boolean)
        .join('\n---\n');
    }
    return '';
  } catch (e) {
    console.error('[RAG] Sheet KB fetch error:', e);
    return '';
  }
}

async function fetchBotContext(question: string): Promise<string> {
  if (!COMPANY.kb.enabled || !COMPANY.kb.botAskUrl) return '';
  try {
    const res = await fetch(COMPANY.kb.botAskUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
      signal: AbortSignal.timeout(24_000),
    });

    if (!res.ok) return '';

    const data = await res.json();
    const answer = typeof data?.answer === 'string' ? data.answer.trim() : '';
    const sources = Array.isArray(data?.sources)
      ? data.sources
          .slice(0, 5)
          .map((s: any) => `《${s.sheet || 'unknown'}》${s.title ? ` · ${s.title}` : ''}`)
          .join(' / ')
      : '';

    if (!answer) return '';
    return sources ? `${answer}\n\n参考来源：${sources}` : answer;
  } catch (e) {
    console.error('[RAG] bot fetch error:', e);
    return '';
  }
}

function buildRagQuestion(payload: CopywritingPayload): string {
  const mode = payload.mode || 'chat_reply';
  const modeText: Record<CopyMode, string> = {
    outreach: '新客户破冰开发',
    chat_reply: '外贸即时聊天回复',
    closing: '销售终局逼单',
    mentor: '销售导师复盘与 SOP 沉淀',
    maintenance: '日常客户维护与关系经营',
  };

  return `请从${COMPANY.kb.label}中检索和整理可用于「${modeText[mode]}」的资料。

客户公司：${payload.customer_company || '未提供，可根据对话内容判断'}
客户行业：${payload.customer_industry || '未知'}
本次目标或卡点：${payload.my_goal || '未填写'}
客户背景或沟通记录：${payload.customer_background || '未填写'}
我方优势补充：${payload.core_advantage || '未填写'}

请优先提取：
1. 我方产品、本地仓、认证、售后、R&D 或案例中可以直接用于沟通的事实；
2. 类似客户、砍价、犹豫、已读不回、质量顾虑、MOQ、样品单等 SOP；
3. 可以直接转化成英文 WhatsApp 或 Email 的话术方向。

只输出和本次销售动作有关的知识库要点。`;
}

/* ── Prompt ── */

// 业务身份从 [src/config/company.ts] 注入。
// QZT 默认值在那里；其他公司用户改 COMPANY profile 即可，不动这个文件。
const COMPANY_CONTEXT = `${COMPANY.brandName} company context:

${COMPANY.productContextEn}`;

const CHAT_ROLE_RULES = `Chat role parsing rules:
- If the chat history contains "Customer:", "[Customer]", or similar labels, those lines are the customer's words.
- If the chat history contains "Me:", "[Me]", "I said", or similar labels, those lines are the salesperson's words.
- Never treat "Me" messages as customer needs, objections, or intent.
- Continue the conversation from the latest Customer message and avoid repeating what Me already said.
- If the latest message is from Me, analyze whether a follow-up is needed before drafting.`;

function buildSystemPrompt(mode: CopyMode, isWhatsApp: boolean): string {
  const sharedRules = `You are ${COMPANY.brandName}'s senior B2B foreign trade sales assistant.

${COMPANY_CONTEXT}

${COMPANY.hardLocationRulesEn}

${CHAT_ROLE_RULES}

Hard rules:
1. Use the company RAG context first. If a concrete product, price, MOQ, certification, delivery time, or policy is not in the context or user input, do not invent it.
2. Avoid generic AI copy. Every output must connect to the client background, chat log, goal, or company evidence.
3. Customer-facing messages must be in clear international English with short sentences. Avoid idioms, slang, flowery adjectives, and long nested clauses.
4. Use a practical sales tone: confident, human, specific, and low-pressure.
5. Return only valid JSON. Do not wrap it in markdown.`;

  if (mode === 'chat_reply') {
    return `${sharedRules}

Mode: AI foreign trade sales partner for WhatsApp / Alibaba chat.
Output three reply options:
- version1: "[策略简析]: ..." plus a customer-facing reply. Focus: efficient and direct.
- version2: "[策略简析]: ..." plus a customer-facing reply. Focus: relationship and trust.
- version3: "[策略简析]: ..." plus a customer-facing reply. Focus: consultant/expert angle.
All customer-facing replies must be in English and suitable for instant chat.`;
  }

  if (mode === 'maintenance') {
    return `${sharedRules}

Mode: Senior B2B customer relationship and communication expert.
Analyze the Customer/Me chat history and output:
- version1: Chinese [Interaction Analysis] + [Maintenance Strategy]. Identify customer sentiment, hidden needs, relationship stage, and what Me should avoid repeating.
- version2: WhatsApp Option A, concise and warm. Customer-facing English only.
- version3: WhatsApp Option B/C, more consultative and value-driven. Customer-facing English only.
Adapt to sales phase from the user's objective if provided:
- Pre-sales: share useful insight, reduce perceived risk, uncover needs.
- In-sales: reassure, keep process transparent, remove friction, update proactively.
- Post-sales: support usage/delivery, ask feedback, create long-term retention.
Relationship comes before transaction. Do not sound pushy. Use light professional emojis only when natural.`;
  }

  if (mode === 'closing') {
    return `${sharedRules}

Mode: Endgame closing strategist.
Output:
- version1: Chinese report with sections 【原因分析】, 【下一步行动指示】, 【逼单策略与技巧】.
- version2: a ready-to-send English WhatsApp closing script with timing and purpose.
- version3: a ready-to-send English Email closing script with subject line and body.
Be direct, sharp, and operational.`;
  }

  if (mode === 'mentor') {
    return `${sharedRules}

Mode: B2B Trade Mentor for a new foreign trade salesperson.
Output:
- version1: Chinese Detailed Action Plan covering Diagnosis, Action & Salvage Strategy, Review & Summarize, Prevention & Improvement.
- version2: ready-to-use English customer scripts for the next action.
- version3: [SOP Library Record] only if the case has reusable learning value. If not, write "No SOP record needed" and explain briefly.
Teach like a patient senior mentor.`;
  }

  return `${sharedRules}

Mode: personalized cold outreach.

${COMPANY.clientAnalysisStepsEn}

${COMPANY.proofPointMenuEn}

Per-version tone (still differs):
${isWhatsApp
  ? '- version1: efficient direct, under 75 words. Open with the most relevant proof point.\n- version2: relationship-first, under 75 words. Acknowledge their business / current move first, then proof point.\n- version3: consultant-style, under 95 words. Offer one market insight or specific product recommendation.'
  : '- version1: professional email body, 90-160 words. Open with the most relevant proof point.\n- version2: short email body, 60-100 words. Single proof point, tight.\n- version3: very concise follow-up style email or LinkedIn-style note, 40-80 words.\nAlso include 2-3 subject_lines, each tied to a different angle from your 3 versions.'}

Universal rules for the actual text:
- Translate every company advantage into "what it means for the customer's business", never just list features.
- Customer-facing copy in clear international English, short sentences.
- Goal: get a REPLY, not close a sale.
- Don't use the words "leverage" / "synergy" / "robust" / "comprehensive solution" / "cutting-edge" — these scream AI.`;
}

function buildUserPrompt(
  payload: CopywritingPayload,
  ragContext: string,
  sheetContext: string
): string {
  const {
    channel,
    mode = 'chat_reply',
    sales_person = '',
    customer_company: rawCompany = '',
    customer_industry: industry = '',
    core_advantage = '',
    customer_background = '',
    my_goal = '',
    style_preference = '',
    language = 'English',
  } = payload;

  const channelLabel = channel === 'whatsapp' ? 'WhatsApp' : 'Email';
  const company = rawCompany || 'Current customer';

  return `Create sales output for ${COMPANY.brandName}.

[Mode] ${mode}
[Channel] ${channelLabel}
[Output language for customer-facing messages] ${language}
[Sender] ${sales_person || COMPANY.salesPersonLabel}
[Client Company] ${company}
[Client Industry] ${industry || 'Unknown'}
[My Goal / Current Blocker] ${my_goal || 'Start a useful conversation and get a reply.'}
[My Speaking Style] ${style_preference || 'Short, direct, clear, natural English.'}
[Client Background / Chat Log]
${customer_background || 'No extra background provided.'}

[Critical Chat Role Reminder]
Customer means the buyer/client. Me means the ${COMPANY.brandName} salesperson. Analyze them separately and never confuse the two roles.

[User Added Company Advantage]
${core_advantage || 'No extra advantage provided.'}

[Company Bot RAG Answer - use first]
${ragContext || 'No bot RAG answer available. Use only user input and sheet context.'}

[Fallback Sheet KB Snippets]
${sheetContext || 'No fallback sheet snippets available.'}

Return JSON exactly in this shape:
{
  "version1": "string",
  "version2": "string",
  "version3": "string",
  "subject_lines": ${channel === 'email' ? '["string", "string", "string"]' : 'null'}
}`;
}

function getVersionLabels(mode: CopyMode, isWhatsApp: boolean): string[] {
  if (mode === 'chat_reply') {
    return ['回复方案A：高效直接', '回复方案B：关系优先', '回复方案C：顾问姿态'];
  }
  if (mode === 'closing') {
    return ['原因分析与行动指示', 'WhatsApp 逼单话术', 'Email 逼单话术'];
  }
  if (mode === 'mentor') {
    return ['Detailed Action Plan', '下一步客户话术', 'SOP Library Record'];
  }
  if (mode === 'maintenance') {
    return ['互动分析与维护策略', '维护回复A：温和简短', '维护回复B：顾问价值'];
  }
  return isWhatsApp
    ? ['高效直接型', '关系破冰型', '顾问价值型']
    : ['专业详细版', '简洁高效版', '轻量跟进版'];
}

function extractCopyJson(raw: string): {
  version1: string;
  version2: string;
  version3: string;
  subject_lines: string[] | null;
} {
  const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*"version1"[\s\S]*"version2"[\s\S]*\}/);
  const candidate = jsonMatch ? jsonMatch[0] : cleaned;

  try {
    const parsed = JSON.parse(candidate);
    return {
      version1: parsed.version1 || '',
      version2: parsed.version2 || '',
      version3: parsed.version3 || '',
      subject_lines: Array.isArray(parsed.subject_lines) ? parsed.subject_lines : null,
    };
  } catch {
    return {
      version1: raw,
      version2: '',
      version3: '',
      subject_lines: null,
    };
  }
}

/* ── 直接调用 aihubmix 文案生成 ── */

async function callCopyDirectly(
  apiKey: string,
  baseUrl: string,
  payload: CopywritingPayload
): Promise<CopywritingResponse> {
  const mode: CopyMode = payload.mode || 'chat_reply';
  const contactChannel = payload.channel;
  const isWhatsApp = contactChannel === 'whatsapp';
  const model = COPY_MODEL;

  try {
    const ragQuestion = buildRagQuestion(payload);
    const kbKeywords = [
      payload.customer_industry || '',
      payload.my_goal || '',
      COMPANY.brandName,
      COMPANY.industryEn,
      'SOP sales warehouse certification',
    ]
      .filter(Boolean)
      .join(' ');

    const [ragContext, sheetContext] = await Promise.all([
      fetchBotContext(ragQuestion),
      fetchKBContext(kbKeywords),
    ]);

    // 重试逻辑：AIHubMix / 网络偶发 5xx/429/超时常见，刷新就好的那种。
    // 这里加 2 次重试 + 指数退避，避免用户看到"服务器错误"再手动重试。
    const requestBody = JSON.stringify({
      model,
      messages: [
        { role: 'system', content: buildSystemPrompt(mode, isWhatsApp) },
        { role: 'user', content: buildUserPrompt(payload, ragContext, sheetContext) },
      ],
      temperature: mode === 'outreach' ? 0.45 : 0.3,
      max_tokens: 5000,
      stream: false,
    });

    const MAX_ATTEMPTS = 3;
    let res: Response | null = null;
    let lastDetail = '';
    let raw = '';
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        res = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: requestBody,
          signal: AbortSignal.timeout(120_000),
        });
      } catch (fetchErr: any) {
        // 网络层异常（超时、TLS、连接重置等）：可重试
        lastDetail = `网络异常: ${fetchErr?.message || 'fetch failed'}`;
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 600 * attempt));
          continue;
        }
        break;
      }

      // 5xx 或 429：可重试
      if (res.status === 429 || res.status >= 500) {
        const text = await res.text().catch(() => '');
        lastDetail = `API ${res.status} ${text.slice(0, 160)}`;
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 600 * attempt));
          continue;
        }
        break;
      }

      // 其他 4xx：不重试，直接报错
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { success: false, detail: `API 调用失败 (${res.status}) ${text.slice(0, 160)}`, copy: '', versions: [], subject_lines: null, model_used: model, channel: contactChannel };
      }

      const data = await res.json().catch(() => null);
      raw = data?.choices?.[0]?.message?.content || '';
      if (raw) break;
      // 空响应也算瞬时问题，可以再试一次
      lastDetail = 'AI 返回内容为空';
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }

    if (!raw) {
      return { success: false, detail: lastDetail || 'AI 返回内容为空', copy: '', versions: [], subject_lines: null, model_used: model, channel: contactChannel };
    }

    const parsed = extractCopyJson(raw);
    const labels = getVersionLabels(mode, isWhatsApp);
    const versionContents = [parsed.version1, parsed.version2, parsed.version3].filter(Boolean);
    const versions = (versionContents.length ? versionContents : [raw]).map((content, index) => ({
      version: labels[index] || `版本 ${index + 1}`,
      content,
      channel: contactChannel,
    }));

    return {
      success: true,
      copy: versionContents[0] || raw,
      versions,
      subject_lines: parsed.subject_lines,
      model_used: model,
      channel: contactChannel,
    };
  } catch (err: any) {
    return { success: false, detail: `文案生成失败: ${err.message}`, copy: '', versions: [], subject_lines: null, model_used: model, channel: contactChannel };
  }
}
