/**
 * QZT 知识库读取器（服务端，Node Runtime 专用）。
 *
 * 数据源：Google Apps Script export
 *   https://script.google.com/macros/s/.../exec?key=QZT-Link-Token-QZT123456
 *
 * 一份 1.2 MB JSON，包含 26 个 sheet（产品资料库 / 国家分层 / 砍价话术 / 付款方式 /
 * 已读不回 8 连击 / Pluie 命名空间 / AI 信息静态表 / 意大利展厅地址 / 问题档案 等）。
 *
 * 策略：
 *   1. 进程内缓存 24h，每次冷启动拉一次（Vercel 函数实例平均存活 15min-数小时，撞击概率低）
 *   2. 暴露 buildKbContextForLead({ country })，按客户国家挑相关切片，组装一个 ~6 KB 的紧凑上下文字符串
 *   3. 永远不要把全量塞进 prompt——会爆 token，AI 也找不到重点
 */

const KB_URL =
  process.env.QZT_KB_URL ||
  'https://script.google.com/macros/s/AKfycbxH-8KmSioCWGWSHX19PuQzrrx3AqhPCq51fyrvjk5iwoOXp7Mg3JUQl7Fi3s--x6RG/exec?key=QZT-Link-Token-QZT123456';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface KbCache {
  data: any | null;
  fetchedAt: number;
  inflight: Promise<any> | null;
}

const cache: KbCache = { data: null, fetchedAt: 0, inflight: null };

async function fetchKbRaw(): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(KB_URL, {
      signal: ctrl.signal,
      // Apps Script 必须跟 redirect
      redirect: 'follow',
      headers: { 'User-Agent': 'QZT-Lead-Research/1.0' },
    });
    if (!res.ok) throw new Error(`KB HTTP ${res.status}`);
    const json = await res.json();
    return json;
  } finally {
    clearTimeout(t);
  }
}

export async function getKb(): Promise<any | null> {
  const now = Date.now();
  if (cache.data && now - cache.fetchedAt < CACHE_TTL_MS) return cache.data;
  if (cache.inflight) return cache.inflight;
  cache.inflight = (async () => {
    try {
      const data = await fetchKbRaw();
      cache.data = data;
      cache.fetchedAt = Date.now();
      return data;
    } catch (err) {
      console.warn('[qztKb] fetch failed:', (err as any)?.message);
      // 失败时仍返回旧缓存（如果有）
      return cache.data;
    } finally {
      cache.inflight = null;
    }
  })();
  return cache.inflight;
}

/* ─────────── 切片选择器 ─────────── */

function lookupCountryTier(kb: any, country: string): { tier: string; matched: string } | null {
  if (!country) return null;
  const rows: any[] = Array.isArray(kb?.['国家等级分层']) ? kb['国家等级分层'] : [];
  const c = country.trim().toLowerCase();
  const hit = rows.find(
    (r) =>
      String(r.Country || '').toLowerCase() === c ||
      String(r['ISO Code'] || '').toLowerCase() === c
  );
  if (hit) return { tier: String(hit['Market Tier'] || ''), matched: String(hit.Country || '') };
  return null;
}

function pickTopProducts(kb: any, limit = 8): string[] {
  const rows: any[] = Array.isArray(kb?.['公司型号资料库勿动!']) ? kb['公司型号资料库勿动!'] : [];
  // 偏好：有 Tier_1_Price_USD + Main_Features_Summary 的条目，限制每个 Category 最多 2 个
  const byCat = new Map<string, number>();
  const picked: string[] = [];
  for (const r of rows) {
    if (picked.length >= limit) break;
    const cat = String(r.Product_Category || 'Other');
    if ((byCat.get(cat) || 0) >= 2) continue;
    if (!r.Model_No) continue;
    const price = r.Tier_1_Price_USD || r.Tier_2_Price_USD;
    const moq = r.Tier_1_MOQ || r.Tier_2_MOQ;
    if (!price) continue;
    const features = String(r.Main_Features_Summary || '').slice(0, 80);
    picked.push(
      `${r.Model_No} (${cat}, ${r.Product_Name_EN || r.Product_Name_CN || ''}): $${price}/pc, MOQ ${moq || '?'}${features ? ', ' + features : ''}`
    );
    byCat.set(cat, (byCat.get(cat) || 0) + 1);
  }
  return picked;
}

function pickPriceObjectionScripts(kb: any): string[] {
  const rows: any[] = Array.isArray(kb?.['砍价回复']) ? kb['砍价回复'] : [];
  // 只挑中文心法（不要长邮件模板，太占 token）。规则：长度 < 200 的中文项
  const out: string[] = [];
  for (const r of rows) {
    const v = String(r['砍价解决方案'] || '').trim();
    if (!v) continue;
    if (v.length > 200) continue;
    if (!/[一-龥]/.test(v)) continue;
    out.push(v.replace(/\s+/g, ' '));
  }
  return out;
}

function pickAiInsights(kb: any, tier: string, country: string): string[] {
  const rows: any[] = Array.isArray(kb?.['AI信息静态表']) ? kb['AI信息静态表'] : [];
  const tierWanted = tier.toLowerCase();
  const isEu = ['italy', 'germany', 'france', 'spain', 'netherlands', 'poland', 'romania'].includes(
    country.trim().toLowerCase()
  );
  const out: string[] = [];
  for (const r of rows) {
    const target = String(r.Target_Customer_Segment || '').toLowerCase();
    const cat = String(r.Insight_Category || '');
    // 欧洲 → 强相关；Tier 1 全留
    if (
      tierWanted.includes('tier 1') ||
      isEu ||
      target.includes('europ') ||
      target.includes('all')
    ) {
      out.push(`[${cat}] ${String(r.Identified_Pattern_or_Issue || '').slice(0, 220)} → 行动：${String(r['AI-Powered_Sales_Action'] || '').slice(0, 220)}`);
    }
    if (out.length >= 5) break;
  }
  return out;
}

function pickPaymentSummary(kb: any): string[] {
  // 浓缩为 3-4 行：意大利 PayPal/IBAN、香港 USD、Wise、阶梯定金政策
  return [
    '意大利发货收款：PayPal qztelectronics@gmail.com（手续费 ~5%）或 IBAN IT04T0623005034000035764026（QZT ELECTRONICS SRL）',
    '中国发货收款：Standard Chartered HK USD/EUR 账户、Taylor PayPal（>$750 用）',
    '小额样品：PayPal 优先；大单：30% T/T 定金 + 70% 见提单副本',
  ];
}

function pickNaplesWarehouse(): string {
  return 'Naples 展厅+仓库：Via Boscofangone, Zona ASI, 80035 Nola, Italy（电话 +39 3209143389，税号 IT17839131004）。欧盟客户可预约现场访问，常规库存 24-72h 发货，无欧盟关税。';
}

function pickSilentFollowup(kb: any): string[] {
  // 已读不回 8 连击：抽 2 条策略性短句
  const rows: any[] = Array.isArray(kb?.['已读不回8连击']) ? kb['已读不回8连击'] : [];
  const out: string[] = [];
  for (const r of rows) {
    const text = Object.values(r)
      .map((v) => String(v || '').trim())
      .filter(Boolean)
      .join(' ')
      .slice(0, 180);
    if (text) out.push(text);
    if (out.length >= 2) break;
  }
  return out;
}

/**
 * Tier 1 EU 国家硬编码兜底列表。当 KB 拉取失败时，全 EU 精准搜索还能走。
 * 来源：KB 「国家等级分层」sheet 里 Market Tier = Tier 1 + 属于欧洲大陆 / 英伦 / 北欧的国家。
 * 如果 KB 可用，listTier1EuCountries() 会优先用 KB 数据。
 */
const TIER1_EU_FALLBACK: { country: string; iso: string }[] = [
  { country: 'Italy', iso: 'IT' },
  { country: 'Germany', iso: 'DE' },
  { country: 'France', iso: 'FR' },
  { country: 'United Kingdom', iso: 'GB' },
  { country: 'Spain', iso: 'ES' },
  { country: 'Netherlands', iso: 'NL' },
  { country: 'Sweden', iso: 'SE' },
  { country: 'Austria', iso: 'AT' },
  { country: 'Switzerland', iso: 'CH' },
  { country: 'Belgium', iso: 'BE' },
];

export async function listTier1EuCountries(): Promise<{ country: string; iso: string }[]> {
  const kb = await getKb();
  if (!kb) return TIER1_EU_FALLBACK;
  const rows: any[] = Array.isArray(kb?.['国家等级分层']) ? kb['国家等级分层'] : [];
  // EU + 英伦 + 北欧的 ISO 白名单，避免把 US / JP / KR 也算进来
  const EU_ISOS = new Set([
    'IT', 'DE', 'FR', 'GB', 'ES', 'NL', 'SE', 'AT', 'CH', 'BE',
    'NO', 'DK', 'FI', 'IE', 'PT', 'LU', 'IS',
  ]);
  const hits: { country: string; iso: string }[] = [];
  for (const r of rows) {
    const tier = String(r['Market Tier'] || '').toLowerCase();
    const iso = String(r['ISO Code'] || '').toUpperCase();
    const country = String(r.Country || '').trim();
    if (!country || !iso) continue;
    if (!tier.includes('tier 1')) continue;
    if (!EU_ISOS.has(iso)) continue;
    hits.push({ country, iso });
  }
  return hits.length > 0 ? hits : TIER1_EU_FALLBACK;
}

/* ─────────── 主入口：组装 prompt 上下文 ─────────── */

export interface KbContext {
  text: string;            // 注入到 prompt 的字符串
  citations: string[];     // 给 AI 引用的标签清单（例如 "country-tier" / "products" / "haggle-2"）
  available: boolean;      // false 代表 KB 拉取失败，AI 不应假装引用
}

export async function buildKbContextForLead(opts: {
  country?: string;
  companyName?: string;
}): Promise<KbContext> {
  const kb = await getKb();
  if (!kb) {
    return { text: '', citations: [], available: false };
  }

  const country = opts.country || '';
  const tierInfo = lookupCountryTier(kb, country);
  const products = pickTopProducts(kb, 8);
  const haggle = pickPriceObjectionScripts(kb).slice(0, 4);
  const insights = pickAiInsights(kb, tierInfo?.tier || '', country);
  const payments = pickPaymentSummary(kb);
  const warehouse = pickNaplesWarehouse();
  const silentFollowup = pickSilentFollowup(kb);

  const citations: string[] = [];
  const parts: string[] = [];

  parts.push('### QZT 内部知识库（必须在 negotiation_playbook 里引用具体条目）\n');

  if (tierInfo) {
    parts.push(`**客户市场分层**：${tierInfo.matched} = ${tierInfo.tier}（一级市场=欧美日韩，定价 + 政策可更激进；二/三级市场 PayPal 比例高、对运费敏感）`);
    citations.push('kb:country-tier');
  } else if (country) {
    parts.push(`**客户市场分层**：${country} 未在分层表中（按二级市场处理）`);
  }

  if (products.length > 0) {
    parts.push(`\n**QZT 主推产品（型号 + 单价 + MOQ + 卖点）**：\n${products.map((p, i) => `${i + 1}. ${p}`).join('\n')}`);
    citations.push('kb:products');
  }

  parts.push(`\n**Naples 仓库 / 展厅**：${warehouse}`);
  citations.push('kb:naples-warehouse');

  if (payments.length > 0) {
    parts.push(`\n**付款方式**：\n${payments.map((p) => '- ' + p).join('\n')}`);
    citations.push('kb:payment');
  }

  if (haggle.length > 0) {
    parts.push(`\n**砍价应对心法（中文，引用时写 "砍价话术 N"）**：\n${haggle.map((h, i) => `[砍价话术 ${i + 1}] ${h}`).join('\n')}`);
    citations.push('kb:haggle');
  }

  if (insights.length > 0) {
    parts.push(`\n**AI Sales Insights（按地区适配）**：\n${insights.map((s, i) => `[Insight ${i + 1}] ${s}`).join('\n')}`);
    citations.push('kb:ai-insight');
  }

  if (silentFollowup.length > 0) {
    parts.push(`\n**已读不回 8 连击（跟进话术片段）**：\n${silentFollowup.map((s, i) => `[跟进 ${i + 1}] ${s}`).join('\n')}`);
    citations.push('kb:silent-followup');
  }

  return {
    text: parts.join('\n'),
    citations,
    available: true,
  };
}
