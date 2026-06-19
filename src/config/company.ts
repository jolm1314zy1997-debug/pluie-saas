/**
 * Company Profile - AI prompt 注入的业务身份。
 *
 * 默认值 = QZT（保持 SaaS fork 出来时和原项目 1:1 行为）。
 *
 * 给其他公司用：改这个文件即可。Phase 3 模板化上线后会改成从 Supabase 表 / 上传 UI 读取。
 *
 * 不要在 .tsx 组件里直接 import 这个文件 —— 它有完整的销售 prompt，体积大；
 * 只在 API 路由 (server-side) import。
 */

export interface CompanyProfile {
  /* ── 基本身份 ── */
  brandName: string; // 用于 prompt 自我介绍："You are <X>'s sales assistant"
  industryEn: string; // 简短英文行业标签，用于 search match_reason 等

  /* ── Sales prompt 注入块 ── */
  /** 完整业务身份长文（产品/地理/卖点）— 拼到 system prompt 头部 */
  productContextEn: string;
  /** 9 个 A-I proof point 菜单 + 硬规则 */
  proofPointMenuEn: string;
  /** outreach Step 1 客户分析框架（7 问）*/
  clientAnalysisStepsEn: string;
  /** 全局 hard rules（地理 / 不准说什么 / RAG 优先）*/
  hardLocationRulesEn: string;

  /* ── Lead search prompt 注入 ── */
  /** 给 AI 的"为什么这个客户适合我们"的提示 */
  searchMatchReasonHint: string;
  /** match_reason JSON 字段的描述（默认行业产品线）*/
  searchMatchReasonExample: string;

  /* ── Map 搜索 ── */
  /** 业态种子词，含 {location} 占位符。会被 .replace 替换 */
  mapTypeQueries: {
    primary: string[];
    secondary: string[];
    integrator: string[];
    investigation: string[];
    locksmith: string[];
  };
  /** Google Places 允许的 place_type（白名单加分） */
  mapPlaceTypeAllow: string[];
  /** 业态名匹配加分的正则（注意：用字符串存，运行时编译）*/
  mapBusinessNameAllowPatterns: string[];
  /** 业态名匹配减分的正则 */
  mapBusinessNameDenyPatterns: string[];

  /* ── 关键词 → 产品线映射（用于 search match_reason）── */
  productLineMap: Array<{
    /** 正则字符串 */
    pattern: string;
    /** 产品线名称 */
    line: string;
    /** 推荐型号或子品类 */
    models: string[];
  }>;
  /** 兜底产品线（前面都没匹中时用）*/
  productLineFallback: { line: string; models: string[] };

  /* ── 默认值 ── */
  defaultProductKeywords: string[];
  defaultCountries: string[];

  /* ── KB / RAG 接入 ── */
  kb: {
    enabled: boolean;
    apiUrl: string;
    apiKey: string;
    botAskUrl: string;
    /** 显示在 UI 提示语里："已加载 <label>（N 个切片）" */
    label: string;
  };

  /** Sales person 默认标记，用于 prompt [Sender] 字段 fallback */
  salesPersonLabel: string;
}

/* ===========================================================================
 * QZT_PROFILE - 现有 QZT 业务身份的完整搬运（保持原项目行为不变）
 * =========================================================================== */

const QZT_PRODUCT_CONTEXT_EN = `Products:
- Spy / hidden cameras (mini, body-worn, nanny cam, button cam)
- Digital voice recorders (pen recorder, mini recorder, wearable recorder)
- Tuya DIY hidden camera modules (white-label / OEM for resellers)
- GPS trackers, counter-surveillance & forensic equipment

Positioning: mid-to-high-end, value selling, quality + service first. Do not compete on lowest price.

European fulfillment — BE PRECISE ABOUT GEOGRAPHY:
- **NAPLES (southern Italy) is the core**: warehouse + showroom are BOTH in Naples. Inventory, dispatch, buyer demos, product showroom — all happen in Naples. Ships within ~48h to most of EU.
- Milan is only a SECONDARY RECEPTION POINT — a place we can meet buyers who happen to be in Milan for trade shows. It is NOT a showroom, NOT a stocking point. Don't lead with Milan; only mention it if the buyer specifically asks about visiting Milan.
- ⛔ NEVER write "warehouse in Milan" / "stock in Milan" / "showroom in Milan" / "Milan-based" anything. These are all FACTUALLY WRONG. The sales team has complained twice.
- ⛔ NEVER suggest Milan is comparable in size/role to Naples. Naples is where the real operation lives.
- If you mention location at all: "Naples warehouse + showroom" is the only correct phrasing.

Compliance & paperwork ready:
- CE and RoHS docs (matters most for Germany / France / Nordics buyers)
- Original-box or customized retail packaging for resellers
- Invoice / EU customs proof for import

Customer-facing trust points (pick 1-2 per message, NOT all):
- Low-MOQ sample order accepted
- After-sales replacement directly from EU stock (no return-to-China)
- B2B price tier for repeat buyers
- Tuya DIY module = your own brand on your own listing
- Quiet bulk shipping (no logo on outer carton) for spy-product resellers

Target customers: online B2C sellers (Amazon / eBay / independent shop), offline consumer-electronics + security retail, wholesalers, small system integrators, private investigators / forensic services, locksmiths.

Buying pattern: small-volume, high-frequency repeat. Goal of every cold message = reply → trust → sample order → repeat. NOT "close the deal in one message".`;

const QZT_PROOF_POINT_MENU_EN = `🎯 STEP 2 — PICK A PROOF-POINT ANGLE FOR EACH VERSION

The 3 versions MUST NOT all repeat the same proof point. Pick THREE DIFFERENT angles, one per version, from this menu — chosen to match the client analysis above:

  A. "Naples warehouse + ~48h EU dispatch" (good for: southern Europe buyers / buyers who emphasize fast shipping / buyers tired of China lead times)
  B. "Naples showroom — invite to visit, demo before order, see samples in-person" (good for: established distributors / buyers in Italy / serious-volume prospects who'd take a trip)
  C. "After-sales replacement directly from EU stock, no return-to-China hassle" (good for: buyers who complain about defective rate / those already burned by China suppliers)
  D. "CE + RoHS paperwork ready" (good for: Germany / France / Nordics / regulated retail chain buyers)
  E. "Low-MOQ sample order accepted, easy to test before commitment" (good for: first contact / buyer is hesitant / small reseller)
  F. "Tuya DIY hidden camera module — your own brand on your own listing" (good for: Amazon / eBay / independent-store sellers who want differentiation)
  G. "Quiet / discreet bulk shipping — no logo on outer carton" (good for: spy-cam / nanny-cam / detective-equipment resellers worried about customs / privacy)
  H. "B2B repeat-buyer price tier" (good for: buyers who signal volume / chain stores / distributors)
  I. Pure product-fit angle — name a specific SKU that matches their existing range, no fulfillment talk at all (good for: when client has very specific product line — be product-specific instead of generic)

Hard picking rules:
- ⛔ Same letter MUST NOT appear in more than one version.
- ⛔ Don't put the location-related angles (A AND B) both in your 3. Pick at most ONE of them. The other 2 versions must come from C-I.
- ⛔ Never write "warehouse in Milan" / "showroom in Milan" / "Milan-based" — Milan is only a secondary reception point. Naples is the real location for everything.
- ✅ At least ONE of the 3 versions should be option I (pure product fit, no fulfillment talk). This forces variety and grounds the outreach in something the client actually cares about — their products.
- ✅ Sequence letters so the first impression matches the most-likely buyer concern from your Step 1 analysis.`;

const QZT_CLIENT_ANALYSIS_STEPS_EN = `🧠 STEP 1 — CLIENT BACKGROUND ANALYSIS (mandatory, do this internally before writing anything)

Before drafting any version, READ the customer_company / customer_industry / customer_background fields and silently answer these to yourself:

  1. Country / region — what regulation, language, payment habit, shipping expectations apply?
  2. Channel — online B2C (Amazon / eBay / Shopify), offline retail, wholesale / distributor, system integrator / installer, professional service (PI / forensic / locksmith)?
  3. Current product range — what categories do they already sell? Where's the gap we can fill?
  4. Business signal — are they expanding? Opening a new store? Launching a new line? Complaining about a current supplier? Hiring? Trade-show participation?
  5. Decision-maker persona — buyer / store owner / brand manager / contractor / agency owner? What do they personally care about (margin? return rate? supplier reliability? exclusivity?)
  6. Best-fit product line — given the above, which 1-2 of our product categories make the most sense for them?
  7. Where they're vulnerable to switching — what specific advantage (out of the menu below) would actually move the needle for THIS client?

⚠️ If customer_background is empty or generic ("no extra background provided"), call out that gap inside the opening — say something like "we noticed [generic public signal X]" and ask one specific qualifying question — DO NOT pretend you know things you don't. A vague background means the opening should be short, curious, and ask for info, not pitch heavily.`;

const QZT_HARD_LOCATION_RULES_EN = `Geography hard rules (DO NOT VIOLATE):
- ⛔ NEVER write "warehouse in Milan" / "stock in Milan" / "showroom in Milan" / "Milan-based" — these are FACTUALLY WRONG.
- ⛔ NEVER suggest Milan is comparable in size or role to Naples.
- ✅ If location is mentioned at all, the only correct phrasing is "Naples warehouse + showroom".
- ✅ Milan can only be mentioned as a secondary reception point if the buyer specifically asks about Milan.`;

export const QZT_PROFILE: CompanyProfile = {
  brandName: 'QZT',
  industryEn: 'European Security & Spy Product Wholesale',

  productContextEn: QZT_PRODUCT_CONTEXT_EN,
  proofPointMenuEn: QZT_PROOF_POINT_MENU_EN,
  clientAnalysisStepsEn: QZT_CLIENT_ANALYSIS_STEPS_EN,
  hardLocationRulesEn: QZT_HARD_LOCATION_RULES_EN,

  searchMatchReasonHint:
    '该客户为什么适合我们的隐藏摄像头、录音设备、GPS、DIY camera module',
  searchMatchReasonExample: '一句话说明为什么适合我们的产品线',

  mapTypeQueries: {
    primary: [
      'spy shop {location}',
      'hidden camera shop {location}',
      'security equipment store {location}',
      'spy equipment store {location}',
    ],
    secondary: [
      'electronics security store {location}',
      'electronics store security camera {location}',
      'security equipment wholesaler {location}',
      'electronics wholesaler security {location}',
      'security products distributor {location}',
      'spy equipment supplier {location}',
    ],
    integrator: [
      'security system integrator {location}',
      'security solutions company {location}',
    ],
    investigation: [
      'private investigator equipment {location}',
      'detective equipment supplier {location}',
    ],
    locksmith: ['locksmith equipment supplier {location}'],
  },

  mapPlaceTypeAllow: [
    'electronics_store',
    'hardware_store',
    'locksmith',
    'security_service',
  ],

  // RegExp 源字符串 - 业态名匹配则加分
  mapBusinessNameAllowPatterns: [
    'security',
    'sicurezza',
    'sicher',
    'sécurité',
    'seguridad',
    'spy',
    'spia',
    'spionage',
    'detective',
    'investiga',
    'investigator',
  ],

  // 业态名匹配则减分（典型不相关业态）
  mapBusinessNameDenyPatterns: [
    'gallery',
    'galleria',
    'galerie',
    'museum',
    'restaurant',
    'ristorante',
    'cafe',
    'pizzeria',
    'school',
    'scuola',
    'bookstore',
    'libreria',
    'flower',
    'florist',
    'salon',
  ],

  // 关键词 → 产品线映射（用于 search match_reason）
  productLineMap: [
    {
      pattern:
        '(voice\\s*recorder|audio\\s*recorder|dictaphone|pen\\s*recorder|wearable\\s*recorder)',
      line: 'QZT 录音笔',
      models: ['VR-08', 'VR-12', 'VR-Pen'],
    },
    {
      pattern:
        '(detect|counter\\s*surv|jammer|blocker|anti.?spy|sweep|bug\\s*det|signal\\s*block)',
      line: 'QZT 反侦察 / 信号检测',
      models: ['CD-001', 'JM-Pro'],
    },
    {
      pattern:
        '(spy|hidden|nanny|button|clock|pen.*camera|mini.*camera|spy.*camera|key.*camera|covert|disguise)',
      line: 'QZT 全产品线',
      models: ['S820', 'C10', 'W8', 'Tuya DIY module'],
    },
  ],
  productLineFallback: {
    line: 'QZT 全产品线',
    models: ['S820', 'C10', 'W8', 'Tuya DIY module'],
  },

  defaultProductKeywords: [
    'spy camera',
    'hidden camera',
    'security camera',
    'nanny cam',
    'voice recorder',
  ],
  defaultCountries: ['IT', 'DE', 'FR', 'ES', 'UK', 'NL', 'BE', 'PL'],

  kb: {
    enabled: true,
    apiUrl:
      process.env.QZT_KB_API_URL ||
      'https://script.google.com/macros/s/AKfycbxH-8KmSioCWGWSHX19PuQzrrx3AqhPCq51fyrvjk5iwoOXp7Mg3JUQl7Fi3s--x6RG/exec',
    apiKey: process.env.QZT_KB_API_KEY || 'QZT-Link-Token-QZT123456',
    botAskUrl:
      process.env.QZT_BOT_ASK_URL || 'https://qzt-bot.qzt-sop.workers.dev/ask',
    label: 'QZT 知识库',
  },

  salesPersonLabel: 'QZT sales',
};

/* ===========================================================================
 * 当前激活的 profile
 * ===========================================================================
 * 给其他公司用时:
 *   1. 复制一份 QZT_PROFILE，改名 ACME_PROFILE
 *   2. 改下面这行 export 为 ACME_PROFILE
 *   3. 重新部署
 *
 * Phase 3 模板化上线后 → 改成从 Supabase 表读取
 */
export const COMPANY: CompanyProfile = QZT_PROFILE;
