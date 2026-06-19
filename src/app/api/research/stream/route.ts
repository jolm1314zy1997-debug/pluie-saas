import { NextRequest } from 'next/server';
import { buildKbContextForLead, type KbContext } from '@/lib/qztKb';
import { COMPANY } from '@/config/company';
import { BRAND } from '@/config/brand';

// 必须用 Node.js runtime + Fluid Compute（vercel.json）才能撑住 AI 联网搜索。
// Edge runtime 会让 Jina + AIHubMix 整体超 30s 被 Vercel 砍掉，导致 504。
export const runtime = 'nodejs';
export const maxDuration = 300;

const AIHUBMIX_BASE_URL = 'https://api.aihubmix.com/v1';
const RESEARCH_MODEL = 'gemini-3-flash-preview-search';
const JINA_BASE_URL = 'https://r.jina.ai';

// Jina / AI 单步超时，避免边缘服务卡住整个流
const JINA_TIMEOUT_MS = 25_000;
const AI_TIMEOUT_MS = 180_000;

/**
 * AI 深度调查 API - 真流式 SSE 输出
 * 关键点：
 *   1. 先回 SSE 头，再做长任务（Jina + AI），避免 Vercel 判定无响应 → 504。
 *   2. 每个阶段都发一条 event，前端可以看到进度。
 *   3. Jina / AI 失败时返回降级背调，不要整段 502。
 */
export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: '请求体解析失败' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { website, company_name, country, background_info, api_key } = body;
  const mode: 'fast' | 'full' = body?.mode === 'fast' ? 'fast' : 'full';
  const apiKey = api_key || process.env.AIHUBMIX_API_KEY || '';

  if (!apiKey) {
    return new Response(JSON.stringify({ error: '请先配置 API Key' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!website) {
    return new Response(JSON.stringify({ error: '缺少 website 参数' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: Record<string, any>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      const done = () => {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      };

      try {
        // 立刻发一条事件，让连接被前端确认，避免长任务期间被中间层判超时
        send({ event: 'started', message: '正在初始化深度调查...' });
        send({ event: 'mode', mode });

        // Step 1: Jina Reader 抓取多个关键页面（home / contact / about）+ 并发拉公司知识库
        send({ event: 'fetching_website', message: `抓取官网多页内容（首页 + Contact + About）+ 加载${COMPANY.kb.label}...` });
        let homeMarkdown = '';
        let jinaFailed = false;
        // 并发：官网抓取 + KB 上下文构建，互不依赖
        const kbPromise = buildKbContextForLead({ country, companyName: company_name }).catch(
          (err) => {
            console.warn('[research] KB load failed:', (err as any)?.message);
            return { text: '', citations: [], available: false } as KbContext;
          }
        );
        try {
          homeMarkdown = await multiPageFetch(website);
        } catch {
          jinaFailed = true;
        }
        if (!homeMarkdown) jinaFailed = true;
        const kbContext: KbContext = await kbPromise;
        if (kbContext.available) {
          send({ event: 'kb_loaded', message: `已加载${COMPANY.kb.label}（${kbContext.citations.length} 个切片）` });
        } else {
          send({ event: 'kb_warning', message: `${COMPANY.kb.label}加载失败，谈判策略将不带内部数据` });
        }

        const regexEmails = extractEmails(homeMarkdown);
        const regexPhones = extractPhones(homeMarkdown);
        const regexLinkedIn = extractLinkedIn(homeMarkdown);
        // 关键：从 markdown 里直接提 wa.me / api.whatsapp.com 链接，这才是真 WhatsApp
        const regexWhatsApps = extractWhatsAppFromMarkdown(homeMarkdown);

        if (jinaFailed) {
          send({
            event: 'website_warning',
            message: '官网抓取失败或为空，将仅基于联网搜索生成背调',
          });
        } else {
          send({
            event: 'website_fetched',
            message: `已抓取 ${homeMarkdown.length} 字符，正则命中 ${regexEmails.length} 邮箱 / ${regexPhones.length} 电话 / ${regexWhatsApps.length} WhatsApp`,
          });
        }

        // Step 2: 调用 AIHubMix（带超时）
        send({ event: 'ai_analyzing', message: '调用 AI 联网搜索 + 背调分析...' });

        const prompt = buildPrompt(
          company_name,
          website,
          country,
          background_info,
          homeMarkdown,
          regexEmails,
          regexPhones,
          regexLinkedIn,
          regexWhatsApps,
          kbContext
        );

        let aiResult: any = {};
        let aiFailed = false;
        let aiErrorMsg = '';
        try {
          const aiContent = await callAiHubMix(apiKey, prompt);
          if (aiContent) {
            const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              try {
                aiResult = JSON.parse(jsonMatch[0]);
              } catch (e) {
                console.error('[Stream Research] JSON parse error:', e);
              }
            }
          }
          if (!aiResult || Object.keys(aiResult).length === 0) {
            aiFailed = true;
            aiErrorMsg = 'AI 返回内容为空或非合法 JSON';
          }
        } catch (err: any) {
          aiFailed = true;
          aiErrorMsg = err?.message || 'AI 调用失败';
          console.error('[Stream Research] AI error:', aiErrorMsg);
        }

        if (aiFailed) {
          send({
            event: 'ai_warning',
            message: `AI 背调失败：${aiErrorMsg}。已切换为降级报告，可稍后重试。`,
          });
        }

        // Step 3: 组装 contacts 数组 + 服务端交叉验证（防 AI 幻觉）
        send({ event: 'verifying', message: '交叉验证联系方式（域名匹配 + MX 记录 + 公司真实性）...' });
        const rawContacts = buildContactsArray(
          aiResult,
          regexEmails,
          regexPhones,
          regexLinkedIn,
          regexWhatsApps
        );
        const verifyOut = await verifyContacts(
          rawContacts,
          homeMarkdown,
          website,
          company_name,
          { skipUrlAlive: mode === 'fast' },
        );
        const contactsArray = verifyOut.contacts;
        let websiteReality = verifyOut.websiteReality;
        if (websiteReality.suspicious) {
          send({ event: 'website_reality_warning', message: websiteReality.note });
        }

        // Step 4: 爬虫扩展——用已验证的邮箱反查关联站点 + 用公司域名搜第三方提及
        // 速搜模式下整段跳过，省 ~25s
        let relatedSites: RelatedSite[] = [];
        // 第三方源置信度：
        //   - 'high'    = 找到第三方提及（公司在外部世界确实留下痕迹）
        //   - 'low'     = 跑了 domain mentions 但 0 命中（公司可能是新成立/极小，或 AI 编造）
        //   - 'unknown' = 速搜模式没跑 / 调用全部失败 / 没跑公司名搜索
        let thirdPartyConfidence: 'high' | 'low' | 'unknown' = 'unknown';
        let domainMentionsAttempted = false;
        let domainMentionsHits = 0;
        if (mode !== 'fast') {
        try {
          let primaryDomain = '';
          try {
            primaryDomain = new URL(website).hostname.replace(/^www\./, '');
          } catch {}

          if (primaryDomain) {
            send({ event: 'expanding', message: '爬虫扩展：邮箱反查 + 第三方提及搜索...' });

            // 优先用已"在官网内容里出现过"的邮箱，且只取头 2 个，控制成本
            const trustedEmails = contactsArray
              .filter((c) => c.type === 'email' && c.verified)
              .map((c) => String(c.value).toLowerCase())
              .slice(0, 2);

            const expansionTasks: Array<Promise<RelatedSite[]>> = [];
            for (const email of trustedEmails) {
              expansionTasks.push(searchEmailFootprint(email, primaryDomain, apiKey));
            }
            // 公司域名第三方提及（不依赖邮箱，独立线索）
            let domainMentionsTaskIndex = -1;
            if (company_name) {
              domainMentionsTaskIndex = expansionTasks.length;
              expansionTasks.push(searchDomainMentions(company_name, primaryDomain, apiKey));
              domainMentionsAttempted = true;
            }

            const results = await Promise.allSettled(expansionTasks);
            const all: RelatedSite[] = [];
            for (const r of results) {
              if (r.status === 'fulfilled') all.push(...r.value);
            }
            // 跨任务再去一次重（同域名只保留一条）
            const seen = new Set<string>();
            for (const item of all) {
              if (seen.has(item.domain) || item.domain === primaryDomain) continue;
              seen.add(item.domain);
              relatedSites.push(item);
            }

            // 第三方源置信度：基于 searchDomainMentions（独立于邮箱的纯公司名查询）的结果
            // - 任务 rejected 或 throw → 留 'unknown'，不下结论
            // - 任务 fulfilled 但返回 0 条 → 'low'（公司在外部世界没有公开痕迹）
            // - 任务 fulfilled 返回 ≥1 条 → 'high'
            if (domainMentionsAttempted && domainMentionsTaskIndex >= 0) {
              const r = results[domainMentionsTaskIndex];
              if (r.status === 'fulfilled') {
                domainMentionsHits = r.value.length;
                thirdPartyConfidence = domainMentionsHits > 0 ? 'high' : 'low';
              }
            }
          }
        } catch (err: any) {
          console.warn('[research] expansion failed:', err?.message);
        }
        }

        // 第三方源缺失时：升级 websiteReality 风险，让前端打"低存在性置信"标
        // 但只有 markdown 还算正常（没在前面已经被标 suspicious）才追加 —— 否则双重否定容易让用户困惑
        if (
          thirdPartyConfidence === 'low' &&
          !websiteReality.suspicious &&
          !jinaFailed &&
          homeMarkdown.length >= 200
        ) {
          websiteReality = {
            suspicious: true,
            note: `未在任何第三方源（行业目录 / 展会 / 经销网 / LinkedIn / 新闻 PR）找到「${company_name || '该公司'}」的提及——这家可能是规模极小的小店或刚成立的新公司，也可能是 AI 编造。建议先人工核验官网真实性再发开发信。`,
          };
          send({ event: 'website_reality_warning', message: websiteReality.note });
        }

        const resultObject = {
          contacts: contactsArray,
          deep_profile:
            aiResult.deep_profile ||
            generateFallbackProfile(
              company_name,
              website,
              country,
              background_info,
              aiResult,
              { jinaFailed, aiFailed, aiErrorMsg }
            ),
          company_info: aiResult.company_info || {
            name: company_name,
            type: 'Unknown',
            background: background_info || '',
          },
          key_executives: aiResult.key_executives || [],
          // 新增 7 个结构化字段——找不到时返回 undefined，前端按需隐藏卡片
          business_profile: aiResult.business_profile || null,
          hot_sellers: Array.isArray(aiResult.hot_sellers) ? aiResult.hot_sellers : [],
          decision_maker: aiResult.decision_maker || null,
          software_ecosystem: aiResult.software_ecosystem || null,
          compliance_risk: aiResult.compliance_risk || null,
          competitive_position: aiResult.competitive_position || null,
          supplier_change_signals: Array.isArray(aiResult.supplier_change_signals)
            ? aiResult.supplier_change_signals
            : [],
          negotiation_playbook: Array.isArray(aiResult.negotiation_playbook)
            ? aiResult.negotiation_playbook
            : [],
          related_sites: relatedSites,
          website_reality: websiteReality,
          third_party_confidence: thirdPartyConfidence,
          third_party_mentions_count: domainMentionsHits,
          research_mode: mode,
          degraded: jinaFailed || aiFailed,
        };

        send({ object: resultObject });
        done();
      } catch (error: any) {
        console.error('[Stream Research] Fatal:', error);
        send({ event: 'error', error: error?.message || '深度调查失败' });
        done();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

/* ────────────── 辅助 ────────────── */

/* ─────────── 邮箱反向搜索 + 域名外站提及（爬虫扩展） ─────────── */

export interface RelatedSite {
  domain: string;
  url: string;
  title: string;
  snippet: string;
  /** 触发这个站点被找到的依据：哪个邮箱 / 哪个查询命中的 */
  matched_via: string;
}

/**
 * 反查一个邮箱：找全网上还有哪些站点列出了这个邮箱（排除自家域名）。
 * 业务员说"一个邮箱往往关联好几个独立站"，这就是挖那条线。
 *
 * 用 AIHubMix 的 gemini-3-flash-preview-search 模型（自带联网搜索）。
 * 失败不阻断主流程，返回空数组。
 */
async function searchEmailFootprint(
  email: string,
  primaryDomain: string,
  apiKey: string
): Promise<RelatedSite[]> {
  const prompt = `请用联网搜索查找下面邮箱在互联网上的所有公开出现位置（**除了** ${primaryDomain} 本身及其子域名）：

邮箱：${email}

任务：
- 在 Google / Bing 搜索 "${email}"，找出第三方站点（行业目录、B2B 平台、新闻、博客、供应商名录、社媒等）
- 重点关注：可能是同一公司的姐妹品牌 / 独立站、行业经销商网络、B2B 黄页、其他公司列出该邮箱当联系人
- 排除：${primaryDomain} 自身、Google 缓存、Wayback Machine、PDF 索引器、爬虫站点

输出格式（**只输出 JSON 数组，不要 \`\`\`json 标记或任何其他文字**）：
[
  {
    "domain": "example.com",
    "url": "https://example.com/contact",
    "title": "页面标题",
    "snippet": "页面里和邮箱相关的一句中文摘要（不超过 60 字）"
  }
]

要求：
- 最多 6 条
- 同一域名只返回一条（保留最有代表性的页面）
- 找不到就返回 []`;

  try {
    const content = await callAiHubMixSimple(apiKey, prompt, 50_000);
    return parseRelatedSitesJson(content, email).slice(0, 6);
  } catch (err) {
    console.warn('[searchEmailFootprint] error:', (err as any)?.message);
    return [];
  }
}

/**
 * 根据公司域名，找第三方站点是否提及该公司（行业目录、展会、合作伙伴名单等）。
 * 这种站点往往会列出公司更多的邮箱 / 电话 / 决策人信息。
 */
async function searchDomainMentions(
  companyName: string,
  primaryDomain: string,
  apiKey: string
): Promise<RelatedSite[]> {
  const prompt = `请用联网搜索查找以下公司在第三方站点上的提及（**不要返回** ${primaryDomain} 自身的页面）：

公司：${companyName}
官网域名：${primaryDomain}

请重点搜索：
- 行业目录 / B2B 黄页（Europages、Kompass、Made-in-China 经销商页等）
- 展会参展商名单（IFSEC、Sicur、Security Essen 等）
- 合作伙伴 / 经销商列表 / 授权代理页（某品牌的"Find a dealer"页可能列出他们）
- 新闻 / PR / 行业报道
- LinkedIn 公司页、Facebook 公司页、YouTube 频道
- 第三方评论 / 评分站点

参考查询：
- "${companyName}" site:europages.com
- "${companyName}" "distributor" OR "dealer"
- "${companyName}" exhibition OR trade show
- "${companyName}" linkedin

输出格式（**只输出 JSON 数组**）：
[
  {
    "domain": "europages.com",
    "url": "https://www.europages.com/...",
    "title": "页面标题",
    "snippet": "页面里和该公司相关的一句中文摘要（不超过 80 字，含为什么有用）"
  }
]

要求：
- 最多 6 条
- 同一域名只返回一条
- 优先选信息密度高的页面（含邮箱/电话/决策人姓名的页面优先）
- 找不到就返回 []`;

  try {
    const content = await callAiHubMixSimple(apiKey, prompt, 50_000);
    return parseRelatedSitesJson(content, companyName).slice(0, 6);
  } catch (err) {
    console.warn('[searchDomainMentions] error:', (err as any)?.message);
    return [];
  }
}

/**
 * 轻量 AIHubMix 调用：给 footprint / mentions 这类小任务用，比主调用更快。
 */
async function callAiHubMixSimple(apiKey: string, prompt: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${AIHUBMIX_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: RESEARCH_MODEL,
        messages: [
          { role: 'system', content: '你是 B2B 销售情报研究员，擅长联网搜索。只返回纯 JSON 数组，不加任何额外文字。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 2500,
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`AIHubMix ${res.status}`);
    const data = await res.json();
    return data?.choices?.[0]?.message?.content || '';
  } finally {
    clearTimeout(timer);
  }
}

function parseRelatedSitesJson(content: string, matchedVia: string): RelatedSite[] {
  if (!content) return [];
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  let arr: any = null;
  try {
    arr = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\[[\s\S]*\]/);
    if (!m) return [];
    try {
      arr = JSON.parse(m[0]);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  const out: RelatedSite[] = [];
  const seenDomains = new Set<string>();
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    let domain = String(item.domain || '').trim().toLowerCase().replace(/^www\./, '');
    const url = String(item.url || '').trim();
    const title = String(item.title || '').trim();
    const snippet = String(item.snippet || '').trim();
    if (!domain && url) {
      try {
        domain = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
      } catch {}
    }
    if (!domain || !url) continue;
    if (seenDomains.has(domain)) continue;
    seenDomains.add(domain);
    out.push({ domain, url, title, snippet, matched_via: matchedVia });
  }
  return out;
}

async function callAiHubMix(apiKey: string, prompt: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const res = await fetch(`${AIHUBMIX_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: RESEARCH_MODEL,
        messages: [
          {
            role: 'system',
            content:
              '你是 B2B 企业调查专家，有联网搜索能力。**最重要原则：宁缺毋滥**。禁止根据域名/公司名编造联系方式。每条返回的联系方式必须能说出来源（officia网页位置或搜索命中的 URL）。返回的 Facebook / LinkedIn 链接必须是真实见过的（拼写一致），不要构造看起来合理但不存在的 URL。只返回纯 JSON。',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 6000,
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`AI API ${res.status}: ${errText.slice(0, 200)}`);
    }
    const data = await res.json();
    return data?.choices?.[0]?.message?.content || '';
  } finally {
    clearTimeout(timer);
  }
}

// 接受 AI 返回的字符串或 {value, source} 对象，统一转成 {value, source}
function unpackContact(raw: any): { value: string; source: string | null } | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const v = raw.trim();
    if (!v) return null;
    return { value: v, source: null };
  }
  if (typeof raw === 'object') {
    const v = String(raw.value || raw.url || raw.link || raw.address || '').trim();
    if (!v) return null;
    const s = String(raw.source || raw.found_at || '').trim() || null;
    return { value: v, source: s };
  }
  return null;
}

function buildContactsArray(
  aiResult: any,
  regexEmails: string[],
  regexPhones: string[],
  regexLinkedIn: string[],
  regexWhatsApps: string[]
): any[] {
  const contacts: any[] = [];
  const aiContacts = aiResult.contacts || {};

  // ── Emails：合并 AI + regex（regex 命中说明确实在网页里出现过，可信度更高）
  const aiEmails = Array.isArray(aiContacts.emails)
    ? aiContacts.emails.map(unpackContact).filter(Boolean) as { value: string; source: string | null }[]
    : [];
  const regexEmailSet = new Set(regexEmails.map((e) => e.toLowerCase()));
  // 先放 regex 命中的（这些一定在 markdown 里），再放 AI 独有的
  regexEmails.slice(0, 5).forEach((email) => {
    contacts.push({ type: 'email', value: email, label: 'Email', source: 'website-markdown' });
  });
  aiEmails.slice(0, 5).forEach((c) => {
    if (regexEmailSet.has(c.value.toLowerCase())) return; // 已经被 regex 捕获
    contacts.push({ type: 'email', value: c.value, label: 'Email', source: c.source || 'ai-search' });
  });

  // ── Phones
  const aiPhones = Array.isArray(aiContacts.phones)
    ? aiContacts.phones.map(unpackContact).filter(Boolean) as { value: string; source: string | null }[]
    : [];
  regexPhones.slice(0, 3).forEach((phone) => {
    contacts.push({ type: 'phone', value: phone, label: 'Phone', source: 'website-markdown' });
  });
  const regexPhoneDigits = new Set(regexPhones.map((p) => p.replace(/\D/g, '')));
  aiPhones.slice(0, 3).forEach((c) => {
    if (regexPhoneDigits.has(c.value.replace(/\D/g, ''))) return;
    contacts.push({ type: 'phone', value: c.value, label: 'Phone', source: c.source || 'ai-search' });
  });

  // ── WhatsApp：regex 命中（wa.me / api.whatsapp.com 字面出现）放最前，AI 补充其余
  const regexWaDigits = new Set(regexWhatsApps.map((w) => w.replace(/\D/g, '')));
  regexWhatsApps.slice(0, 3).forEach((wa) => {
    contacts.push({ type: 'whatsapp', value: wa, label: 'WhatsApp', source: 'website-wa.me-link' });
  });
  const aiWhatsApps = Array.isArray(aiContacts.whatsapp)
    ? aiContacts.whatsapp.map(unpackContact).filter(Boolean) as { value: string; source: string | null }[]
    : [];
  aiWhatsApps.slice(0, 3).forEach((c) => {
    if (regexWaDigits.has(c.value.replace(/\D/g, ''))) return;
    contacts.push({ type: 'whatsapp', value: c.value, label: 'WhatsApp', source: c.source || 'ai-search' });
  });

  // ── LinkedIn
  const aiLinkedIn = unpackContact(aiContacts.linkedin);
  const linkedinValue = (regexLinkedIn[0] || aiLinkedIn?.value || '').trim();
  if (linkedinValue) {
    contacts.push({
      type: 'linkedin',
      value: linkedinValue,
      label: 'LinkedIn',
      source: regexLinkedIn[0] ? 'website-markdown' : aiLinkedIn?.source || 'ai-search',
    });
  }

  // ── 社交媒体（统一 Facebook / Twitter / Instagram）
  const socials: any[] = [];
  for (const key of ['facebook', 'twitter', 'instagram']) {
    const v = unpackContact(aiContacts[key]);
    if (v) socials.push({ type: key, ...v });
  }
  const fallbackSocial = Array.isArray(aiContacts.social_media) ? aiContacts.social_media : [];
  fallbackSocial.forEach((sm: any) => {
    const c = unpackContact(sm);
    if (!c) return;
    const lower = c.value.toLowerCase();
    const t = lower.includes('facebook') ? 'facebook'
      : lower.includes('twitter') || lower.includes('x.com') ? 'twitter'
      : lower.includes('instagram') ? 'instagram'
      : 'social';
    socials.push({ type: t, ...c });
  });
  socials.slice(0, 4).forEach((s) => {
    contacts.push({
      type: s.type,
      value: s.value,
      label: s.type === 'facebook' ? 'Facebook' : s.type === 'twitter' ? 'Twitter' : s.type === 'instagram' ? 'Instagram' : 'Social',
      source: s.source || 'ai-search',
    });
  });

  return contacts;
}

/* ─────────── 服务端交叉验证（防 AI 幻觉） ─────────── */

const GENERIC_EMAIL_PREFIXES = /^(info|sales|contact|admin|support|hello|office|mail|web|inquiry|inquiries|service)@/i;

// 从 URL / email 抠主域（去 www.）
function extractDomain(input: string): string {
  if (!input) return '';
  try {
    const u = input.includes('://') ? new URL(input) : new URL('http://' + input);
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function getEmailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 0) return '';
  return email.slice(at + 1).toLowerCase().trim();
}

/** 判定邮箱域名跟官网域名是不是"同一家" */
function domainsMatch(emailDomain: string, websiteDomain: string): boolean {
  if (!emailDomain || !websiteDomain) return false;
  const ed = emailDomain.replace(/^www\./, '');
  const wd = websiteDomain.replace(/^www\./, '');
  if (ed === wd) return true;
  if (ed.endsWith('.' + wd)) return true; // sales.acme.com vs acme.com
  if (wd.endsWith('.' + ed)) return true;
  return false;
}

/**
 * 查域名 MX 记录（DNS over HTTPS, Cloudflare 1.1.1.1）。
 * 返回：true=有 MX；false=没 MX 或 NXDOMAIN；null=查询失败（不下结论）
 */
async function hasMxRecord(domain: string): Promise<boolean | null> {
  if (!domain) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(
      `https://1.1.1.1/dns-query?name=${encodeURIComponent(domain)}&type=MX`,
      { headers: { Accept: 'application/dns-json' }, signal: ctrl.signal }
    );
    clearTimeout(t);
    if (!res.ok) return null;
    const data: any = await res.json().catch(() => null);
    if (!data) return null;
    if (data.Status !== 0) return false; // 3 = NXDOMAIN 等
    return Array.isArray(data.Answer) && data.Answer.length > 0;
  } catch {
    return null;
  }
}

/**
 * 检查公司真实性：把公司名拆成几个有意义的 token，看抓到的 markdown 里是否出现。
 * 完全不出现 → 高度怀疑 AI 给的"官网"其实是别人的页面 / parking 页 / 跟这家公司无关
 */
function checkCompanyMentionInMarkdown(companyName: string, markdown: string): boolean {
  if (!companyName || !markdown) return false;
  const md = markdown.toLowerCase();
  // 拆词：去掉常见公司后缀，留有意义的 token
  const cleaned = companyName
    .toLowerCase()
    .replace(/\b(srl|s\.r\.l\.|ltd|limited|llc|inc|gmbh|sarl|sas|spa|s\.p\.a\.|co|company|corp|corporation|ag|bv|ab|oy|kg)\b/g, ' ')
    .replace(/[^a-z0-9一-鿿 ]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3);
  if (cleaned.length === 0) return false;
  // 任意一个 token 出现在 markdown 里就算"被提及"
  return cleaned.some((t) => md.includes(t));
}

async function verifyContacts(
  contacts: any[],
  markdown: string,
  website: string,
  companyName: string,
  opts: { skipUrlAlive?: boolean } = {},
): Promise<{ contacts: any[]; websiteReality: { suspicious: boolean; note: string } }> {
  const skipUrlAlive = opts.skipUrlAlive === true;
  const md = markdown.toLowerCase();
  const websiteDomain = extractDomain(website);

  // ── 公司真实性预检 ──
  let websiteReality = { suspicious: false, note: '' };
  if (!markdown || markdown.length < 200) {
    websiteReality = {
      suspicious: true,
      note: '官网抓取失败或内容极少（可能是 parking 域 / 死链），AI 给的公司信息可能整段都不可靠',
    };
  } else if (companyName && !checkCompanyMentionInMarkdown(companyName, markdown)) {
    websiteReality = {
      suspicious: true,
      note: `抓到的官网内容里完全没找到「${companyName}」相关字样，AI 给的官网域名可能不属于这家公司——所有联系方式都建议二次人工核验`,
    };
  }

  // 所有合法长度的电话/WhatsApp 数字串，给后面做"子串=碎片"判定用
  const allLongPhoneDigits = Array.from(
    new Set(
      contacts
        .filter((c) => c.type === 'phone' || c.type === 'whatsapp')
        .map((c) => String(c.value).replace(/\D/g, ''))
        .filter((d) => d.length >= 9 && d.length <= 15)
    )
  );

  // ── 提前并发跑：URL HEAD 校验 + 所有邮箱域名的 MX 查询（去重）──
  const urlChecksPromise = Promise.all(
    contacts.map(async (c) => {
      if (skipUrlAlive) return null;
      if (['linkedin', 'facebook', 'twitter', 'instagram', 'social'].includes(c.type)) {
        return await checkUrlAlive(c.value);
      }
      return null;
    })
  );
  const emailDomains = Array.from(
    new Set(
      contacts
        .filter((c) => c.type === 'email')
        .map((c) => getEmailDomain(String(c.value)))
        .filter(Boolean)
    )
  );
  const mxResults = await Promise.all(emailDomains.map((d) => hasMxRecord(d)));
  const mxByDomain = new Map<string, boolean | null>();
  emailDomains.forEach((d, i) => mxByDomain.set(d, mxResults[i]));
  const urlChecks = await urlChecksPromise;

  const verifiedContacts = contacts.map((c, i) => {
    const out = { ...c };

    if (c.type === 'email') {
      const value = String(c.value);
      const inMarkdown = md.includes(value.toLowerCase());
      const emailDomain = getEmailDomain(value);
      const domainOk = domainsMatch(emailDomain, websiteDomain);
      const mx = mxByDomain.get(emailDomain);

      // 综合判定（按严格度从低到高）
      const notes: string[] = [];
      let verified = false;

      if (mx === false) {
        // 域名无 MX 记录——这条邮箱**理论上无法收信**，等同失效
        out._suspicious = true;
        notes.push('该邮箱域名查不到 MX 记录（无邮件服务），发邮件会被退回');
      }

      if (!domainOk && emailDomain && websiteDomain) {
        // 邮箱域名跟官网不一致——AI 大概率搞混了
        notes.push(`邮箱域名 @${emailDomain} 跟官网 ${websiteDomain} 不匹配，可能不是该公司官方邮箱`);
        if (GENERIC_EMAIL_PREFIXES.test(value)) {
          // 通用前缀 + 域名不匹配 → 高度可疑
          out._suspicious = true;
        }
      }

      if (inMarkdown && domainOk && mx !== false) {
        verified = true;
        notes.unshift('官网内容里直接出现 + 域名匹配 + MX 存在');
      } else if (inMarkdown && mx !== false) {
        // 在 markdown 里出现，但域名不一定匹配（可能是其他公司的合作邮箱）
        verified = false;
        notes.unshift('官网里出现过但域名跟官网不一致，发起前先核实是不是公司直属邮箱');
      } else if (GENERIC_EMAIL_PREFIXES.test(value) && !inMarkdown) {
        // 通用前缀 + 不在 markdown → AI 按域名瞎编
        out._suspicious = true;
        notes.unshift('官网未找到 + info/sales 这类通用前缀，AI 大概率按域名瞎编的');
        verified = false;
      } else {
        verified = false;
        notes.unshift('官网未交叉确认');
      }

      out.verified = verified;
      out.verificationNote = notes.join('；');
    } else if (c.type === 'phone') {
      const digits = String(c.value).replace(/\D/g, '');
      // 长度卡 9-15（E.164 国际标准），太短的丢掉——之前 7 位会让真号尾段被当成独立号
      if (digits.length < 9 || digits.length > 15) {
        out._suspicious = true;
        out.verified = false;
        out.verificationNote = '号码长度不合法（少于 9 位或超过 15 位），可能是从真号截取的碎片';
      } else if (allLongPhoneDigits.some((longer) => longer !== digits && longer.length > digits.length && longer.includes(digits))) {
        // 是另一个更长号码的子串 → 100% 是碎片
        out._suspicious = true;
        out.verified = false;
        out.verificationNote = '是更长真号码的尾段（碎片），已丢弃';
      } else {
        const inMarkdown = md.replace(/\D/g, '').includes(digits);
        out.verified = inMarkdown;
        if (inMarkdown) out.verificationNote = '官网内容里出现';
        else out.verificationNote = '官网未交叉确认，建议先打电话确认';
      }
      // 公司真实性存疑时，所有电话也降级
      if (websiteReality.suspicious) out.verified = false;
    } else if (c.type === 'whatsapp') {
      const digits = String(c.value).replace(/\D/g, '');
      if (digits.length < 8 || digits.length > 15) {
        out._suspicious = true;
        out.verified = false;
        out.verificationNote = '号码格式不合法';
      } else if (c.source === 'website-wa.me-link') {
        out.verified = true;
        out.verificationNote = '官网有 wa.me 链接，可直接发起';
      } else if (md.includes('wa.me') || md.includes('whatsapp')) {
        // 官网提到了 WhatsApp，但具体号码不是从 wa.me 提取的
        out.verified = false;
        out.verificationNote = '官网提到 WhatsApp，但该号码未直接出现，发起前最好先核实';
      } else {
        out.verified = false;
        out.verificationNote = '官网未发现 WhatsApp 字样，号码可能是 AI 猜测，发起前先在 WhatsApp 里搜一下号码';
        out._suspicious = true;
      }
    } else if (['linkedin', 'facebook', 'twitter', 'instagram', 'social'].includes(c.type)) {
      const alive = urlChecks[i];
      const inMarkdown = md.includes(String(c.value).toLowerCase());
      if (alive === true && inMarkdown) {
        out.verified = true;
        out.verificationNote = '链接可访问，且官网有出现';
      } else if (alive === true) {
        out.verified = false;
        out.verificationNote = '链接可访问但官网未出现，建议人工核对';
      } else if (alive === false) {
        out.verified = false;
        out.verificationNote = '链接打不开或已失效，建议直接忽略';
        out._suspicious = true;
      } else {
        out.verified = false;
        out.verificationNote = '无法验证';
      }
    }
    return out;
  });

  const filtered = verifiedContacts.filter((c) => !c._suspicious || c.verified);
  return { contacts: filtered, websiteReality };
}

async function checkUrlAlive(url: string): Promise<boolean | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    // 先试 HEAD（很多站点（FB / LinkedIn）会 403 HEAD，所以失败要回退到 GET）
    let res = await fetch(url, {
      method: 'HEAD',
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': BRAND.botUserAgent },
    }).catch(() => null);
    if (!res || res.status >= 400) {
      res = await fetch(url, {
        method: 'GET',
        signal: ctrl.signal,
        redirect: 'follow',
        headers: { 'User-Agent': BRAND.botUserAgent },
      }).catch(() => null);
    }
    clearTimeout(t);
    if (!res) return false;
    // Facebook 对未登录返回 200 + login wall。这里 200/3xx 都视为活的（不能完美验证但能过滤明显死链）
    if (res.status >= 200 && res.status < 400) return true;
    // 404 / 410 → 死链
    if (res.status === 404 || res.status === 410) return false;
    return false;
  } catch {
    return null; // 网络抖动等，不下定论
  }
}

function generateFallbackProfile(
  companyName: string,
  website: string,
  country: string,
  backgroundInfo: string,
  aiResult: any,
  flags: { jinaFailed: boolean; aiFailed: boolean; aiErrorMsg: string }
): string {
  const companyInfo = aiResult.company_info || {};
  const executives = aiResult.key_executives || [];

  let profile = `## 公司实力综合评估\n`;
  profile += `- **公司名称**: ${companyInfo.name || companyName}\n`;
  profile += `- **类型**: ${companyInfo.type || 'Unknown'}\n`;
  profile += `- **国家**: ${country || '未知'}\n`;
  profile += `- **官网**: ${website}\n\n`;

  if (companyInfo.background) profile += `## 公司背景\n${companyInfo.background}\n\n`;
  if (backgroundInfo) profile += `## 已知信息\n${backgroundInfo}\n\n`;

  if (executives.length > 0) {
    profile += `## 关键人物\n`;
    executives.forEach((e: any) => {
      profile += `- **${e.name}** - ${e.title}${e.linkedin ? ` ([LinkedIn](${e.linkedin}))` : ''}\n`;
    });
    profile += '\n';
  }

  if (flags.jinaFailed || flags.aiFailed) {
    profile += `## ⚠️ 本次背调降级说明\n`;
    if (flags.jinaFailed) profile += `- 官网抓取失败，仅基于公开信息生成。\n`;
    if (flags.aiFailed) profile += `- AI 背调调用失败：${flags.aiErrorMsg}\n`;
    profile += `- 建议稍后重试，或先用上方联系方式人工跟进。\n\n`;
  }

  profile += `## 销售策略建议\n`;
  profile += `- 建议先通过官网 Contact 页面联系该公司\n`;
  profile += `- 重点介绍我司安防产品线（隐藏摄像头、录音设备、GPS追踪器等）\n`;
  profile += `- 强调产品品质认证和批发价格优势\n`;

  return profile;
}

/**
 * 同时抓首页 + /contact + /about（最多 3 页，并发，单页 18s 超时），把 markdown 拼起来。
 * 找联系方式时大部分公司都不会把 WhatsApp / 邮箱放首页 banner，
 * 真东西多藏在 Contact 页和 Footer 链接的子页。
 */
async function multiPageFetch(website: string): Promise<string> {
  const candidates = buildCandidatePaths(website);
  const results = await Promise.allSettled(candidates.map((u) => jinaFetch(u)));
  const chunks: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled' && r.value) {
      chunks.push(`<!-- page: ${candidates[i]} -->\n${r.value}`);
    }
  }
  return chunks.join('\n\n---\n\n').slice(0, 30000); // 给 AI 限个长度，避免吃 token 太凶
}

function buildCandidatePaths(website: string): string[] {
  try {
    const parsed = new URL(website);
    const root = `${parsed.protocol}//${parsed.host}`;
    return [website, `${root}/contact`, `${root}/about`];
  } catch {
    return [website];
  }
}

/**
 * 直接从 markdown 里抠 wa.me / api.whatsapp.com 链接，提取真实 WhatsApp 号码。
 * 凡是这里能抓到的，都是"网页里挂了 WhatsApp 链接"，最可信。
 */
function extractWhatsAppFromMarkdown(text: string): string[] {
  const out = new Set<string>();
  const patterns = [
    /(?:https?:\/\/)?(?:www\.|api\.)?wa\.me\/(\+?\d{8,15})/gi,
    /(?:https?:\/\/)?(?:api\.|web\.)?whatsapp\.com\/send\/?\?phone=(\+?\d{8,15})/gi,
    /(?:https?:\/\/)?(?:api\.)?whatsapp\.com\/message\/[A-Z0-9]+/gi, // 链接本身就是入口
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const digits = (m[1] || '').replace(/\D/g, '');
      if (digits.length >= 8) out.add('+' + digits);
    }
  }
  return Array.from(out).slice(0, 3);
}

async function jinaFetch(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), JINA_TIMEOUT_MS);
  try {
    const jinaUrl = `${JINA_BASE_URL}/${url}`;
    const res = await fetch(jinaUrl, {
      headers: {
        'Accept': 'application/json',
        'X-Return-Format': 'markdown',
      },
      signal: controller.signal,
    });
    if (!res.ok) return '';
    const data = await res.json();
    return data?.data?.content || data?.data?.markdown || '';
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

function extractEmails(text: string): string[] {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(emailRegex) || [];
  return Array.from(new Set(matches)).slice(0, 5);
}

function extractPhones(text: string): string[] {
  // 至少 9 位数字（E.164 国际标准最低长度）
  // 之前用 7 会把真号码的尾段抠成假号（比如 +39 06 2112 6458 会被截出 21126458 当成"独立电话"）
  const phoneRegex = /[\+\d\(\)\-\s]{9,22}/g;
  const matches = text.match(phoneRegex) || [];
  const cleaned = Array.from(new Set(matches))
    .map((p) => p.trim())
    .filter((p) => {
      const d = p.replace(/\D/g, '').length;
      return d >= 9 && d <= 15;
    })
    // 按位数从长到短排序，方便后面去子串
    .sort((a, b) => b.replace(/\D/g, '').length - a.replace(/\D/g, '').length);
  // 再过一道：如果某号码的数字是另一个更长号码的子串，丢掉它（是碎片）
  const finalDigits: string[] = [];
  const out: string[] = [];
  for (const p of cleaned) {
    const d = p.replace(/\D/g, '');
    if (finalDigits.some((longer) => longer.includes(d))) continue;
    finalDigits.push(d);
    out.push(p);
  }
  return out.slice(0, 3);
}

function extractLinkedIn(text: string): string[] {
  const linkedinRegex = /https:\/\/www\.linkedin\.com\/(?:company|in)\/[a-zA-Z0-9\-]+/g;
  const matches = text.match(linkedinRegex) || [];
  return Array.from(new Set(matches)).slice(0, 2);
}

function buildPrompt(
  companyName: string,
  website: string,
  country: string,
  backgroundInfo: string,
  homeMarkdown: string,
  regexEmails: string[],
  regexPhones: string[],
  regexLinkedIn: string[],
  regexWhatsApps: string[],
  kbContext?: KbContext
): string {
  const kbBlock = kbContext && kbContext.available
    ? `\n## 📚 ${COMPANY.kb.label}（核心约束）\n\n${kbContext.text}\n\n**negotiation_playbook 硬性要求**：每一条 angle 的 rationale 必须显式引用上面知识库里的至少 1 条具体事实（例如本公司仓位 / 发货时效 + 客户所在国家分层、砍价话术片段 + 该客户实际表现、AI Insight + 该客户暂未解决的痛点）。每条 opening_script_en 末尾要带一个真实可发的抓手——比如展厅地址、付款方式、具体型号 + 阶梯报价，让客户一眼觉得"这家供应商有备而来"。kb_citations 字段必须列出你引用了哪些条目（用 "kb:country-tier" / "kb:products" / "kb:bargain-script-2" / "kb:insight-1" 等短标签）。如果某一条 angle 编不出 KB 引用，重写这一条直到能引用为止。\n`
    : `\n## 📚 ${COMPANY.kb.label}\n\n（知识库本次加载失败，请基于通用 B2B 谈判经验 + 本公司核心卖点写策略，不要假装引用知识库条目。kb_citations 字段填空数组 []。）\n`;

  return `你是 B2B 企业调查专家，拥有联网搜索能力。这份背调要给中国外贸业务员做"临门一脚"用——他们看完你的报告就要直接给客户发开发信。所以你要交付的不是泛泛的画像，是**带数据、带证据、带话术**的销售情报。

之前的结果幻觉严重——AI 凭域名瞎编 info@ 邮箱、把座机当 WhatsApp、Facebook 链接打开 404。这次必须严格基于真实证据。

## 目标公司
- 名称: ${companyName || 'Unknown'}
- 官网: ${website}
- 国家: ${country || '未知'}
- 背景: ${backgroundInfo || '暂无'}

## 🔒 硬性规则（违反一次直接抛弃整段输出）

1. **禁止凭域名瞎猜邮箱**。比如 ${companyName} 域名是 example.com，**绝不允许**仅因"看起来合理"就返回 info@example.com / sales@example.com / contact@example.com。这类通用前缀邮箱**只有**在「已抓取内容」里能逐字找到，或联网搜索结果里有真实的来源 URL（公司官网截图 / Yellow Pages / Yelp 等）时才能返回。
2. **禁止把座机当 WhatsApp**。除非：
   - 「已抓取内容」里出现 \`wa.me/<号码>\` 或 \`api.whatsapp.com\` 链接
   - 联网搜索结果里能看到"WhatsApp +XX..."的明文
   - 不满足任何一条 → whatsapp 字段返回空数组 []
3. **禁止编造 Facebook / LinkedIn / Twitter 链接**。这些只能返回你在已抓取内容或搜索结果里见到的 URL（拼写一致）。**绝不**根据公司名编造 facebook.com/<公司名> 这种链接。
4. **每条联系方式必须带 source 字段**，写明在哪找到的（举例：'homepage footer'、'contact page'、'linkedin search'、'facebook bio'）。说不出来源就不要返回。
5. **宁缺毋滥**。找不到证据就留空 / 填"未公开获取"。错误信息比"没有信息"更糟，业务员被假数据骗一次就不信任系统了。

## 📊 结构化字段填写要求（违反一条整段重写）

- **business_profile.annual_revenue / net_profit**：必须从**公开财务披露**找（意大利 VAT / Companies House / Bundesanzeiger / Crunchbase / OpenCorporates 等），找不到就填 "未公开获取"。**严禁瞎猜**。如果找到要标年份。
- **hot_sellers**：从**官网产品页面 / 商店列表**真实抠出来 3-5 个；如果官网有 "saldi / promo / sconto / discount / sale / clearance" 字样或带删除线的旧价格，price_signal 必须捕获并解释意味（"€150 → €120 毛利被挤压" / "库存清仓" / "新品替代"）。
- **decision_maker**：优先从官网 "About / Team / Contatti / Chi siamo" 找名字；找不到时从客户评价/LinkedIn 反查。如果客户评价里反复提及一个名字（如 "Luca was very helpful"），就是负责人。\`personality_signal\` 给业务员看，1 句话总结性格（"技术专业、耐心" / "强势压价、要 sample" / "邮件秒回"）。
- **software_ecosystem.verdict**：看产品规格里有没有 "Tuya / Smart Life / V380 / Hik / OEM" 字样。OEM 公版 → 客户对供应链稳定性焦虑、对 GDPR 数据回传敏感，是销售切入点。
- **supplier_change_signals**：找①降价 ②促销字样 ③官网 "Out of Stock" ④近期 review 抱怨 ⑤新品节奏停滞。最多 4 条，找不到返回 []。
- **negotiation_playbook 必须 3 条**：每条要让业务员直接复制粘贴就能发出去。\`opening_script_en\` 是英文 WhatsApp / 邮件发给客户用，\`opening_script_zh\` 是给业务员自己看懂依据用。每条 \`angle\` 不能撞车。卖点角度参考下方 📚 公司知识库段（如发货时效、本地仓位、售后政策、认证合规、低 MOQ 样品、OEM 能力、阶梯价、产品适配等），并 Customize 到这家客户的具体痛点（比如客户在降价 → 用"技术升级"角度切入；客户是精品店 → 用"低 MOQ + 独家锁定"切入）。**rationale 必须引用知识库具体事实**——空话不算，必须像"24-72h 本地仓发货 (KB)，对应客户官网 'shipping 7-10 days' 的痛点"这样把 KB 事实和客户事实绑在一起。
${kbBlock}
## 已抓取内容（首页 + Contact + About，3 万字符内）

${homeMarkdown.slice(0, 20000)}

## 正则已经从抓取内容里命中的（这些是 100% 真实的，请优先使用并融入你的结果）

- 邮箱: ${regexEmails.join(', ') || '无'}
- 电话: ${regexPhones.join(', ') || '无'}
- WhatsApp（来自 wa.me 链接）: ${regexWhatsApps.join(', ') || '无'}
- LinkedIn: ${regexLinkedIn.join(', ') || '无'}

## 联网搜索建议（用 Gemini 联网搜索能力做这些查询）

- "${companyName} bilancio" / "${companyName} fatturato" / "${companyName} annual revenue"（意大利公司财务公示）
- "${companyName} ${country} VAT" / "${companyName} site:opencorporates.com"
- "${companyName} WhatsApp ${country}"
- "${companyName} contact email"
- "site:linkedin.com/company ${companyName}"
- "site:facebook.com ${companyName}"
- "${companyName} CEO" / "${companyName} owner" / "${companyName} founder"（找关键人姓名）
- "${companyName} review" / "${companyName} ${country} distributor"
- "${companyName} Tuya" / "${companyName} Smart Life"（识别 OEM 软件栈）

## 输出 JSON 格式（严格遵守，每条联系方式都要带 source）

\`\`\`
{
  "contacts": {
    "emails": [{"value": "real@example.com", "source": "homepage footer"}],
    "phones": [{"value": "+44 20 1234 5678", "source": "contact page"}],
    "whatsapp": [{"value": "+44 7xxx xxxxxx", "source": "homepage wa.me link"}],
    "linkedin": {"value": "https://linkedin.com/company/...", "source": "linkedin search hit"},
    "facebook": {"value": "https://facebook.com/...", "source": "homepage social icon"},
    "twitter": {"value": "https://x.com/...", "source": "..."},
    "instagram": {"value": "https://instagram.com/...", "source": "..."}
  },
  "company_info": {
    "name": "公司全称",
    "type": "中文类型：批发商 / 系统集成商 / 私家侦探 / 安防公司 / 取证服务 / 零售连锁",
    "background": "1-2 句中文：成立时间、规模、核心业务、主要客户群体",
    "address": "公司地址（如能找到）",
    "employee_size": "员工规模（如能找到）",
    "founded_year": "成立年份（如能找到）"
  },
  "key_executives": [
    {"name": "全名", "title": "职位", "linkedin": "个人 LinkedIn 链接", "source": "linkedin search"}
  ],
  "business_profile": {
    "annual_revenue": "€119,876 (2024)" 或 "未公开获取",
    "net_profit": "€22,812 (2024)" 或 "未公开获取",
    "employee_count": "5 人 / 11-50 人 / 50-200 人 / 未公开获取",
    "scale_judgment": "精品小微 / 中型独立站 / 跨境大卖 / 行业领导 / 经销网络（一个标签）",
    "evidence_source": "意大利 VAT 数据库 / 公司官网 / LinkedIn / Crunchbase / 未找到"
  },
  "hot_sellers": [
    {
      "name": "M5-WIR-CAM",
      "category": "车用微型摄像头",
      "price_current": "€120",
      "price_signal": "曾 €150 → 降到 €120（毛利被挤压）"
    }
  ],
  "decision_maker": {
    "name": "Luca",
    "role_guess": "店主 / 技术负责人",
    "personality_signal": "技术专业、耐心（多条客户评价提及）",
    "outreach_handle": "info@... / LinkedIn / 电话直拨"
  },
  "software_ecosystem": {
    "verdict": "OEM 公版（Tuya / V380） / 独立自研 / 未知",
    "evidence": "产品规格里出现 'Smart Life' / 涂鸦 / V380 等字样",
    "switch_pressure": "GDPR 数据回传敏感 / 欧洲服务器延迟问题——客户可能想换供应商"
  },
  "compliance_risk": {
    "key_regulations": ["GDPR", "意大利反偷拍灰色"],
    "platform_risk": "Amazon EU 易下架，依赖独立站",
    "must_have_certs": ["CE", "RoHS"]
  },
  "competitive_position": {
    "type": "精品店 / 跨境大卖 / 系统集成商 / 私家侦探事务所 / 安保公司",
    "key_differentiator": "23 年经验 + 安全顾问服务（'Bonifica Ambientale'）",
    "customer_profile_short": "企业主、法律纠纷个人、政商人士"
  },
  "supplier_change_signals": [
    "M5 降价 20%，暗示成本压力 / 上游涨价",
    "未见近 6 月新品上架"
  ],
  "negotiation_playbook": [
    {
      "angle": "低 MOQ + NDA 独家",
      "rationale": "客户年营收 12 万欧（business_profile）+ 公司主推型号 Tier 1 MOQ=10（KB 公司型号资料库）→ 一次 10 支可签独家",
      "opening_script_en": "Hey Luca, noticed Spy Italy's been running boutique-by-appointment for 23 years—high-touch, low-volume. We can ship W8 pen camera from our Nola/Naples warehouse (Via Boscofangone) with MOQ as low as 10 pcs at USD 27.8/pc, and sign an NDA to lock the housing/silk-screen exclusively for Italy. Want me to send a sample to your Verona office this week?",
      "opening_script_zh": "拿 W8 + Naples 仓做钩子：低 MOQ 10 支 + 24-72h 发货 + 签 NDA 锁意大利市场独家伪装外壳，把客户从'低单价'话题拉到'低风险试单'话题",
      "kb_citations": ["kb:products (W8)", "kb:naples-warehouse", "kb:country-tier"]
    }
  ],
  "deep_profile": "200-300 字的中文执行摘要，浓缩上面所有结构化字段里最值得业务员第一眼看到的 1-2 个核心洞察 + 一句话总建议。不要再分 6 节、不要重复结构化字段的内容。"
}
\`\`\`

## 最后提醒

- 只输出 JSON，不要 \`\`\`json 标记
- 找不到的字段：填 "未公开获取" 或返回空数组 / 空字符串，**绝不瞎猜**
- 公司名、URL、邮箱、电话、人名保留原文不翻译；其余描述类内容用中文
- negotiation_playbook **必须 3 条**，每条 angle 不撞车，opening_script 直接复制粘贴可用
- 如果联网搜索失败，至少基于「已抓取内容」做分析；这种情况下大量字段返回"未公开获取"也没关系`;
}
