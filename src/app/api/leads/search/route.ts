import { NextRequest, NextResponse } from 'next/server';
import { listTier1EuCountries } from '@/lib/qztKb';
import { COMPANY } from '@/config/company';

// Fluid Compute 启用后 Hobby 免费版 300 秒超时（vercel.json）

const DEFAULT_BASE_URL = 'https://api.aihubmix.com/v1';
// 默认 API Key（后端配置），前端传了 _api_key 则用前端的
const DEFAULT_API_KEY = process.env.AIHUBMIX_API_KEY || '';
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';

export async function POST(req: NextRequest) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 240_000); // 4 分钟超时

  try {
    const body = await req.json();

    // 前端传了就用前端的，没传就用后端默认的
    const apiKey = body._api_key || DEFAULT_API_KEY;
    const baseUrl = body._base_url || DEFAULT_BASE_URL;
    const { _api_key: _1, _base_url: _2, ...searchBody } = body;

    if (!apiKey) {
      clearTimeout(timeoutId);
      return NextResponse.json(
        { detail: '请先配置 API Key（点击右上角「配置」按钮填入，或联系管理员配置默认 Key）' },
        { status: 400 }
      );
    }

    if (searchBody.search_source === 'map' && !GOOGLE_MAPS_API_KEY) {
      clearTimeout(timeoutId);
      return NextResponse.json(
        {
          detail:
            '地图获客需要在 Vercel 环境变量中配置 GOOGLE_MAPS_API_KEY，并在 Google Cloud 启用 Places API。当前未检测到该配置。',
        },
        { status: 400 }
      );
    }

    const leadsResult =
      searchBody.search_source === 'eu_premium'
        ? await runEuPremiumSearch(apiKey, baseUrl, searchBody, controller.signal)
        : searchBody.search_source === 'map'
          ? await callMapLeadsDirectly(apiKey, baseUrl, searchBody, controller.signal)
          : await callLeadsDirectly(apiKey, baseUrl, searchBody, controller.signal);
    clearTimeout(timeoutId);
    if (leadsResult?.success === false) {
      return NextResponse.json(leadsResult, { status: 502 });
    }
    return NextResponse.json(leadsResult);
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Search] Error:', message);
    return NextResponse.json(
      { detail: `搜索失败: ${message}` },
      { status: 504 }
    );
  }
}

/* ── 直接调用 aihubmix API 搜索客户 ── */

// 网页搜索固定模型：Flash Search 比 Pro Search 响应更快、成本更低，适合每次 5 个客户的高频搜索。
const SEARCH_MODEL = 'gemini-3-flash-preview-search';

function buildSystemPrompt() {
  return `# 角色定义

你是一位资深的 B2B 潜在客户挖掘专家和市场研究员，深耕于安防监控、特种电子设备及调查取证行业。你精通全球市场分析，具备强大的信息筛选与商业逻辑匹配能力。

# 我司核心产品矩阵

你正在为以下产品线寻找 B2B 分销渠道和采购客户：
- 隐藏摄像头 (Hidden/Spy Cameras)
- 录音设备 (Digital Voice Recorders / Audio Surveillance)
- 取证设备 (Forensic Investigation Equipment)
- 特种消费电子产品 (Specialty Consumer Electronics)
- GPS 追踪器 (GPS Trackers)
- 信号屏蔽器 (Signal Jammers / RF Blockers)
- 间谍设备配件 (Spy Gear Accessories)

# 核心铁律

## 1. 绝对真实，严禁幻觉（最高优先级）
- 列出的每一家公司必须 100% 真实存在，必须是可被 Google 搜索验证的实体
- 严禁捏造任何公司名称、网址、邮箱、电话或 LinkedIn 链接
- 如果联网搜索结果不足，宁可少返回，绝不编造
- 若某项联系方式确实全网未公开，请填入"未公开获取"
- **严禁编造电话号码**：电话号码必须是该公司官网 Contact 页面或公开资料中真实列出的号码。绝对禁止生成类似 "+44 20 1234 5678"、"+44 1234 567890" 等含有连续递增数字(123456)、重复数字(000000)、明显占位符格式的假号码。如果你无法在官网找到真实电话号码，请填入"未公开获取"。
- **严禁编造邮箱**：邮箱必须是该公司官网公开列出的。禁止编造类似 "info@companyname.com"、"sales@companyname.com" 的猜测性邮箱。
- **info@/sales@/contact@ 泛用前缀规则**：对于 info@、sales@、contact@、admin@、support@ 这类泛用前缀邮箱，除非你确实在官网 Contact 页面或页脚亲眼看到了该邮箱地址，否则一律填入"未公开获取"。这类邮箱是 AI 最常见的幻觉模式，必须严格禁止猜测。

## 2. 精准 B2B 画像
- **只找 B2B 买家**：批发商 (Wholesaler/Distributor)、进口商 (Importer)、分销商 (Distributor)、系统集成商 (System Integrator)、专业机构（私人侦探公司、安保服务公司、法律取证公司）
- **坚决排除**：B2C 个人消费者、通用电子商店（如卖手机壳的店）、不相关的品类店铺
- 公司必须位于用户指定的目标国家/地区

## 3. 深度背调质量
- 必须实际访问公司官网，确认公司真实存在
- 背景描述不能只抄网站 Slogan，需总结真实商业模式和企业实力
- 匹配度分析必须具体说明"为什么这家公司会采购我们的产品"

## 4. 数量严格履约
最终输出的有效企业数量必须等于要求的数量。

# 工作流程

## Step 1: 构建搜索策略
根据用户输入的产品关键词和目标国家，自动生成并组合多套搜索策略：
- 使用 Google Dorks 高级语法（inurl:, intitle:, site:, intext:, "@" 等）
- 排除中国 B2B 平台（-site:alibaba.com -site:made-in-china.com -site:aliexpress.com -site:dhgate.com）
- 针对目标国家的本地语言搜索

## Step 2: 联网搜索验证
- 使用联网搜索功能执行搜索
- 点击进入搜索结果，访问目标公司官网
- 重点查看：Home, About Us, Products/Services, Contact Us 页面
- 确认公司真实存在于目标国家

## Step 3: 深度背景调查
- 提炼核心业务、成立背景、主营产品和企业规模
- 判断该公司与我司产品矩阵的匹配度
- 查找 LinkedIn 企业主页补充信息

## Step 4: 联系方式抓取
- 从 Contact Us 页面、Footer、网页源代码提取
- 优先寻找采购相关邮箱（buyer/purchasing/info/sales）
- 提取官方电话号码

## Step 5: 排重与去杂质
- 过滤掉已倒闭、无法验证的公司
- 过滤掉纯 B2C 不做批发的零售商
- 确保没有重复公司

# 输出格式

严格按照以下 JSON 格式输出，不要输出任何其他内容：

[
  {
    "name": "公司全称（英文或当地语言全称，保持公司真实名称不翻译）",
    "website": "https://www.example.com",
    "type": "分销商 / 系统集成商 / 私家侦探 / 安防公司 / 取证服务 / 零售连锁 / 批发商（中文，二选一）",
    "background": "1-2句真实背调，必须用中文：成立时间、员工规模、核心业务、主要客户群体。客户公司名保留原文，其他用中文描述。",
    "match_reason": "一句话匹配度分析，必须用中文：具体说明为什么该公司会采购我们的隐藏摄像头/录音设备/GPS等产品",
    "email": "info@example.com 或 未公开获取",
    "phone": "+XX XXX XXXXXXX 或 未公开获取",
    "linkedin": "https://linkedin.com/company/xxx 或 未公开获取"
  }
]

重要：
- 只输出 JSON 数组，不要包含 \`\`\`json 标记或任何其他文字
- **background 与 match_reason 必须用中文**，方便中文销售业务员快速扫读
- type 也用中文，从「分销商 / 批发商 / 系统集成商 / 私家侦探 / 安防公司 / 取证服务 / 零售连锁」里选最贴近的一个
- 公司名、网址、邮箱、电话保留原文，不要翻译
- match_reason 字段必须针对我司产品线（隐藏摄像头、录音设备、取证设备、GPS、屏蔽器等）进行分析`;
}

async function callLeadsDirectly(
  apiKey: string,
  baseUrl: string,
  body: Record<string, any>,
  signal: AbortSignal
) {
  const {
    customer_type = 'all',
    keyword,
    country,
    target_region = '',
    whatsapp_priority = false,
    search_source = 'web',
    result_count = 20,
    blocklist = [],
    deep_enrich = false,
  } = body;
  const countryValue = country || 'EU';
  const regionValue = target_region || countryValue;
  const isMapMode = search_source === 'map';

  // 生成随机偏移，确保相同搜索条件得到不同结果
  const randomOffset = Math.floor(Math.random() * 100);
  const searchSessionId = `session_${Date.now()}_${randomOffset}`;

  // 随机选择搜索策略组合，增加多样性
  const strategyVariants = [
    {
      angle: 'distributor_focus',
      desc: '从分销商/批发商角度切入',
      extraDorks: [
        `"${keyword}" wholesale ${countryValue} OR "${keyword}" bulk supplier ${countryValue}`,
        `"${keyword}" trade distributor ${countryValue} "products" OR "catalogue"`,
        `site:linkedin.com/companies "${keyword}" ${countryValue} distributor`,
      ],
    },
    {
      angle: 'security_ecosystem',
      desc: '从安防行业生态切入（安防集成商、安保公司、私人侦探）',
      extraDorks: [
        `"surveillance equipment" OR "security equipment" ${countryValue} supplier -site:alibaba.com`,
        `"private investigator" OR "detective agency" ${countryValue} equipment supplier`,
        `"CCTV" OR "video surveillance" ${countryValue} installer OR integrator`,
      ],
    },
    {
      angle: 'forensic_tech',
      desc: '从取证技术和特种电子设备角度切入',
      extraDorks: [
        `"forensic equipment" OR "investigation equipment" ${countryValue}`,
        `"counter surveillance" OR "bug detection" ${countryValue} supplier`,
        `"GPS tracker" OR "signal jammer" ${countryValue} B2B`,
      ],
    },
    {
      angle: 'trade_show_exhibitor',
      desc: '从行业展会和参展商角度切入',
      extraDorks: [
        `"${keyword}" ${countryValue} exhibition OR trade show OR "security fair" exhibitor`,
        `"security" ${countryValue} "IFSEC" OR "Sicur" OR "Security Essen" OR "MIPS" exhibitor list`,
        `"${keyword}" ${countryValue} "member of" OR "certified partner" OR "authorized distributor"`,
      ],
    },
    {
      angle: 'local_language',
      desc: '使用目标国家本地语言搜索',
      extraDorks: (() => {
        const lower = countryValue.toLowerCase();
        const langMap: Record<string, string[]> = {
          italy: [`"${keyword}" distributore Italia sicurezza`, `"telecamere nascoste" OR "microspie" Italia distributore`],
          germany: [`"${keyword}" Großhändler Deutschland Sicherheit`, `"Versteckte Kamera" OR "Spionagekamera" Deutschland Großhandel`],
          france: [`"${keyword}" distributeur France securite`, `"caméra cachée" OR "micro espion" France distributeur`],
          poland: [`"${keyword}" hurtownia Polska bezpieczeństwo`, `"ukryta kamera" OR "podsłuch" Polska hurtownia`],
          spain: [`"${keyword}" distribuidor España seguridad`, `"cámara oculta" OR "microespía" España distribuidor`],
          netherlands: [`"${keyword}" groothandel Nederland beveiliging`, `"verborgen camera" OR "afluisterapparatuur" Nederland`],
          uk: [`"${keyword}" wholesaler UK OR "United Kingdom" security`, `"hidden camera" OR "spy equipment" UK distributor`],
        };
        return langMap[lower] || [`"${keyword}" ${countryValue} local distributor`, `"security equipment" ${countryValue} wholesale`];
      })(),
    },
    {
      angle: 'vertical_market',
      desc: '从垂直细分市场切入（零售连锁、专业商店、线上专业卖家）',
      extraDorks: [
        `"spy shop" OR "spy store" ${countryValue} wholesale`,
        `"investigation supplies" OR "detective equipment" ${countryValue} retailer`,
        `"hidden camera" OR "nanny cam" ${countryValue} B2B OR "trade account"`,
      ],
    },
  ];

  // 随机选 2-3 个策略组合
  const shuffled = strategyVariants.sort(() => Math.random() - 0.5);
  const selectedStrategies = shuffled.slice(0, 2 + Math.floor(Math.random() * 2));

  const typeContext: Record<string, string> = {
    all: '所有类型的B端客户，包括：安防设备分销商/批发商、私人侦探与安保服务公司、法律与取证技术公司、特种电子产品零售连锁、系统集成商、安防安装商',
    b2c_online: '线上B2C卖家 — 重点搜索：安防设备独立站、专业spy shop在线商店、电商平台专业卖家',
    offline_retail: '线下零售及批发商 — 重点搜索：安防设备批发商、分销商、贸易公司、实体专业安防店',
    system_integrator: '系统集成商 — 重点搜索：CCTV系统集成商、安防工程商、智能安防安装公司',
  };

  const strategiesText = selectedStrategies
    .map((s, i) => `### 策略 ${i + 1}：${s.desc}\n${s.extraDorks.map((d, j) => `${i + 1}.${j + 1}. ${d}`).join('\n')}`)
    .join('\n\n');

  // 固定 5 个结果，确保在 60 秒超时内完成
  const TARGET_COUNT = Math.min(result_count, 5);

  // 屏蔽列表注入
  const blocklistSection = Array.isArray(blocklist) && blocklist.length > 0
    ? `\n## 🚫 严格屏蔽列表（必须遵守）\n以下公司已被标记为"已开发/已联系/不感兴趣"，**绝对禁止**出现在搜索结果中：\n${blocklist.map((b: string) => `- ${b}`).join('\n')}\n如果搜索结果中有上述任何公司，立即替换为其他公司，确保最终结果中不包含任何屏蔽列表中的公司名称。\n`
    : '';

  const userPrompt = isMapMode
    ? `## 地图获客任务
- **产品关键词**: ${keyword}
- **目标国家**: ${countryValue}
- **城市/区域**: ${regionValue}
- **客户类型**: ${typeContext[customer_type] || typeContext['all']}
- **需要的结果数量**: ${TARGET_COUNT}（严格限制，确保搜索速度）
- **搜索会话 ID**: ${searchSessionId}（请勿重复返回之前会话的结果）
${blocklistSection}

## 目标
模拟 Google Maps / Ask Maps 的区域获客方式，优先寻找 ${regionValue} 附近真实存在的本地商家、批发商、贸易商、安防店、系统集成商或调查取证服务商。

## 必须尽量返回这些字段
- 公司名、官网、Google Maps 链接或地图可验证线索
- 详细地址或所在区域
- 电话号码（如果公开）
- WhatsApp 号码（${whatsapp_priority ? '优先查找，只有能合理判断可 WhatsApp 联系才填写' : '如公开可填写'}）
- 评分或营业状态（如公开）
- 该客户为什么适合${COMPANY.brandName}的产品线（${COMPANY.industryEn}）

## 地图式搜索策略
${strategiesText}

请返回 ${TARGET_COUNT} 家适合人工 WhatsApp 跟进或电话确认的潜在客户。只返回 JSON 数组，字段格式如下：
[
  {
    "name": "公司全称",
    "website": "https://www.example.com",
    "type": "Distributor / Wholesaler / Retail Store / System Integrator / Security Firm / Investigation Service",
    "address": "详细地址或区域",
    "rating": "4.5 或 未公开获取",
    "google_maps_url": "https://maps.google.com/... 或 未公开获取",
    "background": "1-2句真实地图/官网线索总结",
    "match_reason": "一句话说明为什么适合我们的产品线",
    "email": "公开邮箱或 未公开获取",
    "phone": "公开电话或 未公开获取",
    "whatsapp": "WhatsApp号码或 未公开获取",
    "linkedin": "LinkedIn链接或 未公开获取"
  }
]`
    : `## 搜索任务
- **产品关键词**: ${keyword}
- **目标国家**: ${countryValue}
- **客户类型**: ${typeContext[customer_type] || typeContext['all']}
- **需要的结果数量**: ${TARGET_COUNT}（严格限制，确保搜索速度）
- **搜索会话 ID**: ${searchSessionId}（请勿重复返回之前会话的结果）
${blocklistSection}

## 我司产品矩阵（用于匹配度分析）
隐藏摄像头 | 录音设备 | 取证设备 | 特种消费电子产品 | GPS 追踪器 | 信号屏蔽器

## 搜索策略（快速执行，优先速度）

${strategiesText}

## 效率优化要求
1. **速度优先**：每个公司调查控制在 30 秒内，快速验证官网真实性
2. **深度适当**：了解公司基本业务即可，无需详细挖掘所有页面
3. **严格数量**：只返回 ${TARGET_COUNT} 家公司，不要多找
4. **质量筛选**：优先选择官网明确、信息完整的公司，不确定的跳过

请开始执行搜索，返回 ${TARGET_COUNT} 家符合条件的企业数据。只返回 JSON 数组。`;

  const systemPrompt = buildSystemPrompt();

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: SEARCH_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 4000,
      }),
      signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[Search] API error:', res.status, errText);
      return {
        success: false,
        detail: `搜索 API 调用失败 (${res.status}): ${errText}`,
      };
    }

    const data = await res.json();
    console.log('[Search] AI response:', JSON.stringify(data).substring(0, 500));
    
    const content = data?.choices?.[0]?.message?.content || '';
    console.log('[Search] AI content length:', content.length);
    console.log('[Search] AI content preview:', content.substring(0, 500));
    
    if (!content) {
      return { success: false, detail: '搜索 AI 返回内容为空，请重试' };
    }

    let results = parseResults(content, countryValue);
    console.log('[Search] Parsed results count:', results.length);

    // 可选：搜索后用 Jina 验证官网真实性（并发，单站 8s 超时，整体 25s 超时）
    if (deep_enrich && results.length > 0) {
      try {
        const verified = await verifyWebsitesWithJina(results, 25_000);
        results = verified;
      } catch (e) {
        console.warn('[Search] verifyWebsites failed:', (e as any)?.message);
      }
    }

    return {
      success: true,
      query: `${keyword} | ${countryValue} | ${customer_type}`,
      result_count: results.length,
      results,
      source: 'ai_web_search',
      model_used: SEARCH_MODEL,
      search_time: 0,
      verification_enabled: !!deep_enrich,
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, detail: '搜索请求超时（>180秒），请重试' };
    }
    return { success: false, detail: `搜索失败: ${err.message}` };
  }
}

/* ── 地图获客二次过滤：过滤不相关业态、按相关度打分 ── */

// Google Places types: 完全无关的业态直接 drop
const MAP_TYPE_BLACKLIST = new Set([
  'art_gallery', 'museum', 'tourist_attraction', 'amusement_park', 'aquarium', 'zoo',
  'lodging', 'restaurant', 'cafe', 'bar', 'food', 'meal_takeaway', 'meal_delivery', 'bakery',
  'gym', 'beauty_salon', 'spa', 'hair_care',
  'church', 'place_of_worship', 'mosque', 'synagogue', 'hindu_temple',
  'school', 'primary_school', 'secondary_school', 'university', 'library', 'park', 'cemetery',
  'movie_theater', 'movie_rental', 'casino', 'night_club',
  'pharmacy', 'doctor', 'hospital', 'dentist', 'veterinary_care', 'physiotherapist',
  'real_estate_agency', 'lawyer', 'accounting', 'travel_agency', 'insurance_agency',
  'pet_store', 'florist', 'clothing_store', 'shoe_store', 'jewelry_store',
  'book_store', 'bicycle_store', 'furniture_store',
  'car_dealer', 'car_rental', 'car_repair', 'car_wash', 'gas_station',
]);

// 公司名命中以下词一律 drop（多语种）
const MAP_NAME_BLACKLIST: RegExp[] = [
  /\bgallery\b/i, /\bgalleria\b/i, /\bgalerie\b/i, /\bmuseo\b/i, /\bmuseum\b/i, /\bmusée\b/i,
  /\blibreria\b/i, /\bbook\s*store\b/i, /\bbookshop\b/i, /\bbuchhandlung\b/i, /\blibrairie\b/i,
  /\bscuola\b/i, /\bschool\b/i, /\baccademia\b/i, /\bacademy\b/i, /\buniversità\b/i, /\buniversity\b/i,
  /\bristorante\b/i, /\brestaurant\b/i, /\bhotel\b/i, /\bresort\b/i, /\bhostel\b/i,
  /\bcaffè\b/i, /\bcafé\b/i, /\bbar\b/i, /\bpub\b/i, /\bpizzeria\b/i, /\btrattoria\b/i, /\bosteria\b/i,
  /\bfine\s*art\b/i, /\bportrait\b/i, /\bwedding\b/i, /\bsposi\b/i, /\bmatrimoni\b/i,
  /\bphotographer\b/i, /\bphotography\b/i, /\bfotografo\b/i, /\bfotograf\b/i, /\bphotograph\b/i,
  /\bstudio\s*foto\b/i, /\bfoto\s*studio\b/i, /\bfilm\s*studio\b/i,
  /\bfoto\s+(di|del|della|dei)\b/i, // "Foto di Milano" 这类
];

// 公司名 / type 命中以下，提升相关度
const MAP_RELEVANT_TYPES = new Set([
  'electronics_store', 'hardware_store', 'locksmith', 'security_service',
  'general_contractor', 'home_goods_store',
]);

const MAP_RELEVANT_KEYWORDS: RegExp[] = [
  /\bsecurity\b/i, /\bsicurezza\b/i, /\bsicher/i, /\bsécurité\b/i, /\bseguridad\b/i,
  /\bsurveillance\b/i, /\bsorveglianza\b/i, /\büberwachung\b/i,
  /\bcctv\b/i, /\btelecamere?\b/i, /\bvideokamera/i, /\bkameras\b/i,
  /\bspy\b/i, /\bspia\b/i, /\bspionage\b/i, /\bdetective\b/i, /\binvestiga/i, /\binvestigator/i,
  /\balarm\b/i, /\ballarme\b/i, /\balarme\b/i, /\balarma\b/i,
  /\blocksmith\b/i, /\bfabbro\b/i, /\bschlüsseldienst\b/i,
  /\belectronic/i, /\belettronic/i, /\belektronik\b/i,
  /\bgps\b/i, /\btracker\b/i, /\bforensic\b/i,
  /\bantifurto\b/i, /\bnanny\s*cam/i, /\bregistrator/i, /\brecorder\b/i,
];

function scoreMapPlace(place: any): number {
  const types: string[] = place.types || [];
  const name: string = place.name || '';

  // 硬过滤：业态明确无关
  for (const t of types) {
    if (MAP_TYPE_BLACKLIST.has(t)) return -1;
  }
  for (const re of MAP_NAME_BLACKLIST) {
    if (re.test(name)) return -1;
  }

  let score = 0;
  for (const t of types) {
    if (MAP_RELEVANT_TYPES.has(t)) score += 2;
  }
  for (const re of MAP_RELEVANT_KEYWORDS) {
    if (re.test(name)) score += 1;
  }
  return score;
}

async function callMapLeadsDirectly(
  _apiKey: string,
  _baseUrl: string,
  body: Record<string, any>,
  signal: AbortSignal
) {
  const {
    customer_type = 'all',
    keyword,
    country,
    target_region = '',
    whatsapp_priority = true,
    result_count = 5,
    blocklist = [],
    // Naples 为圆心半径模式：100 / 300 / 500 / 1000 (km)，0 / 缺省 = 关闭
    naples_radius_km = 0,
  } = body;
  const radiusKm = Number(naples_radius_km) > 0 ? Number(naples_radius_km) : 0;
  const naplesMode = radiusKm > 0;
  const countryValue = country || 'EU';
  // Naples 模式下用「Naples + radius km radius」作为 location 字符串，喂给文本查询
  const regionValue = naplesMode
    ? `within ${radiusKm} km of Naples, Italy`
    : (target_region || countryValue);
  const targetCount = Math.min(result_count, 5);
  const queryTerms = buildMapSearchQueries(keyword, customer_type, regionValue, countryValue);
  const normalizedBlocklist = blocklist
    .map((blocked: string) => normalizeCompanyName(blocked))
    .filter(Boolean);
  const requestCount = Math.min(20, Math.max(targetCount * 4, 12));

  try {
    const placeMap = new Map<string, any>();
    let lastGoogleError = '';
    let blockedMatchCount = 0;

    for (const textQuery of queryTerms) {
      if (placeMap.size >= targetCount) break;

      const placesRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
          'X-Goog-FieldMask': [
            'places.id',
            'places.displayName',
            'places.formattedAddress',
            'places.nationalPhoneNumber',
            'places.internationalPhoneNumber',
            'places.websiteUri',
            'places.googleMapsUri',
            'places.rating',
            'places.businessStatus',
            'places.types',
          ].join(','),
        },
        body: JSON.stringify({
          textQuery,
          maxResultCount: requestCount,
          languageCode: 'en',
          // Naples 半径模式：换算成 lat/lng bounding rectangle 作为硬约束
          // 1° 纬度 ≈ 111 km；经度按 cos(lat) 校正。Google Places 对 rectangle 没有最大尺寸限制
          ...(naplesMode
            ? (() => {
                const NAPLES_LAT = 40.8518;
                const NAPLES_LNG = 14.2681;
                const dLat = radiusKm / 111;
                const dLng = radiusKm / (111 * Math.cos((NAPLES_LAT * Math.PI) / 180));
                return {
                  locationRestriction: {
                    rectangle: {
                      low: { latitude: NAPLES_LAT - dLat, longitude: NAPLES_LNG - dLng },
                      high: { latitude: NAPLES_LAT + dLat, longitude: NAPLES_LNG + dLng },
                    },
                  },
                };
              })()
            : {}),
        }),
        signal,
      });

      if (!placesRes.ok) {
        const errText = await placesRes.text().catch(() => '');
        lastGoogleError = `Google Maps / Places API 调用失败 (${placesRes.status})。请确认 Vercel 的 GOOGLE_MAPS_API_KEY 正确、Google Cloud 已启用 Places API，并且该 key 没有限制错 API。${errText ? ` 原始错误: ${errText.slice(0, 300)}` : ''}`;
        console.error('[Map Search] Google Places error:', placesRes.status, errText);
        break;
      }

      const placesData = await placesRes.json();
      const places = Array.isArray(placesData.places) ? placesData.places : [];
      places.forEach((place: any) => {
        const name = place.displayName?.text || '';
        if (!name) return;
        const normalizedName = normalizeCompanyName(name);
        const isBlocked = normalizedBlocklist.some(
          (blocked: string) => normalizedName.includes(blocked) || blocked.includes(normalizedName)
        );
        if (isBlocked) {
          blockedMatchCount += 1;
          return;
        }

        const key = place.id || `${name}|${place.formattedAddress || ''}`;
        if (!placeMap.has(key)) {
          placeMap.set(key, {
            name,
            address: place.formattedAddress || '',
            phone: place.internationalPhoneNumber || place.nationalPhoneNumber || '',
            website: place.websiteUri || '',
            google_maps_url: place.googleMapsUri || '',
            rating: place.rating || '',
            business_status: place.businessStatus || '',
            types: place.types || [],
            query: textQuery,
          });
        }
      });
    }

    if (lastGoogleError && placeMap.size === 0) {
      return { success: false, detail: lastGoogleError };
    }

    // ── 二次过滤：剔除画廊、博物馆、餐厅、书店、学校等明显不相关业态 ──
    // Google Places 用关键词模糊匹配，"camera"/"spy"/"security" 经常匹到摄影画廊、
    // 摄影书店、艺术学院之类。这里按 Places type 和公司名再过一遍，并按相关度排序。
    const scored = Array.from(placeMap.values())
      .map((p: any) => ({ ...p, _score: scoreMapPlace(p) }))
      .filter((p: any) => p._score >= 0)
      .sort((a: any, b: any) => b._score - a._score);
    const filteredOutByRelevance = placeMap.size - scored.length;
    const filteredPlaces = scored.slice(0, targetCount);

    if (filteredPlaces.length === 0) {
      return {
        success: false,
        query: `${keyword} | ${regionValue} | ${customer_type}`,
        result_count: 0,
        results: [],
        source: 'google_maps',
        model_used: 'google_places',
        search_time: 0,
        detail: blockedMatchCount > 0
          ? `Google Maps 找到的结果都已在屏蔽列表中，已过滤 ${blockedMatchCount} 条。建议换一个城市/区域，或把产品词改宽一些，例如 security equipment、CCTV、spy shop、investigation supplies。已尝试: ${queryTerms.join(' / ')}`
          : `Google Maps 没有找到可用结果。建议把城市缩小到具体区域，或把产品词改宽一些，例如 security equipment、CCTV、spy shop、investigation supplies。已尝试: ${queryTerms.join(' / ')}`,
      };
    }

    const placesContent = JSON.stringify(filteredPlaces.map((p: any) => {
      // Google Places 只返回电话，无法直接判断是否开通 WhatsApp。
      // 只有用户开启 whatsapp_priority 且手机号段命中（如意大利 +393、英国 +447、德国 +491 等）
      // 才标记为「候选」，不是「已验证」。否则一律留空，避免普通座机被当成 WhatsApp 入口。
      const isWaCandidate = whatsapp_priority && isLikelyWhatsAppPhone(p.phone, countryValue);
      const waCandidate = isWaCandidate ? p.phone : '';
      // 营业状态翻译（Google Places 返回的是英文枚举）
      const bizStatusZh = (() => {
        const s = String(p.business_status || '').toUpperCase();
        if (s === 'OPERATIONAL') return '正常营业';
        if (s === 'CLOSED_TEMPORARILY') return '临时停业';
        if (s === 'CLOSED_PERMANENTLY') return '已关闭';
        return '';
      })();
      // Google 评分文案：高分意味着客流稳定，对销售也是有用信号
      const ratingNote = p.rating
        ? p.rating >= 4.5 ? '客流好评高'
        : p.rating >= 4.0 ? '口碑稳定'
        : p.rating >= 3.5 ? '口碑一般'
        : '口碑偏弱（需注意）'
        : '';
      // 让 background 也带一点差异化信息，不再是"是 X 的 Google Maps 商家"模板
      const placeTypeHints = (p.types || [])
        .filter((t: string) => !['point_of_interest', 'establishment'].includes(t))
        .slice(0, 3)
        .join('、');
      const bgParts = [
        placeTypeHints ? `Google 分类：${placeTypeHints}` : '',
        bizStatusZh,
        ratingNote,
      ].filter(Boolean);
      return {
        name: p.name,
        website: p.website,
        type: inferPlaceType(p.types, customer_type),
        address: p.address,
        rating: p.rating || '未公开获取',
        google_maps_url: p.google_maps_url,
        background: bgParts.join(' · '),
        matched_query: p.query || '',
        match_reason: buildMapMatchReason(keyword, p, customer_type),
        email: '未公开获取',
        phone: p.phone || '未公开获取',
        // 候选 WhatsApp 字段（前端会显示为「WhatsApp 候选」），未命中手机号段一律留空。
        whatsapp: waCandidate || '未公开获取',
        verification_note: isWaCandidate
          ? '手机号段匹配，WhatsApp 候选，需人工确认是否真实开通'
          : (p.phone
            ? '仅返回电话/座机，WhatsApp 未公开验证，建议先打电话确认'
            : 'Google Maps 未公开电话/WhatsApp'),
        linkedin: '未公开获取',
      };
    }));
    const results = parseResults(placesContent, countryValue, 'google_maps');
    return {
      success: true,
      query: `${keyword} | ${regionValue} | ${customer_type}`,
      result_count: results.length,
      results,
      source: 'google_maps',
      model_used: 'google_places',
      search_time: 0,
      filtered_blocked_count: blockedMatchCount,
      filtered_irrelevant_count: filteredOutByRelevance,
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, detail: '地图获客请求超时（>180秒），请重试' };
    }
    console.error('[Map Search] error:', err.message);
    return { success: false, detail: `地图获客失败: ${err.message}` };
  }
}

/**
 * 用 Jina Reader 并发验证官网真实性。
 * 每个站点 8s 超时，整体不超过 overallTimeoutMs。
 * 验证只判断"官网是否能返回有效内容"，并把结论写进 verified / verificationNote 字段。
 * 失败的站点不会被丢弃，仅标注未通过验证。
 */
async function verifyWebsitesWithJina(results: any[], overallTimeoutMs: number): Promise<any[]> {
  const PER_SITE_TIMEOUT_MS = 8_000;

  const verifyOne = async (r: any) => {
    if (!r.website) {
      return { ...r, verified: false, verificationNote: '未提供官网链接' };
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PER_SITE_TIMEOUT_MS);
    try {
      const res = await fetch(`https://r.jina.ai/${r.website}`, {
        headers: { Accept: 'application/json', 'X-Return-Format': 'markdown' },
        signal: ctrl.signal,
      });
      if (!res.ok) {
        return { ...r, verified: false, verificationNote: `Jina 验证失败 (HTTP ${res.status})` };
      }
      const data = await res.json().catch(() => null);
      const content: string = data?.data?.content || data?.data?.markdown || '';
      if (!content || content.length < 200) {
        return { ...r, verified: false, verificationNote: '官网返回内容过少，未公开验证' };
      }
      const companyToken = String(r.company || '')
        .toLowerCase()
        .replace(/[^a-z0-9 ]+/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length >= 3)
        .slice(0, 3);
      const lower = content.toLowerCase();
      const matched = companyToken.some((t) => lower.includes(t));
      return {
        ...r,
        verified: true,
        verificationNote: matched
          ? '官网可访问，公司名匹配'
          : '官网可访问，但公司名未在首页匹配，需人工确认',
      };
    } catch (e: any) {
      const reason = e?.name === 'AbortError' ? '验证超时' : '验证抛错';
      return { ...r, verified: false, verificationNote: reason };
    } finally {
      clearTimeout(timer);
    }
  };

  return await Promise.race([
    Promise.all(results.map(verifyOne)),
    new Promise<any[]>((resolve) =>
      setTimeout(
        () =>
          resolve(
            results.map((r) => ({
              ...r,
              verified: false,
              verificationNote: '整体验证超时，已跳过',
            }))
          ),
        overallTimeoutMs
      )
    ),
  ]);
}

function buildMapSearchQueries(keyword: string, customerType: string, region: string, country: string): string[] {
  // 去重：region 和 country 相同（用户只填了一个）时不要拼成 "Italy Italy"
  const r = (region || '').trim();
  const c = (country || '').trim();
  const location =
    !r ? c
    : !c ? r
    : r.toLowerCase() === c.toLowerCase() ? r
    : r.toLowerCase().includes(c.toLowerCase()) ? r
    : c.toLowerCase().includes(r.toLowerCase()) ? c
    : `${r} ${c}`;
  const typeQueries: Record<string, string[]> = {
    all: [
      `${keyword} ${location}`,
      `spy shop ${location}`,
      `nanny camera store ${location}`,
      `hidden camera shop ${location}`,
      `voice recorder shop ${location}`,
      `counter surveillance ${location}`,
      `investigation supplies ${location}`,
      `forensic equipment supplier ${location}`,
      `GPS tracker store ${location}`,
      `security equipment wholesaler ${location}`,
      `CCTV supplier ${location}`,
      `electronics security store ${location}`,
    ],
    b2c_online: [
      `spy shop ${location}`,
      `security equipment store ${location}`,
      `surveillance camera shop ${location}`,
      `CCTV store ${location}`,
      `electronics store security camera ${location}`,
      `spy equipment store ${location}`,
    ],
    offline_retail: [
      `security equipment wholesaler ${location}`,
      `CCTV distributor ${location}`,
      `surveillance equipment supplier ${location}`,
      `electronics wholesaler security ${location}`,
      `security products distributor ${location}`,
      `spy equipment supplier ${location}`,
    ],
    system_integrator: [
      `security system integrator ${location}`,
      `CCTV installer ${location}`,
      `video surveillance installer ${location}`,
      `alarm and CCTV systems ${location}`,
      `security solutions company ${location}`,
      `surveillance system supplier ${location}`,
    ],
  };
  const queries = typeQueries[customerType] || typeQueries.all;
  // 把命中用户产品关键词的那条查询放最前（最贴近用户意图），其余随机洗牌
  // 避免每次相同输入永远返回相同 5 条结果，业务员能看到不同切面的客户
  const head = queries.filter((q) => q.toLowerCase().includes(String(keyword).toLowerCase()));
  const tail = queries.filter((q) => !q.toLowerCase().includes(String(keyword).toLowerCase()));
  const shuffledTail = tail.sort(() => Math.random() - 0.5);
  return Array.from(new Set([...head, ...shuffledTail])).slice(0, 10);
}

function normalizeCompanyName(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(srl|s r l|ltd|limited|gmbh|sarl|sas|spa|s p a|inc|llc|co|company)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferPlaceType(types: string[] = [], customerType: string): string {
  const joined = types.join(' ').toLowerCase();
  if (customerType === 'system_integrator' || joined.includes('security')) return '安防公司 / 系统集成商';
  if (customerType === 'offline_retail') return '批发商 / 零售门店';
  if (customerType === 'b2c_online') return '线下零售';
  if (joined.includes('locksmith')) return '开锁/防盗店';
  if (joined.includes('electronics')) return '电子产品零售商';
  if (joined.includes('hardware')) return '五金/电子配件店';
  return '地图线索（待人工分类）';
}

function isLikelyWhatsAppPhone(phone: string, country: string): boolean {
  if (!phone) return false;
  const compact = phone.replace(/[^\d+]/g, '');
  const digits = compact.replace(/\D/g, '');
  if (digits.length < 8) return false;
  const lowerCountry = country.toLowerCase();
  if (lowerCountry.includes('italy') || compact.startsWith('+39')) return compact.startsWith('+393') || digits.startsWith('393');
  if (lowerCountry.includes('united kingdom') || lowerCountry === 'uk' || compact.startsWith('+44')) return compact.startsWith('+447') || digits.startsWith('447');
  if (lowerCountry.includes('france') || compact.startsWith('+33')) return compact.startsWith('+336') || compact.startsWith('+337') || digits.startsWith('336') || digits.startsWith('337');
  if (lowerCountry.includes('germany') || compact.startsWith('+49')) return compact.startsWith('+491') || digits.startsWith('491');
  if (lowerCountry.includes('spain') || compact.startsWith('+34')) return compact.startsWith('+346') || compact.startsWith('+347') || digits.startsWith('346') || digits.startsWith('347');
  return false;
}

/**
 * 根据业务员输入的 keyword 智能映射到本公司产品线 + 推荐型号。
 *
 * 产品线 -> 推荐型号的映射在 [src/config/company.ts] 的 COMPANY.productLineMap。
 * 这里只负责关键词分桶（前后顺序有意保留：录音笔在 spy camera 前判，避免 "audio camera" 错分）。
 */
function detectProductFocus(keyword: string): { line: string; pitch: string } {
  const k = (keyword || '').toLowerCase();

  for (const entry of COMPANY.productLineMap) {
    try {
      if (new RegExp(entry.pattern, 'i').test(k)) {
        return {
          line: entry.line,
          pitch: `主推 ${entry.models.join(' / ')}`,
        };
      }
    } catch {
      // 容忍单条 pattern 写错，不要拖垮整个搜索
      continue;
    }
  }

  // 兜底：keyword 完全识别不出来产品线
  return {
    line: COMPANY.productLineFallback.line,
    pitch: `建议人工判断后从 ${COMPANY.productLineFallback.models.join(' / ')} 里挑切入点`,
  };
}

function buildMapMatchReason(keyword: string, place: any, customerType: string): string {
  const types: string[] = place.types || [];
  const joined = types.join(' ').toLowerCase();
  const name = String(place.name || '').toLowerCase();
  const focus = detectProductFocus(keyword);

  // 业态：从 Google Places types + 公司名推断这是什么生意
  let bizAngle = '';
  if (joined.includes('locksmith') || name.includes('locksmith') || name.includes('fabbro')) {
    bizAngle = '本地开锁/防盗门店，常做安防补货';
  } else if (joined.includes('security')) {
    bizAngle = '安防服务商 / 系统集成商，是 B2B 监控套装核心买家';
  } else if (name.includes('spy') || name.includes('detective') || name.includes('investiga')
      || name.includes('detektiv') || name.includes('spia')) {
    bizAngle = '名称含 spy / detective / investiga，是我们的高匹配买家画像';
  } else if (joined.includes('electronics') || joined.includes('hardware')) {
    bizAngle = '电子 / 五金零售店，毛利敏感、客单低、补货频繁';
  } else if (customerType === 'system_integrator') {
    bizAngle = '系统集成商可对接，B2B 监控套装 + DIY 模组';
  } else if (joined.includes('store') || joined.includes('shop')) {
    bizAngle = '线下零售门店，先样品试销再 B2B 续单';
  } else {
    bizAngle = '业态不明，可人工核实后破冰';
  }

  // 一句话：业务员输入的产品 → 这家业态 → 该推哪几款
  const kw = (keyword || '').trim();
  const kwHint = kw ? `与你搜的【${kw}】对口` : `与${COMPANY.brandName}产品线对口`;
  return `${kwHint} → ${bizAngle}。产品线：${focus.line}，${focus.pitch}。`;
}

function parseResults(content: string, country: string, source: 'ai_web_search' | 'google_maps' | 'map_ai_search' = 'ai_web_search'): any[] {
  let jsonStr = content.trim();
  
  // 移除 markdown 代码块标记
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```\w*\n?/, '').replace(/\n?```$/, '').trim();
  }

  let companies: any[];
  
  try {
    // 第一次尝试：直接解析
    companies = JSON.parse(jsonStr);
    console.log('[Search] JSON parse success, count:', companies.length);
  } catch (e) {
    console.error('[Search] JSON parse error:', e);
    console.log('[Search] Content preview:', jsonStr.substring(0, 500));
    
    // 第二次尝试：提取方括号内的数组
    try {
      const match = jsonStr.match(/\[[\s\S]*\]/);
      if (match) {
        companies = JSON.parse(match[0]);
        console.log('[Search] JSON extracted from brackets, count:', companies.length);
      } else {
        // 第三次尝试：查找 JSON 对象数组
        const objMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (objMatch) {
          const obj = JSON.parse(objMatch[0]);
          companies = Array.isArray(obj) ? obj : [obj];
        } else {
          console.error('[Search] No valid JSON found in content');
          return [];
        }
      }
    } catch (extractErr) {
      console.error('[Search] JSON extraction failed:', extractErr);
      return [];
    }
  }

  // 确保结果是数组
  if (!Array.isArray(companies)) {
    console.log('[Search] Parsed result is not array, type:', typeof companies);
    companies = typeof companies === 'object' && companies !== null ? [companies] : [];
  }
  
  if (companies.length === 0) {
    console.log('[Search] No companies found in parsed result');
  }

  return companies.filter(c => c && typeof c === 'object').map((c, i) => {
    const name = c.name || c.company || `Company ${i + 1}`;
    const website = c.website || c.url || '';
    const companyType = c.type || 'Unknown';
    const background = c.background || c.description || '';
    const matchReason = c.match_reason || c.matchReason || '';
    let email = String(c.email || '');
    let phone = String(c.phone || '');
    let whatsapp = String(c.whatsapp || c.whatsApp || '');
    let linkedin = c.linkedin || null;
    const address = c.address || c.formatted_address || '';
    const rating = c.rating || '';
    let googleMapsUrl = c.google_maps_url || c.googleMapsUrl || c.maps_url || '';
    const verificationNote = c.verification_note || c.verificationNote || '';
    const verified = typeof c.verified === 'boolean' ? c.verified : undefined;
    const matchedQuery = c.matched_query || c.query || '';

    if (['未公开获取', 'N/A', 'None', 'null', 'n/a', ''].includes(email)) email = '';
    if (['未公开获取', 'N/A', 'None', 'null', 'n/a', ''].includes(phone)) phone = '';
    if (['未公开获取', 'N/A', 'None', 'null', 'n/a', ''].includes(whatsapp)) whatsapp = '';
    if (['未公开获取', 'N/A', 'None', 'null', 'n/a'].includes(String(linkedin || ''))) linkedin = null;
    if (['未公开获取', 'N/A', 'None', 'null', 'n/a'].includes(String(googleMapsUrl || ''))) googleMapsUrl = '';

    // ── 过滤 AI 编造的泛用前缀邮箱（最高幻觉模式） ──
    // info@、sales@、contact@、admin@、support@、hello@ + 域名
    // 这类邮箱是 AI 最常见的幻觉：它没有真正访问官网，只是根据域名猜测出通用邮箱
    // 策略：如果邮箱是泛用前缀且域名与 website 完全匹配，视为高度疑似幻觉，清空
    if (email) {
      const genericPrefixes = ['info@', 'sales@', 'contact@', 'admin@', 'support@', 'hello@', 'office@', 'mail@', 'web@'];
      const isGenericPrefix = genericPrefixes.some(p => email.toLowerCase().startsWith(p));
      if (isGenericPrefix && website) {
        try {
          const emailDomain = email.split('@')[1]?.toLowerCase();
          const webDomain = new URL(website).hostname.toLowerCase().replace(/^www\./, '');
          if (emailDomain === webDomain) {
            // 域名完全匹配 + 泛用前缀 = 高度疑似幻觉，清空
            email = '';
          }
        } catch { /* URL 解析失败则保留 */ }
      }
    }

    // 过滤明显 AI 编造的假电话号码模式
    if (phone) {
      const digitsOnly = phone.replace(/[\s\-\(\)\+\.]/g, '');
      const hasObviousFake = (
        digitsOnly.includes('12345678') ||
        digitsOnly.includes('1234567') ||
        digitsOnly.includes('00000000') ||
        digitsOnly.includes('0000000') ||
        digitsOnly.includes('11111111') ||
        digitsOnly.includes('1111111') ||
        digitsOnly.includes('99999999') ||
        digitsOnly.includes('9999999') ||
        digitsOnly.includes('5555555') ||
        digitsOnly.includes('123456') ||
        digitsOnly.includes('654321') ||
        digitsOnly.includes('000000') ||
        digitsOnly.includes('111111') ||
        digitsOnly.includes('222222') ||
        digitsOnly.includes('333333') ||
        digitsOnly.includes('444444') ||
        digitsOnly.includes('555555') ||
        digitsOnly.includes('666666') ||
        digitsOnly.includes('777777') ||
        digitsOnly.includes('888888') ||
        digitsOnly.includes('999999') ||
        // 重复相同数字超过 6 次
        /(\d)\1{5,}/.test(digitsOnly) ||
        // 纯递增数字（如 1234567890）
        /^0*1*2*3*4*5*6*7*8*9*$/.test(digitsOnly) ||
        // 纯递减数字
        /^9*8*7*6*5*4*3*2*1*0*$/.test(digitsOnly)
      );
      if (hasObviousFake) phone = '';
    }
    if (whatsapp) {
      const digitsOnly = whatsapp.replace(/[\s\-\(\)\+\.]/g, '');
      if (digitsOnly.length < 8 || /(\d)\1{5,}/.test(digitsOnly)) whatsapp = '';
    }

    const tags = mapTypeToTags(companyType);
    if (source === 'google_maps' || source === 'map_ai_search') tags.unshift('地图线索');
    // metaDescription 只放 background：matchReason 在 UI 上有独立的黄色高亮区，
    // 重复显示会让卡片信息看起来"翻倍"。
    const metaDesc = background || matchReason || '';
    // 客户分级 A/B/C：评分越高越值得优先打 WhatsApp
    const tierScore = computeLeadScore({
      type: companyType,
      name,
      email,
      phone,
      whatsapp,
      linkedin,
      rating: typeof rating === 'number' ? rating : Number(rating) || 0,
      verified,
      source,
    });
    const tier = tierScore >= 70 ? 'A' : tierScore >= 40 ? 'B' : 'C';
    const bgInfo = `[公司名称] ${name}\n[类型] ${companyType}${address ? `\n[地图地址] ${address}` : ''}${rating ? `\n[地图评分] ${rating}` : ''}\n[背景调查] ${background}${matchReason ? `\n[匹配度分析] ${matchReason}` : ''}${website ? `\n[官网] ${website}` : ''}${googleMapsUrl ? `\n[Google Maps] ${googleMapsUrl}` : ''}${email ? `\n[邮箱] ${email}` : ''}${phone ? `\n[电话] ${phone}` : ''}${whatsapp ? `\n[WhatsApp] ${whatsapp}` : ''}${linkedin ? `\n[LinkedIn] ${linkedin}` : ''}`;

    return {
      id: `ai-${Date.now()}-${i}`,
      company: name,
      website,
      title: `${name} - ${companyType}`,
      metaDescription: metaDesc,
      tags,
      customerBackgroundInfo: bgInfo,
      country,
      email,
      phone,
      whatsapp,
      linkedin,
      address,
      rating,
      googleMapsUrl,
      source,
      matchReason,
      verified,
      verificationNote,
      matchedQuery,
      tier,
      tierScore,
    };
  });
}

/**
 * 给一条潜在客户打分，决定 A / B / C 级。
 * 设计原则：业务员时间稀缺，A 级（70+）该优先打 WhatsApp 重点跟进。
 *
 * 维度（最高 110，封顶 100）：
 *  - 公司类型权重（最贴近 B2B 买家的最高）：0-30
 *  - 联系方式齐全度（邮箱 + 电话 + LinkedIn 全有）：0-25
 *  - 真实性验证状态（已通过 Jina 验证）：0-15
 *  - WhatsApp 候选/已知：0-10
 *  - 公司名命中安防关键词（spy / detective / security）：0-15
 *  - Google 评分 4.5+：0-10
 */
function computeLeadScore(params: {
  type: string;
  name: string;
  email: string;
  phone: string;
  whatsapp: string;
  linkedin: string | null;
  rating: number;
  verified?: boolean;
  source: string;
}): number {
  let score = 0;
  const typeLower = String(params.type || '').toLowerCase();
  // 1. 公司类型权重
  if (/(distributor|wholesale|wholesaler|批发|分销)/.test(typeLower)) score += 30;
  else if (/(private investigator|detective|私家侦探|侦探|forensic|取证)/.test(typeLower)) score += 30;
  else if (/(integrator|installer|集成|安装|system)/.test(typeLower)) score += 25;
  else if (/(security firm|security service|安防公司|spy shop)/.test(typeLower)) score += 22;
  else if (/(retail|线下零售|门店|electronics|电子)/.test(typeLower)) score += 15;
  else score += 5;

  // 2. 联系方式齐全度
  const contactBits = [params.email, params.phone, params.linkedin].filter(Boolean).length;
  score += contactBits * 8; // 0/8/16/24
  if (params.email) score += 1; // 邮箱微小加成（最常用渠道）

  // 3. 真实性验证
  if (params.verified === true) score += 15;
  else if (params.verified === false) score -= 5; // 明确未通过的扣点

  // 4. WhatsApp 候选
  if (params.whatsapp) score += 10;

  // 5. 公司名命中安防关键词
  const nameLower = String(params.name || '').toLowerCase();
  if (/\b(spy|detective|investiga|security|sicurezza|surveillance|cctv|forensic)\b/.test(nameLower)) {
    score += 15;
  }

  // 6. Google 评分
  if (params.rating >= 4.5) score += 10;
  else if (params.rating >= 4.0) score += 5;

  // 地图源默认补一点（实体存在更可信），网搜默认 0
  if (params.source === 'google_maps' || params.source === 'map_ai_search') score += 3;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function mapTypeToTags(type: string): string[] {
  const t = String(type || '').toLowerCase();
  const tags: string[] = [];
  if (['distributor', 'wholesale', 'wholesaler', '批发', '分销'].some((w) => t.includes(w))) tags.push('批发商');
  if (['retail', 'online', 'e-commerce', 'ecommerce', '电商', '线上', 'b2c'].some((w) => t.includes(w))) tags.push('线上 B2C 卖家');
  if (['integrator', 'installer', '集成', '安装', 'system'].some((w) => t.includes(w))) tags.push('系统集成商');
  if (['manufacturer', '制造', '生产'].some((w) => t.includes(w))) tags.push('制造商');
  if (['private investigator', 'detective', '私家侦探', '侦探'].some((w) => t.includes(w))) tags.push('私家侦探');
  if (['security firm', 'security service', 'security', '安防公司', '安保'].some((w) => t.includes(w))) tags.push('安防公司');
  if (['forensic', '取证'].some((w) => t.includes(w))) tags.push('取证服务');
  if (['retail chain', '零售连锁', '门店'].some((w) => t.includes(w))) tags.push('线下零售');
  if (['locksmith', '开锁', '锁匠'].some((w) => t.includes(w))) tags.push('开锁/防盗店');
  if (['spy shop', '间谍店'].some((w) => t.includes(w))) tags.push('Spy Shop');
  if (!tags.length) tags.push('待分类');
  return Array.from(new Set(tags));
}

/* ─────────── 全 EU 精准搜索（第 3 个 tab） ─────────── */

/**
 * Grade A 客户评分。0-11 分；< 5 直接丢。
 * 之所以做硬阈值，是因为业务员选这个 tab 就是要"高质量 6 家"，宁缺毋滥。
 */
function scoreEuPremiumCandidate(item: any, tier1IsoSet: Set<string>): { score: number; notes: string[] } {
  let score = 0;
  const notes: string[] = [];
  const name = String(item.name || '').toLowerCase();
  const type = String(item.type || '').toLowerCase();
  const types: string[] = item.types || [];
  const country = String(item.country || item.address || '').toLowerCase();
  const iso = String(item.country_iso || '').toUpperCase();

  // 业态命中本公司强买家画像
  const bizSignal = ['spy', 'detective', 'investiga', 'security', 'surveillance', 'forensic', 'covert', 'counter-surveillance']
    .some((k) => name.includes(k) || type.includes(k) || types.join(' ').toLowerCase().includes(k));
  if (bizSignal) {
    score += 3;
    notes.push('业态强匹配');
  }

  if (item.website) {
    score += 2;
    notes.push('有官网');
  }
  if (item.email && item.email !== '未公开获取') {
    score += 2;
    notes.push('有邮箱');
  }
  if (item.phone && item.phone !== '未公开获取') {
    score += 1;
    notes.push('有电话');
  }

  // Tier 1 EU 国家命中（按 ISO 或国家名字串模糊匹配）
  if (iso && tier1IsoSet.has(iso)) {
    score += 2;
    notes.push(`Tier 1 (${iso})`);
  } else {
    // 名字串里匹配
    const tier1Names = ['italy', 'germany', 'france', 'united kingdom', 'spain', 'netherlands', 'sweden', 'austria', 'switzerland', 'belgium', 'norway', 'denmark', 'finland'];
    if (tier1Names.some((n) => country.includes(n))) {
      score += 2;
      notes.push('Tier 1');
    }
  }

  if (typeof item.rating === 'number' && item.rating >= 4.5) {
    score += 1;
    notes.push(`★${item.rating}`);
  }

  return { score, notes };
}

function dedupeByDomain(items: any[]): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const it of items) {
    const dom = extractDomainSafe(it.website) || `${(it.name || '').toLowerCase()}__${(it.country || '').toLowerCase()}`;
    if (!dom || seen.has(dom)) continue;
    seen.add(dom);
    out.push(it);
  }
  return out;
}

function extractDomainSafe(url: string): string {
  if (!url) return '';
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function buildEuPremiumPrompt(countries: { country: string; iso: string }[]): { system: string; user: string } {
  const countryListEn = countries.map((c) => c.country).join(', ');
  const system = `你是 B2B 渠道开发资深客户挖掘专家，专为 ${COMPANY.brandName}（${COMPANY.industryEn}）寻找全欧顶级渠道客户。

# 严格约束（违反一条整段重写）
1. **必须真实存在**——每家公司必须能在 Google / OpenCorporates / LinkedIn 验证，绝不允许编造
2. **必须有真实官网**——找不到官网 → 不返回这家
3. **联系方式只填真**——邮箱/电话必须从官网或可验证来源找到，info@/sales@/contact@ 泛用前缀邮箱**只有在官网亲眼看到时**才返回，否则填空字符串
4. **业态白名单**：${COMPANY.mapBusinessNameAllowPatterns.join(' / ')} 相关业态、相关渠道经销商、相关系统集成商
5. **黑名单（不要这种）**：超大上市公司、通用 3C 零售（MediaMarkt / Saturn / Currys 等大众零售）、消费电子电商
6. **必在 Tier 1 EU 国家**：${countryListEn}
7. 每家配一段 evidence 说明为什么是 Grade A（多大规模、什么类型、为什么对本公司产品线对口）

# 输出 JSON 数组（8-12 条候选）
\`\`\`json
[
  {
    "name": "公司全称",
    "website": "https://...",
    "country": "Italy",
    "country_iso": "IT",
    "type": "中文业态：私家侦探 / 安防经销商 / 系统集成商 / Spy Shop / 取证服务",
    "background": "1-2 句中文：成立时间、规模、核心业务",
    "email": "真实邮箱或空字符串",
    "phone": "+39 ... 真实电话或空字符串",
    "linkedin": "https://linkedin.com/company/... 或空字符串",
    "evidence": "为什么是 Grade A：业态契合度 + 规模 + 对我们哪条产品线最有兴趣"
  }
]
\`\`\`

只输出 JSON 数组，不要 markdown 代码块标记。`;

  const user = `请从联网搜索结果里找出 8-12 家分布在以下国家的 Grade A ${COMPANY.industryEn} 相关 B2B 客户。每个国家至少 1 家，分布尽量均衡。

目标国家：${countryListEn}

为每家公司返回上述 JSON 结构。如果某项联系方式无法从公开来源验证，请填空字符串（""），**绝不编造**。`;

  return { system, user };
}

async function runEuPremiumAiBranch(
  apiKey: string,
  baseUrl: string,
  countries: { country: string; iso: string }[],
  signal: AbortSignal,
): Promise<{ items: any[]; error?: string }> {
  const { system, user } = buildEuPremiumPrompt(countries);
  try {
    const ctrl = new AbortController();
    const fwd = () => ctrl.abort();
    signal.addEventListener('abort', fwd);
    const localTimeout = setTimeout(() => ctrl.abort(), 90_000);
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: SEARCH_MODEL,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: 0.6,
          max_tokens: 5000,
        }),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(localTimeout);
      signal.removeEventListener('abort', fwd);
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return { items: [], error: `AI 路 HTTP ${res.status}: ${txt.slice(0, 160)}` };
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || '';
    const items = parseResults(content, '', 'ai_web_search');
    return { items: items.filter((x) => x && x.name) };
  } catch (err: any) {
    return { items: [], error: `AI 路异常: ${err?.message || err}` };
  }
}

async function runEuPremiumMapBranch(
  countries: { country: string; iso: string }[],
  signal: AbortSignal,
): Promise<{ items: any[]; error?: string }> {
  if (!GOOGLE_MAPS_API_KEY) return { items: [], error: 'GOOGLE_MAPS_API_KEY 未配置，地图路跳过' };

  // 每国 2 条查询；并发跑，单条 12s 超时
  const queryTemplates = (country: string) => [
    `spy shop ${country}`,
    `private investigator equipment ${country}`,
  ];

  const fetchOne = async (textQuery: string, country: string, iso: string): Promise<any[]> => {
    try {
      const ctrl = new AbortController();
      const fwd = () => ctrl.abort();
      signal.addEventListener('abort', fwd);
      const t = setTimeout(() => ctrl.abort(), 12_000);
      let res: Response;
      try {
        res = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
            'X-Goog-FieldMask': [
              'places.id',
              'places.displayName',
              'places.formattedAddress',
              'places.nationalPhoneNumber',
              'places.internationalPhoneNumber',
              'places.websiteUri',
              'places.googleMapsUri',
              'places.rating',
              'places.businessStatus',
              'places.types',
            ].join(','),
          },
          body: JSON.stringify({ textQuery, maxResultCount: 5, languageCode: 'en' }),
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(t);
        signal.removeEventListener('abort', fwd);
      }
      if (!res.ok) return [];
      const data = await res.json();
      const places = Array.isArray(data?.places) ? data.places : [];
      return places.map((p: any) => {
        const phone = p.internationalPhoneNumber || p.nationalPhoneNumber || '';
        // 手机号段命中（如意大利 +393、英国 +447、德国 +491）→ WhatsApp 候选，否则留空
        const waCandidate = isLikelyWhatsAppPhone(phone, country) ? phone : '';
        // 给地图结果也凑一行 background，避免下游"展开详情"空白
        const placeTypeHints = (p.types || [])
          .filter((t: string) => !['point_of_interest', 'establishment'].includes(t))
          .slice(0, 3)
          .join('、');
        const ratingNote = typeof p.rating === 'number'
          ? p.rating >= 4.5 ? '客流好评高' : p.rating >= 4.0 ? '口碑稳定' : ''
          : '';
        const bg = [placeTypeHints ? `Google 分类：${placeTypeHints}` : '', ratingNote]
          .filter(Boolean).join(' · ');
        return {
          name: p.displayName?.text || '',
          website: p.websiteUri || '',
          country,
          country_iso: iso,
          type: inferPlaceType(p.types, 'all'),
          types: p.types || [],
          address: p.formattedAddress || '',
          rating: typeof p.rating === 'number' ? p.rating : null,
          google_maps_url: p.googleMapsUri || '',
          background: bg,
          phone,
          email: '',
          whatsapp: waCandidate,
          linkedin: '',
          source_branch: 'map',
        };
      }).filter((x: any) => x.name);
    } catch {
      return [];
    }
  };

  try {
    const allTasks: Promise<any[]>[] = [];
    for (const c of countries) {
      for (const q of queryTemplates(c.country)) {
        allTasks.push(fetchOne(q, c.country, c.iso));
      }
    }
    const results = await Promise.all(allTasks);
    const flat = results.flat();
    return { items: flat };
  } catch (err: any) {
    return { items: [], error: `地图路异常: ${err?.message || err}` };
  }
}

/**
 * 通过 Jina Reader 抓官网 Markdown，正则抠真实邮箱 + wa.me 链接。
 * 给已经评分通过的 top 6 用——比 AI 自报告的"未公开获取"靠谱得多。
 */
const GENERIC_EMAIL_PREFIXES = /^(?:no-?reply|noreply|do-?not-?reply|donotreply|abuse|postmaster|webmaster|admin@example)/i;

function extractRealEmailsFromMarkdown(md: string, websiteDomain: string): string[] {
  if (!md) return [];
  const re = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  const hits = (md.match(re) || [])
    .map((e) => e.toLowerCase())
    .filter((e) => !GENERIC_EMAIL_PREFIXES.test(e))
    .filter((e) => {
      // 偏好同域名邮箱（更可信）。不强制——有时候公司用 gmail 也是真的
      if (!websiteDomain) return true;
      const dom = e.split('@')[1] || '';
      return dom === websiteDomain || dom.endsWith('.' + websiteDomain) || !dom.includes('example');
    });
  return Array.from(new Set(hits));
}

function extractWaMeNumbersFromMarkdown(md: string): string[] {
  if (!md) return [];
  // wa.me/391234567890  或  api.whatsapp.com/send?phone=...
  const re = /(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=)[+]?(\d{8,15})/gi;
  const hits: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(md))) hits.push('+' + m[1]);
  return Array.from(new Set(hits));
}

async function enrichTopSixWithJina(items: any[], signal: AbortSignal): Promise<any[]> {
  const PER_TIMEOUT = 9_000;
  const tasks = items.map(async (it) => {
    if (!it.website) return it;
    let websiteDomain = '';
    try {
      websiteDomain = new URL(it.website.startsWith('http') ? it.website : `https://${it.website}`)
        .hostname.replace(/^www\./, '').toLowerCase();
    } catch {}
    try {
      const ctrl = new AbortController();
      const fwd = () => ctrl.abort();
      signal.addEventListener('abort', fwd);
      const t = setTimeout(() => ctrl.abort(), PER_TIMEOUT);
      let res: Response;
      try {
        res = await fetch(`https://r.jina.ai/${it.website}`, {
          headers: { Accept: 'application/json', 'X-Return-Format': 'markdown' },
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(t);
        signal.removeEventListener('abort', fwd);
      }
      if (!res.ok) return it;
      const data = await res.json().catch(() => null);
      const md: string = data?.data?.content || data?.data?.markdown || '';
      if (!md || md.length < 100) return it;

      const realEmails = extractRealEmailsFromMarkdown(md, websiteDomain);
      const waNumbers = extractWaMeNumbersFromMarkdown(md);

      const next = { ...it };
      // 邮箱：只在原本为空时才补
      if (!next.email && realEmails.length > 0) next.email = realEmails[0];
      // WhatsApp：只在原本为空时才补，且必须有 wa.me 链接证据
      if (!next.whatsapp && waNumbers.length > 0) next.whatsapp = waNumbers[0];
      // 标记一下数据来源，方便业务员判断
      const enrichNotes: string[] = [];
      if (realEmails.length > 0) enrichNotes.push(`官网抠到 ${realEmails.length} 个真实邮箱`);
      if (waNumbers.length > 0) enrichNotes.push(`官网 wa.me 链接 ${waNumbers.length} 个`);
      if (enrichNotes.length > 0) next._enrich_notes = enrichNotes;
      return next;
    } catch {
      return it;
    }
  });
  return Promise.all(tasks);
}

async function runEuPremiumSearch(
  apiKey: string,
  baseUrl: string,
  body: Record<string, any>,
  signal: AbortSignal,
): Promise<any> {
  const TARGET = 6;
  const blocklist: string[] = Array.isArray(body.blocklist) ? body.blocklist : [];
  const normalizedBlocklist = blocklist.map((x: string) => normalizeCompanyName(x)).filter(Boolean);

  const countries = await listTier1EuCountries();
  const tier1IsoSet = new Set(countries.map((c) => c.iso));

  // 双路并发
  const [aiRes, mapRes] = await Promise.all([
    runEuPremiumAiBranch(apiKey, baseUrl, countries, signal),
    runEuPremiumMapBranch(countries, signal),
  ]);

  const warnings: string[] = [];
  if (aiRes.error) warnings.push(`⚠️ ${aiRes.error}`);
  if (mapRes.error) warnings.push(`⚠️ ${mapRes.error}`);

  // 合并 → 去重 → 评分 → 取 top 6
  const merged: any[] = [...aiRes.items, ...mapRes.items];

  // 应用 blocklist
  const afterBlock = merged.filter((it) => {
    const norm = normalizeCompanyName(it.name || '');
    if (!norm) return false;
    return !normalizedBlocklist.some((b) => norm.includes(b) || b.includes(norm));
  });

  const deduped = dedupeByDomain(afterBlock);

  const scored = deduped
    .map((it) => {
      const { score, notes } = scoreEuPremiumCandidate(it, tier1IsoSet);
      return { ...it, _score: score, _scoreNotes: notes };
    })
    .filter((it) => it._score >= 5) // 强制 Grade A 门槛
    .sort((a, b) => b._score - a._score);

  const top = scored.slice(0, TARGET);

  if (top.length === 0) {
    const detail = warnings.length > 0
      ? `全 EU 精准搜索：未找到达到 Grade A 标准的客户。${warnings.join('；')}`
      : '全 EU 精准搜索：未找到达到 Grade A 标准的客户，请稍后重试。';
    return { success: false, detail };
  }

  // ── Jina 增强：top 6 用官网抠真实邮箱 + wa.me 号码（拿不到留空，绝不编造） ──
  const enriched = await enrichTopSixWithJina(top, signal);

  // 拼出业务员看的 match_reason + tags + customerBackgroundInfo
  const finalResults = enriched.map((it) => {
    const matchReason = `${it.type || '业态待分类'}｜${it.country || '欧洲'}｜评分 ${it._score}/11 (${(it._scoreNotes || []).join(' · ')})`;
    const tags = ['全EU精选', 'Grade A'];
    if (it.country) tags.push(it.country);

    // 用空字符串而不是 "未公开获取"——前端 r.whatsapp && ... 才能正确判断"没有"
    const email = it.email && it.email !== '未公开获取' ? String(it.email) : '';
    const phone = it.phone && it.phone !== '未公开获取' ? String(it.phone) : '';
    const whatsapp = it.whatsapp && it.whatsapp !== '未公开获取' ? String(it.whatsapp) : '';
    const linkedin = it.linkedin && it.linkedin !== '未公开获取' ? String(it.linkedin) : '';
    const googleMapsUrl = it.google_maps_url || '';
    const background = it.background || `Tier 1 EU 国家 ${it.country || ''}，本公司强匹配业态`;
    const ratingStr = typeof it.rating === 'number' ? `★ ${it.rating}` : '';
    const enrichNote = Array.isArray(it._enrich_notes) ? it._enrich_notes.join(' · ') : '';

    const customerBackgroundInfo = [
      `[公司名称] ${it.name}`,
      `[业态] ${it.type || '未分类'}`,
      `[国家] ${it.country || ''}${it.country_iso ? ` (${it.country_iso})` : ''}`,
      it.address ? `[地址] ${it.address}` : '',
      ratingStr ? `[评分] ${ratingStr}` : '',
      `[背景] ${background}`,
      `[匹配度分析] ${matchReason}`,
      it.website ? `[官网] ${it.website}` : '',
      googleMapsUrl ? `[Google Maps] ${googleMapsUrl}` : '',
      email ? `[邮箱] ${email}` : '',
      phone ? `[电话] ${phone}` : '',
      whatsapp ? `[WhatsApp] ${whatsapp}` : '',
      linkedin ? `[LinkedIn] ${linkedin}` : '',
      enrichNote ? `[数据增强] ${enrichNote}` : '',
      it.evidence ? `[Grade A 依据] ${it.evidence}` : '',
    ].filter(Boolean).join('\n');

    return {
      id: `eu-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      company: it.name,
      name: it.name,
      website: it.website || '',
      title: `${it.name} - ${it.type || 'Grade A 客户'}`,
      type: it.type || '',
      country: it.country || '',
      address: it.address || '',
      background,
      metaDescription: background,
      match_reason: matchReason,
      matchReason,
      email,
      phone,
      whatsapp,
      linkedin,
      google_maps_url: googleMapsUrl,
      googleMapsUrl,
      rating: typeof it.rating === 'number' ? it.rating : '',
      tags,
      customerBackgroundInfo,
      tier: 'A' as const,
      source: 'eu_premium_combined' as const,
    };
  });

  return {
    success: true,
    query: `全 EU 精准 ${TARGET} 家 Grade A 客户`,
    result_count: finalResults.length,
    results: finalResults,
    source: 'eu_premium_combined',
    model_used: `${SEARCH_MODEL} + google_places`,
    search_time: 0,
    warnings,
    candidate_pool: deduped.length,
  };
}
