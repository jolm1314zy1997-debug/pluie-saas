import { NextRequest, NextResponse } from 'next/server';

// Fluid Compute 启用后 Hobby 免费版 300 秒超时（vercel.json）

const AIHUBMIX_BASE_URL = 'https://api.aihubmix.com/v1';
const RESEARCH_MODEL = 'gemini-3-flash-preview-search';
const JINA_BASE_URL = 'https://r.jina.ai';

/**
 * AI 深度调查 API - 直接调用 Jina + aihubmix
 * 不再依赖本地后端
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { website, company_name, country, background_info } = body;
    
    // 使用用户传入的 API Key 或环境变量的 Key
    const apiKey = body.api_key || process.env.AIHUBMIX_API_KEY || '';
    
    if (!apiKey) {
      return NextResponse.json(
        { detail: '请先配置 API Key' },
        { status: 400 }
      );
    }

    // Step 1: Jina Reader 抓取首页
    const homeMarkdown = await jinaFetch(website);
    
    // Step 2: 正则提取联系方式
    const regexEmails = extractEmails(homeMarkdown);
    const regexPhones = extractPhones(homeMarkdown);
    const regexLinkedIn = extractLinkedIn(homeMarkdown);
    
    // Step 3: AI 分析提取联系方式和背调
    const aiResult = await analyzeWithAI(
      apiKey,
      company_name,
      website,
      country,
      background_info,
      homeMarkdown,
      regexEmails,
      regexPhones,
      regexLinkedIn
    );
    
    return NextResponse.json({
      success: true,
      website,
      company_name,
      contacts: aiResult.contacts,
      deep_profile: aiResult.deep_profile,
      company_info: aiResult.company_info,
      key_executives: aiResult.key_executives,
    });
    
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Research] Error:', message);
    return NextResponse.json(
      { detail: `深度调查失败: ${message}` },
      { status: 504 }
    );
  }
}

// Jina Reader 抓取网页
async function jinaFetch(url: string): Promise<string> {
  try {
    const jinaUrl = `${JINA_BASE_URL}/${url}`;
    const res = await fetch(jinaUrl, {
      headers: {
        'Accept': 'application/json',
        'X-Return-Format': 'markdown',
      },
    });
    
    if (!res.ok) return '';
    
    const data = await res.json();
    return data?.data?.content || data?.data?.markdown || '';
  } catch {
    return '';
  }
}

// 正则提取邮箱
function extractEmails(text: string): string[] {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(emailRegex) || [];
  return Array.from(new Set(matches)).slice(0, 5);
}

// 正则提取电话
function extractPhones(text: string): string[] {
  const phoneRegex = /[\+\d\(\)\-\s]{7,20}/g;
  const matches = text.match(phoneRegex) || [];
  return Array.from(new Set(matches)).filter(p => p.replace(/\D/g, '').length >= 7).slice(0, 3);
}

// 正则提取 LinkedIn
function extractLinkedIn(text: string): string[] {
  const linkedinRegex = /https:\/\/www\.linkedin\.com\/(?:company|in)\/[a-zA-Z0-9\-]+/g;
  const matches = text.match(linkedinRegex) || [];
  return Array.from(new Set(matches)).slice(0, 2);
}

// AI 分析
async function analyzeWithAI(
  apiKey: string,
  companyName: string,
  website: string,
  country: string,
  backgroundInfo: string,
  homeMarkdown: string,
  regexEmails: string[],
  regexPhones: string[],
  regexLinkedIn: string[]
) {
  const prompt = `你是一位专业的 B2B 企业调查专家，拥有联网搜索能力。请对目标公司进行深度调查。

## 目标公司
- 公司名称: ${companyName || 'Unknown'}
- 官网: ${website}
- 国家: ${country || '未知'}
- 背景信息: ${backgroundInfo || '暂无'}

## 任务

### 第一步：联网搜索联系方式
请务必使用联网搜索，查找以下信息：
1. 该公司的官方邮箱（info@, sales@, contact@ 等前缀）
2. 该公司的电话号码（尤其是销售/客服电话）
3. 该公司的 WhatsApp 号码（很多国际公司用 WhatsApp 做商务沟通）
4. 该公司的 LinkedIn 主页
5. 该公司的 Facebook / Twitter 等社交媒体

搜索建议关键词：
- "${companyName} contact email phone"
- "${companyName} WhatsApp"
- "site:linkedin.com ${companyName}"
- "${companyName} ${country} contact details"

### 第二步：从官网内容提取信息
以下是 Jina Reader 抓取的官网 Markdown 内容：
${homeMarkdown.slice(0, 5000)}

正则从官网提取到的原始联系方式（需验证准确性）：
- 邮箱: ${regexEmails.join(', ') || '无'}
- 电话: ${regexPhones.join(', ') || '无'}
- LinkedIn: ${regexLinkedIn.join(', ') || '无'}

### 第三步：生成深度背调报告

请严格按照以下 JSON 格式输出：
{
  "contacts": {
    "emails": ["真实有效的邮箱1", "邮箱2"],
    "phones": ["电话号码1（带国际区号）", "电话号码2"],
    "whatsapp": ["WhatsApp号码1（带国际区号，如+44xxx）"],
    "linkedin": "公司LinkedIn完整URL",
    "social_media": ["Facebook/Twitter/Instagram等链接"]
  },
  "company_info": {
    "name": "公司全称",
    "type": "公司类型（Distributor/Wholesaler/System Integrator/Security Firm/Retail Chain等）",
    "background": "公司背景简介（成立时间、规模、员工数、核心业务）",
    "address": "公司地址（如果能找到）"
  },
  "key_executives": [
    {"name": "姓名", "title": "职位（CEO/Sales Director/Procurement Manager等）", "linkedin": "个人LinkedIn链接"}
  ],
  "deep_profile": "详细背调报告，包含：1.公司实力综合评估（规模、营收、市场地位） 2.客户画像精准描绘（客户群、采购习惯） 3.主营业务与产品分析 4.线上线下渠道分析 5.关键人物情报（CEO/销售负责人背景） 6.针对安防产品的销售策略建议"
}

重要规则：
- 只输出纯 JSON，不要包含 \`\`\`json 标记或其他文字
- emails 和 phones 至少各返回1个（如果联网搜索到的话）
- whatsapp 如果搜到就填入，搜不到就留空数组 []
- 电话号码请带国际区号（如 +1, +44, +49 等）
- deep_profile 报告尽量详细，至少300字`;

  const res = await fetch(`${AIHUBMIX_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: RESEARCH_MODEL,
      messages: [
        { role: 'system', content: '你是专业的 B2B 企业调查专家，拥有联网搜索能力。请先联网搜索目标公司的联系方式（邮箱、电话、WhatsApp、LinkedIn），再结合官网内容生成深度背调报告。只返回纯 JSON。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 6000,
    }),
  });

  if (!res.ok) {
    throw new Error('AI 分析请求失败');
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || '';
  
  // 解析 JSON
  let aiResult: any = {};
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      aiResult = JSON.parse(jsonMatch[0]);
    }
  } catch {
    // 解析失败使用空对象
  }
  
  // 转换 contacts 对象为数组格式（适配前端）
  const contactsArray: any[] = [];
  const aiContacts = aiResult.contacts || {};
  
  // 处理邮箱
  const emails = aiContacts.emails || regexEmails || [];
  if (Array.isArray(emails)) {
    emails.slice(0, 5).forEach((email: string) => {
      if (email) contactsArray.push({ type: 'email', value: email, label: 'Email', verified: true });
    });
  }

  // 处理电话
  const phones = aiContacts.phones || regexPhones || [];
  if (Array.isArray(phones)) {
    phones.slice(0, 3).forEach((phone: string) => {
      if (phone) contactsArray.push({ type: 'phone', value: phone, label: 'Phone', verified: true });
    });
  }

  // 处理 WhatsApp
  const whatsapps = aiContacts.whatsapp || [];
  if (Array.isArray(whatsapps)) {
    whatsapps.slice(0, 3).forEach((wa: string) => {
      if (wa) contactsArray.push({ type: 'whatsapp', value: wa, label: 'WhatsApp', verified: true });
    });
  }

  // 处理 LinkedIn
  const linkedin = aiContacts.linkedin || (Array.isArray(regexLinkedIn) ? regexLinkedIn[0] : '') || '';
  if (linkedin) {
    contactsArray.push({ type: 'linkedin', value: linkedin, label: 'LinkedIn', verified: true });
  }

  // 处理社交媒体
  const socialMedia = aiContacts.social_media || [];
  if (Array.isArray(socialMedia)) {
    socialMedia.slice(0, 3).forEach((sm: string) => {
      if (sm) {
        const isFb = sm.includes('facebook');
        const isTw = sm.includes('twitter') || sm.includes('x.com');
        const isIg = sm.includes('instagram');
        contactsArray.push({
          type: isFb ? 'facebook' : isTw ? 'twitter' : isIg ? 'instagram' : 'social',
          value: sm,
          label: isFb ? 'Facebook' : isTw ? 'Twitter' : isIg ? 'Instagram' : 'Social',
          verified: true,
        });
      }
    });
  }
  
  return {
    contacts: contactsArray,
    company_info: aiResult.company_info || { name: companyName, type: 'Unknown', background: backgroundInfo || '' },
    key_executives: aiResult.key_executives || [],
    deep_profile: aiResult.deep_profile || 'AI 分析失败，请重试',
  };
}
