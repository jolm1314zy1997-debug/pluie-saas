import { NextRequest, NextResponse } from 'next/server';
import { COMPANY } from '@/config/company';

const DEFAULT_BASE_URL = 'https://api.aihubmix.com/v1';
const DEFAULT_API_KEY = process.env.AIHUBMIX_API_KEY || '';

// 深度背调固定模型：K2.6 在成本和长文本分析质量之间更平衡。
const PROFILE_MODEL = 'kimi-k2.6';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 前端传了就用前端的，没传就用后端默认的
    const apiKey = body._api_key || DEFAULT_API_KEY;
    const baseUrl = body._base_url || DEFAULT_BASE_URL;
    const { _api_key: _1, _base_url: _2, ...profileBody } = body;

    if (!apiKey) {
      return NextResponse.json(
        { detail: '请先配置 API Key（点击右上角「配置」按钮填入，或联系管理员配置默认 Key）' },
        { status: 400 }
      );
    }

    const result = await callDeepProfileDirectly(apiKey, baseUrl, profileBody);
    return NextResponse.json(result);
  } catch (error: any) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return NextResponse.json(
        { detail: '深度背调请求超时（>180秒），请稍后重试' },
        { status: 504 }
      );
    }
    return NextResponse.json(
      { detail: `深度背调失败: ${error.message}` },
      { status: 502 }
    );
  }
}

/* ── 直接调用 aihubmix 深度背调 ── */

const SYSTEM_PROMPT = `你是一位资深的B2B企业背景调查专家，拥有强大的多步推理和深度研究能力。你能通过多层级的下钻搜索，从企业官网追查到高管名单，再从高管履历和社交媒体中挖掘关键商业情报。

**角色定位**: 我是${COMPANY.brandName}公司的业务员，主营${COMPANY.industryEn}。我需要你帮我深度分析潜在B2B客户，为我的销售跟进提供精准的商业洞察和谈资。

**核心能力 — 多层级下钻调查**:
1. 从公司名称和网站入手，搜索公司的基本注册信息（工商注册、成立年份、注册资本）
2. 从官网找到高管/管理团队名单（CEO、Sales Director、Purchasing Manager等）
3. 对关键高管进行搜索，了解其过往履历、行业经验、社交媒体发言（LinkedIn、Twitter等）
4. 搜索该公司的行业口碑、客户评价、媒体报道
5. 查找该公司是否参加过行业展会（IFSEC、Security Essen、ISC West等）
6. 分析其供应链关系，看是否有中国供应商合作历史

**输入**: 客户公司名称、网站、已有背景信息、已知联系方式。

请严格按照以下六个部分组织报告，每个部分都要有实质性内容：

**第一部分：公司实力综合评估**
- 核心指标：成立年限、员工规模、地理位置、市场声誉和行业地位
- 关键高管：CEO/创始人/管理团队背景、过往履历
- 财务状况：如有公开数据，评估营收规模、融资阶段和背后投资方
- 综合判断：给出"实力"初步结论（行业领导者/成长型企业/初创公司等）

**第二部分：客户画像精准描绘**
- 业务模式：B2B、B2C 还是 B2B2C
- 目标客群：最终用户画像
- 企业文化与价值观：从官网、社交媒体提炼的价值观和使命

**第三部分：主营业务与产品/服务分析**
- 核心类目：主营产品类别或核心服务项目
- 创新或特色：产品/服务中的亮点或区别于竞争对手的特色
- 与我们产品的互补性分析：他们卖的产品与我们（${COMPANY.industryEn}）是否有协同效应

**第四部分：渠道与合作伙伴分析**
- 供应链结构：上游供应商、下游分销渠道
- 合作伙伴网络：品牌合作伙伴、技术合作伙伴
- 进出口活动：是否有中国供应商合作历史、进口产品比例

**第五部分：关键人物情报（高管画像）**
- CEO/创始人：姓名、背景、LinkedIn（如有）、行业资历
- 销售负责人：联系人信息、决策权限
- 采购负责人：采购偏好、决策流程
- 这些人的社交媒体动态或公开言论

**第六部分：销售策略建议**
- 最佳接触方式：推荐首次联系的最佳渠道和时间
- 谈判筹码：基于分析的销售切入点
- 潜在合作模式建议
- 预估合作价值评估

重要规则：
1. 基于可获取的公开信息做分析，不要编造
2. 每个部分都要有实质内容，不要用空泛的描述敷衍
3. 重点关注与我们主营产品的关联性和合作机会
4. 如果你搜索到了某个高管的名字但信息不够，请说明信息来源和可信度
5. 如果某个部分确实找不到信息，诚实说明"未找到公开信息"，不要猜测`;

async function callDeepProfileDirectly(apiKey: string, baseUrl: string, body: Record<string, any>) {
  const { company, website, country, background_info = '', contacts = [] } = body;

  const userInfo = [
    `**客户公司**: ${company}`,
    website ? `**公司网站**: ${website}` : '',
    country ? `**所在国家**: ${country}` : '',
    background_info ? `**已知背景**: ${background_info}` : '',
    contacts.length > 0 ? `**已知联系方式**: ${contacts.map((c: any) => `${c.type}: ${c.value}`).join(', ')}` : '',
  ].filter(Boolean).join('\n');

  const userPrompt = `请对以下客户进行深度背调分析：\n\n${userInfo}\n\n请严格按照五个部分输出结构化报告。`;

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: PROFILE_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 4000,
      }),
      signal: AbortSignal.timeout(180_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { success: false, detail: `深度背调 API 调用失败 (${res.status}): ${errText}` };
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || '';
    if (!content) {
      return { success: false, detail: '深度背调 AI 返回内容为空，请重试' };
    }

    return {
      success: true,
      company,
      profile: content,
      model_used: PROFILE_MODEL,
    };
  } catch (err: any) {
    if (err.name === 'AbortError' || err.name === 'TimeoutError') {
      return { success: false, detail: '深度背调请求超时（>180秒）' };
    }
    return { success: false, detail: `深度背调失败: ${err.message}` };
  }
}
