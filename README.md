# Pluie — AI 外贸客户开发副驾驶

> B2B 业务员的桌面工作台：搜客户 → 深度背调 → 写破冰文案 → 销售助手 → 物料库。
>
> 本仓库从 [qzt-frontend](../qzt-frontend) fork 出来做 SaaS 化改造。原 QZT 项目不动，自家业务员继续使用。

## 跟原项目的差异

这个 fork 把 QZT 业务身份从代码里抽出来，做成可配置：

- [src/config/brand.ts](src/config/brand.ts) — UI 品牌（名字 / Logo / Footer / metadata）
- [src/config/company.ts](src/config/company.ts) — 业务身份（产品 / 9 个 proof points / KB / Map 关键词 / 产品线映射）

默认值 = QZT 原配置，所以 `npm run build` 当前的行为和原项目一致。要给其他公司用，改 `company.ts` 里 `COMPANY = QZT_PROFILE` 这一行换成新 profile。

## 已剥离的 QZT 烙印

| 位置 | 改造方式 |
|---|---|
| `app/layout.tsx` metadata + footer | 读 BRAND |
| `components/Header.tsx` logo + 名字 + AI 小助手 | 读 BRAND（assistantUrl 空时按钮隐藏）|
| 5 个组件（AICopywriting / SalesAssistant / LeadSearch / AccountMenu / ContactEnrichment）| "QZT 知识库" → "公司知识库" 等 |
| `api/generate-copy/route.ts` 销售 prompt | 读 COMPANY.productContextEn / proofPointMenuEn / clientAnalysisStepsEn |
| `api/research/stream/route.ts` 背调 prompt | 读 COMPANY.kb.label，去 Naples / 9 大卖点硬编码 |
| `api/leads/search/route.ts` 搜索 prompt + Map 评分 + 产品线映射 | 读 COMPANY 各字段 |
| `api/deep-profile/route.ts` 背调 system prompt | 读 COMPANY.brandName + industryEn |
| KB URL / API Key | 读 COMPANY.kb.* |
| 抓取 User-Agent | 读 BRAND.botUserAgent |

## 已强化的背调

在原项目"3 道防线"（官网真实性预检 + 邮箱 MX 检查 + 域名匹配）基础上多加一条：

**第三方源置信度**（`api/research/stream` Step 4 之后）

- 跑完 `searchDomainMentions(company_name, primaryDomain)` 后判断结果：
  - 任务 fulfilled 且返回 ≥1 条 → `third_party_confidence: 'high'`
  - 任务 fulfilled 但 0 条 → `third_party_confidence: 'low'` + 自动升级 `website_reality.suspicious=true`
  - 任务 rejected → 留 `'unknown'`，不下结论
- 输出对象新增 `third_party_confidence` / `third_party_mentions_count` 字段，前端可以打"低存在性置信"标
- 触发条件设计：只在 markdown 抓取正常 + 之前没被标 suspicious 时才追加，避免双重否定让用户困惑

## 配置 / 运行

```bash
npm install
cp .env.example .env.local
# 至少要填 AIHUBMIX_API_KEY + Supabase 三件套
npm run dev
```

完整环境变量清单 + 外部服务开通顺序见 [PROJECT_GUIDE.md](PROJECT_GUIDE.md)（继承自原项目，部分章节随业务身份配置化已过时）。

## 仍未做的事（Phase 3 模板化）

今天只做了"集中化"，让 1 个文件改 = 切换公司身份。完整的多租户模板化还差：

1. UI：用户上传公司资料的表单（公司介绍 / 产品库 / 知识库 KB URL）
2. 后端：把 `COMPANY` 改成从 Supabase `company_profiles` 表按 user_id 读取
3. RAG：让用户自己接 Google Sheet / 自家 KB，不依赖 QZT 那套 Apps Script
4. `lib/qztKb.ts` 里硬编码的 QZT 业务数据（PayPal 邮箱 / IBAN / Naples 地址 / 型号）也要外迁
5. 付费墙 + 订阅状态管理（参考前面对话讨论的 Paddle / Lemon Squeezy / 微信支付国内合规方案）
