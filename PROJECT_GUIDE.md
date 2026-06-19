# QZT 欧洲获客系统 · 项目移交与复刻指南

> 本文档面向两类读者：
> 1. **接手开发者**：需要理解架构、改 bug、加功能
> 2. **复刻者**：想把这套系统改造给**另一家公司**（不同行业、不同产品）使用
>
> 末尾的「为新公司适配」清单列了所有要改的地方。

---

## 1. 项目是干什么的

**一句话**：B2B 业务员的桌面工作台，从「找客户 → 背调 → 写破冰 → 跟单 → 调素材」全流程都在浏览器里完成。

**当前用户**：清风电子（QZT），深圳安防摄像头/隐藏式相机外贸出口商，欧美市场。

**核心场景**：
- 业务员每天上班打开网站，搜 1-3 轮潜在客户
- 对感兴趣的客户做深度背调（拿邮箱、电话、WhatsApp、公司画像、销售切入策略）
- AI 生成破冰文案（Email 或 WhatsApp）
- 跟单中遇到具体场景（客户砍价、已读不回、要 free sample）→ 销售助手给话术
- 写消息时想发产品图/规格书 → 物料库一键复制链接到 WhatsApp

**5 个核心模块**（Header tab 顺序）：

| Tab | 模块 | 主要文件 |
|---|---|---|
| 1 | **客户搜索** | `LeadSearch.tsx` + `/api/leads/search` |
| 2 | **深度调查** | `ContactEnrichment.tsx` + `/api/research/stream` |
| 3 | **破冰文案** | `AICopywriting.tsx` + `/api/generate-copy` |
| 4 | **销售助手** | `SalesAssistant.tsx` + `/api/generate-copy` |
| 5 | **物料库** | `MaterialsLibrary.tsx` + `/api/materials` |

---

## 2. 技术栈

| 角色 | 选型 | 备注 |
|---|---|---|
| 框架 | Next.js 14 (App Router) | TS + React 18 |
| 部署 | Vercel（**必须开 Fluid Compute**） | `vercel.json` 里 `"fluid": true` |
| 样式 | Tailwind CSS | 自定义主题色（brand/cream/charcoal） |
| 图标 | `lucide-react` | |
| 状态 | React Context | `AppContext` 业务态 + `AuthContext` 登录态 |
| Toast | `sonner` | |
| 账号 / 云同步 | **Supabase**（auth + Postgres） | 跨设备同步搜索结果、屏蔽名单、文案草稿 |
| 大文件存储 | **Cloudflare R2** + S3 兼容 API | 物料库用，10 GB 免费 + 0 流量费 |
| LLM 网关 | **AIHubMix**（OpenAI 兼容） | 后端代理，不暴露 key 到前端 |
| 主要 LLM | `gemini-3-flash-preview-search`（联网搜索） | 搜索 + 背调 |
| 文案 LLM | `deepseek-v4-flash` | 破冰文案 + 销售助手 |
| 网页抓取 | **Jina Reader** (`r.jina.ai`) | 把任意 URL 转 Markdown 给 LLM 看 |
| 地图获客 | **Google Places API**（新版） | `places.googleapis.com/v1/places:searchText` |
| 知识库 RAG（可选） | Google Apps Script + Sheet + `qzt-bot.workers.dev` | 文案生成时拉公司 SOP 知识 |
| S3 签名 | `aws4fetch` | R2 presigned PUT URL（5KB 轻量，无 AWS SDK） |

**所有 LLM 都通过 AIHubMix 走，没有直连 OpenAI / Google / DeepSeek**。

---

## 3. 目录结构

```
qzt-frontend/
├── PROJECT_GUIDE.md              # 本文档
├── package.json
├── vercel.json                   # { "fluid": true } - 必须保留
├── tailwind.config.js
├── tsconfig.json
├── next.config.js
├── .env.example                  # 环境变量样板
├── public/
│   └── Logo120-120.jpg
├── supabase/
│   ├── schema.sql                # Supabase 一次性建表脚本
│   └── materials-setup.md        # 物料库（R2）开通步骤
├── backups/                      # 我每次改大块前备份的旧版本（可删）
└── src/
    ├── app/
    │   ├── layout.tsx            # 根布局（toast / 字体）
    │   ├── page.tsx              # 主页：5 个 tab，全部 dynamic import
    │   └── api/
    │       ├── account/
    │       │   ├── auth/route.ts         # 登录 / 注册（Supabase Auth 代理）
    │       │   └── cloud/route.ts        # 云同步搜索结果 / 屏蔽名单 / 文案草稿
    │       ├── leads/
    │       │   └── search/route.ts       # AI 网搜 + Google Places 地图获客（1125 行）
    │       ├── research/
    │       │   ├── route.ts              # （旧版，单次返回）
    │       │   └── stream/route.ts       # 深度背调主入口，SSE 流式（901 行）
    │       ├── generate-copy/route.ts    # 破冰文案 + 销售助手 5 模式（517 行）
    │       ├── materials/route.ts        # R2 物料库 CRUD（226 行）
    │       ├── deep-profile/route.ts     # （早期版本，仍可用）
    │       ├── scrape/
    │       │   ├── route.ts              # Jina 抓取代理
    │       │   └── batch/route.ts        # 批量 Jina
    │       └── test-api-key/route.ts     # AIHubMix key 自检
    ├── components/
    │   ├── Header.tsx                    # 顶部 5-tab + 账号 + 配置 + AI 助手链接
    │   ├── LeadSearch.tsx                # 客户搜索 UI（1689 行，最大文件）
    │   ├── ContactEnrichment.tsx         # 深度调查 UI（1299 行）
    │   ├── AICopywriting.tsx             # 破冰文案 UI
    │   ├── SalesAssistant.tsx            # 销售助手（聊天/逼单/复盘/维护 4 模式）
    │   ├── MaterialsLibrary.tsx          # 物料库 UI（含上传 + 预览 modal）
    │   ├── AccountMenu.tsx               # 右上角账号下拉
    │   └── ApiKeyConfig.tsx              # AIHubMix key 本地配置
    ├── context/
    │   ├── AppContext.tsx                # 业务状态（搜索结果、enriched leads、copyCustomer）
    │   └── AuthContext.tsx               # Supabase 登录态
    ├── lib/
    │   ├── supabase.ts                   # 浏览器端 Supabase client
    │   ├── cloudData.ts                  # 云同步 helper（包装 /api/account/cloud）
    │   └── r2.ts                         # R2 presigned URL + manifest.json
    └── types/
        └── api.ts                        # 共享类型（CopywritingPayload 等）
```

**代码量**：源码 ~10,500 行，TS 编译过，零 lint 报错。

---

## 4. 数据流（架构图，文字版）

```
┌────────────────────────────────────────────────────────────────────┐
│                        浏览器 (Next.js Pages)                       │
│                                                                    │
│   LeadSearch  ContactEnrichment  AICopywriting  SalesAssistant     │
│        │             │                │              │             │
│        └─────────────┴────────────────┴──────────────┘             │
│                          AppContext                                │
│                         (React 状态)                               │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ HTTPS
                               ▼
┌────────────────────────────────────────────────────────────────────┐
│              Vercel Serverless（Node Runtime + Fluid）             │
│                                                                    │
│  /api/leads/search   /api/research/stream   /api/generate-copy     │
│  /api/materials      /api/account/cloud     /api/account/auth      │
└──────┬─────────────────┬─────────────────────┬────────┬────────────┘
       │                 │                     │        │
       ▼                 ▼                     ▼        ▼
   AIHubMix       Jina + AIHubMix           Supabase  Cloudflare R2
   (Gemini-       (网页抓 + Gemini-          (Auth +   (物料库
   Search)         Search 联网搜)            Postgres) 文件存储)
       │                 │
       └─────────────────┘
       ▲
       │（地图获客这一路单走）
   Google Places API
```

**关键耗时点**：
- AI 网页搜索：30-50 秒（联网搜索慢）
- 深度背调流式：30-90 秒（Jina 抓多页 + AI 联网搜 + 邮箱反查 + 公司域名第三方提及）
- 文案生成：5-15 秒
- 地图获客：几秒（纯 Google Places）

**为什么必须 Node Runtime + Fluid**：
- Edge Runtime 最长 30 秒 → 深度背调跑不完会 504
- Fluid Compute 单函数最长 300 秒
- 详见「硬约束」一节

---

## 5. 环境变量清单

### 必填（Vercel Production / Preview / Development 三个环境都要设）

| Key | 必填 | 来源 | 备注 |
|---|---|---|---|
| `AIHUBMIX_API_KEY` | ✅ | https://aihubmix.com | 所有 LLM 调用走它 |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase 项目 settings → API | **不能带 `/rest/v1/`** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | 同上，`anon` `public` 那一行 | 前端能看到 |
| `SUPABASE_SERVICE_ROLE_KEY` | ⚠️ | 同上，`service_role` `secret` 那一行 | 仅服务端用，不要泄露 |
| `GOOGLE_MAPS_API_KEY` | ⚠️ | https://console.cloud.google.com | 开 Places API；不配则「地图获客」tab 不可用 |

### 物料库（用 R2）相关 - 6 个

| Key | 必填 | 来源 |
|---|---|---|
| `R2_ACCOUNT_ID` | ✅ | Cloudflare 账号 ID |
| `R2_ACCESS_KEY_ID` | ✅ | R2 API Token 创建后给的 |
| `R2_SECRET_ACCESS_KEY` | ✅ | 同上，**只在创建时显示一次** |
| `R2_BUCKET_NAME` | ✅ | 自己起名（如 `qzt-materials`） |
| `R2_PUBLIC_URL` | ✅ | R2 开 r2.dev 后给的 `https://pub-xxx.r2.dev`（**不带 /**） |
| `MATERIALS_UPLOAD_KEY` | ✅ | 自定义口令，业务员上传时输 |

详细 R2 开通步骤见 [`supabase/materials-setup.md`](./supabase/materials-setup.md)。

### 可选

| Key | 默认 | 备注 |
|---|---|---|
| `QZT_KB_API_URL` | 内置 Apps Script URL | 公司知识库（Google Sheet）的查询接口 |
| `QZT_KB_API_KEY` | `QZT-Link-Token-QZT123456` | 上一项的访问令牌 |
| `QZT_BOT_ASK_URL` | `https://qzt-bot.qzt-sop.workers.dev/ask` | 公司钉钉 RAG bot（销售助手会调用） |

不配的话，文案生成会跳过知识库 RAG 那步，质量会差一些但不会报错。

---

## 6. 外部服务开通顺序

按这个顺序开，每一步开完都能验证。

### Step 1: Supabase（账号 + 数据库）

1. https://supabase.com 注册 → New Project
2. 等几分钟项目就绪
3. 项目 **Settings → API** 里抄 3 个东西：
   - Project URL（`https://xxx.supabase.co`）→ `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` `secret` key → `SUPABASE_SERVICE_ROLE_KEY`
4. 项目 **SQL Editor → New query** → 粘贴 `supabase/schema.sql` 整段 → Run
5. 验证：**Authentication → Providers** 里启用 Email（默认就是）

会建好这些表：`profiles` / `user_app_state` / `lead_blocklist` / `copy_drafts` / `chat_imports` / `materials`（R2 模式下其实不用，但 schema 里有定义）+ 对应索引和 RLS。

### Step 2: AIHubMix（LLM 网关）

1. https://aihubmix.com 注册
2. **API 密钥**页生成一个 key
3. 测试一下：

```bash
curl -X POST https://api.aihubmix.com/v1/chat/completions \
  -H "Authorization: Bearer <你的key>" \
  -H "Content-Type: application/json" \
  -d '{"model":"deepseek-v4-flash","messages":[{"role":"user","content":"hi"}]}'
```

### Step 3: Google Places（地图获客）

1. https://console.cloud.google.com → 新建项目
2. **API 和服务 → 启用 API → 搜索 Places API (New)** → 启用
3. **凭据 → 创建凭据 → API 密钥**
4. 限制：仅限 Places API；如果安全顾虑，可加 IP 限制（Vercel 是动态的，不好限）
5. **结算**：必须绑信用卡（Google 给 $200/月免费额度，地图获客每次约 ¥0.1，正常用不超额）

### Step 4: Cloudflare R2（物料库）

完整步骤见 [`supabase/materials-setup.md`](./supabase/materials-setup.md)：

1. 建 R2 桶
2. 开 r2.dev 公开访问
3. **配 CORS**（关键！否则浏览器直传会被拦）
4. 建 API Token（Object Read & Write）
5. 6 个 env vars 填 Vercel

### Step 5: Vercel 部署

1. https://vercel.com → New Project → 关联 GitHub repo
2. **Framework Preset**：Next.js（应该自动识别）
3. **Environment Variables**：把上面所有 key 填进去，**3 个环境（Production / Preview / Development）全勾**
4. Deploy
5. **关键**：项目 Settings 里确认 `vercel.json` 的 `"fluid": true` 生效——不开 Fluid 深度调查会 504

---

## 7. API 路由清单

| 路径 | 方法 | 用途 | Runtime | 关键依赖 |
|---|---|---|---|---|
| `/api/account/auth` | POST | 邮箱密码登录 / 注册 | Node | Supabase Auth |
| `/api/account/cloud` | POST | 云同步搜索结果、屏蔽名单、文案草稿 | Node | Supabase Postgres |
| `/api/leads/search` | POST | AI 网页搜索 + Google Places 地图获客 | Node | AIHubMix, Google Places, Jina（可选） |
| `/api/research/stream` | POST | **深度背调（SSE 流式）** | Node + maxDuration=300 | Jina, AIHubMix |
| `/api/research` | POST | 旧版深度调查（非流式） | Node | Jina, AIHubMix |
| `/api/deep-profile` | POST | 极简背调（早期版本） | Node | AIHubMix |
| `/api/generate-copy` | POST | 破冰文案 / 销售助手（5 mode） | Node | AIHubMix, Apps Script KB |
| `/api/materials` | GET/POST/DELETE | 物料库 CRUD（R2） | Node | aws4fetch + R2 |
| `/api/scrape` | POST | Jina 抓单页代理 | Node | Jina |
| `/api/scrape/batch` | POST | Jina 批量抓 | Node | Jina |
| `/api/test-api-key` | POST | 自检 AIHubMix key 有效性 | Node | AIHubMix |

**所有路由都是 `export const runtime = 'nodejs';`**——不准用 Edge。

---

## 8. 数据库 schema 概览

`supabase/schema.sql` 建的 6 张业务表（外加 `auth.users` 由 Supabase 自带）：

| 表 | 字段要点 | 用途 |
|---|---|---|
| `profiles` | `id` (FK auth.users), `email`, `display_name` | 业务员账号资料 |
| `user_app_state` | `user_id` PK, `search_results` jsonb, `enriched_leads` jsonb, `copy_customer` jsonb | 整体状态云端镜像 |
| `lead_blocklist` | `user_id`, `company_name`, `normalized_name`, `scope` (web/map/all) | 屏蔽名单 |
| `copy_drafts` | `user_id`, `mode`, `channel`, `customer_company`, `versions` jsonb | 文案历史 |
| `chat_imports` | `user_id`, `source`, `chat_text` | 聊天记录（WhatsApp 扩展导入） |
| `materials` | （R2 模式下不再用） | 物料元数据（旧 Supabase 方案的遗留，可保留） |

**RLS 策略**：每张表都开了 `auth.uid() = user_id` 校验，业务员看不到别人的数据。

**物料库当前用 R2 manifest.json**，不用上面这张 `materials` 表。

---

## 9. 状态管理

### `AppContext.tsx`

```ts
{
  searchResults: SearchResult[]      // 客户搜索结果（分 web / map 两类 source）
  enrichedLeads: EnrichedLead[]      // 转移到深度调查的客户
  copyCustomer: { ... } | null        // 当前在写文案的客户
  searchLoading: boolean
  ...各种 setter, transferToContact, transferToCopy
}
```

- 自动持久化到 `localStorage`
- 登录后**节流 600ms 自动同步到 Supabase**（`/api/account/cloud`）
- 换浏览器登录会从云端拉

### `AuthContext.tsx`

包装 Supabase Auth：
```ts
{ user, accessToken, configured, signIn, signUp, signOut }
```

---

## 10. 核心业务逻辑要点

### 10.1 客户搜索（AI 网搜 + 地图获客）

**AI 网搜**：调 AIHubMix 的 `gemini-3-flash-preview-search`，prompt 强约束（绝对真实、严禁幻觉、客户类型、目标国家、Google Dorks 多策略）。每次固定返 5 个，按 1 分钟内可完成设计。

**地图获客**：
1. `buildMapSearchQueries` 按 keyword + customer_type + region + country 生成 10 个查询
2. 串行打 Google Places `searchText`，去重
3. **`scoreMapPlace` 二次过滤**：drop 画廊/餐厅/学校/书店等明显不相关；boost 安防/电子/锁匠等相关业态
4. 按相关度排序取前 5

**WhatsApp 判定**：只在 `whatsapp_priority` 开关开 + `isLikelyWhatsAppPhone()` 判定为移动号段时才标 "WhatsApp 候选"。**不准把座机当 WhatsApp**。

### 10.2 深度调查（关键文件 `src/app/api/research/stream/route.ts`）

5 阶段流式 SSE：

```
started → fetching_website → ai_analyzing → verifying → expanding → object → [DONE]
```

1. **多页抓取**：`multiPageFetch` 并发拉 `home + /contact + /about`
2. **正则预提取**：邮箱、电话、LinkedIn URL、**wa.me/api.whatsapp.com 链接**（这些是「100% 真 WhatsApp」）
3. **AI 联网搜索 + 整合**：勒令 AI 不许按域名瞎编邮箱，每条联系方式要带 `source` 字段
4. **服务端交叉验证 `verifyContacts`**：
   - 邮箱：在抓到的 markdown 里逐字找到 = ✓；通用前缀（info/sales/contact 等）找不到 = **直接 drop**（最高置信度幻觉模式）
   - 电话：digits 在 markdown 里出现过 = ✓
   - WhatsApp：来自 wa.me 链接 = ✓；官网提了"whatsapp" 字样 = ⚠ 未验证；都没有 = drop
   - 社交 URL：HEAD 检查 + markdown 命中 = ✓；HEAD 404 = drop
5. **爬虫扩展**：
   - `searchEmailFootprint`：用已验证邮箱反查"在其他哪些站点出现过"（找姐妹品牌 / 经销网）
   - `searchDomainMentions`：搜公司名在第三方站点（Europages、IFSEC、LinkedIn 等）的提及

**⚠️ 已知问题**（业务员反馈）：

> 14 个客户里 4 个完全假信息、3 个邮箱无效但谷歌能查到公司、1 个邮箱无效公司也查不到——但全部显示 "✓ 已验证"。

**根因**：`verified=true` 只意味着「邮箱字符串在 Jina 抓的 markdown 里出现过」，但：
1. 如果 AI 凭空捏造了一个不存在的公司，连官网都是假的，Jina 抓到的内容也是 AI 生成的虚假信息
2. 没验证邮箱域名 = 公司官网域名（AI 可能写了不相关的邮箱）
3. 没验证邮箱 MX 记录（域名是否真实收信）

**改进方向**（待做）：
- 背调最前面先 HEAD 一下官网，确认 200，且 markdown 里有公司名出现，否则整条标"⚠ 公司真实性存疑"
- 邮箱：域名必须 = 公司官网主域（或子域），不匹配的降级
- 邮箱：调 DoH 查 MX 记录，无 MX 标红
- AI 搜索那一步本身就要更严，强制每个公司必须有"可被第三方源证实存在"的依据

### 10.3 破冰文案（关键文件 `src/app/api/generate-copy/route.ts`）

5 个 mode：`outreach` / `chat_reply` / `closing` / `mentor` / `maintenance`

**outreach（破冰）特殊设计**：
- Step 1 强制内部分析客户背景（国家/渠道/产品/痛点/决策人画像）
- Step 2 从 9 个 proof-point 角度（A-I）里挑 3 个不重复的，**至少 1 个用纯产品适配（不提物流）**
- 硬规则：3 个版本不能用同一字母；location（A/B）最多用一个
- ⛔ 公司地理是 **Naples 仓库 + Naples 展厅**，Milan 只是次要接待点。这点已在 prompt 里强写多次防 AI 抽风

**RAG（可选）**：
- 调 `qzt-bot.workers.dev/ask` 拿钉钉 bot 的 RAG 答案
- 调 Apps Script 拉 Google Sheet 知识库片段
- 两个并行，失败也不阻断

**重试**：AIHubMix 5xx / 429 自动重试 3 次（指数退避 500/1000/1500ms）。这是为了解决业务员反馈"偶尔报服务器错误，刷新就好"。

### 10.4 物料库（R2 + manifest.json）

不用数据库，全靠 R2 桶里的 `manifest.json` 当索引文件。

**上传流程**：
1. 浏览器 POST `/api/materials { action: 'presign', filename, content_type }`
2. 服务端用 aws4fetch 签一个 PUT URL 返回
3. 浏览器**直传 R2**（XHR PUT，绕过 Vercel 4.5MB 限制）
4. 上传完 POST `/api/materials { action: 'register', ...meta }`
5. 服务端读 manifest → 追加 → 写回 R2

**鉴权**：`X-Team-Key` header 等于 `MATERIALS_UPLOAD_KEY` 才允许写。读完全公开。

**单文件 ≤ 500 MB**，可装证书 / 高清图 / 短视频。

---

## 11. 部署的硬约束（千万别动）

来自 `feedback_qzt_eu_lead_constraints.md` 累计踩过的坑：

1. ⛔ **不准删 `vercel.json`** —— `{ "fluid": true }` 撑深度调查
2. ⛔ **不准用 Edge Runtime** —— 所有 API 路由必须 `export const runtime = 'nodejs';`，否则深度调查 / Jina / AI 联网搜索会 504
3. ⛔ **AI 调用必须经 Next.js API Route 代理** —— 前端不能直连 AIHubMix（key 安全 + 超时控制）
4. ⛔ **Google Places 电话 ≠ WhatsApp** —— 不准 `lead.whatsapp || lead.phone` 兜底
5. ⛔ `wa.me/{number}` 的 number 只保留数字（用 `\D` 替换），**不要保留 `+`**
6. ⛔ 地图来源的 WhatsApp 最多标"候选"，不能直接显示"WhatsApp"
7. ⛔ **不准默认开启所有深度抓取**（`deep_enrich: true`）→ 会拖到超时；做成可选开关，默认关
8. ⛔ AI 网页搜索"搜索后验证"那一步用 Jina 并发 + 单站 8s + 整体 25s 超时兜底
9. ⛔ 固定每次搜索 5 个客户（不能 10、不能 20）—— Vercel 60s 限制下的折中
10. ⛔ `NEXT_PUBLIC_SUPABASE_URL` 必须 `https://项目ID.supabase.co`，**不能带 `/rest/v1/`**
11. ⛔ Naples = 仓库 + 展厅；Milan **只是接待点**，禁止说 "warehouse in Milan" / "showroom in Milan"

---

## 12. 本地开发

```bash
# 1. 克隆
git clone <repo> qzt-frontend
cd qzt-frontend

# 2. 装依赖
npm install

# 3. 配 env
cp .env.example .env.local
# 编辑 .env.local 填上所有必填的 key

# 4. 跑起来
npm run dev
# 打开 http://localhost:3000
```

**注意**：本地开发也需要 Supabase + AIHubMix 才能完整跑。Google Places、R2 没配的话对应 tab 会显示"未配置"友好提示。

**lint + 类型检查**：
```bash
npm run build  # 完整构建，跑 tsc
```

---

## 13. 为「另一家公司」适配的清单

如果你要把这套系统改造给非安防行业的公司（比如卖五金、灯具、玩具、化妆品 OEM 等）使用：

### 13.1 公司业务身份（4 处必改）

| 位置 | 原值 | 改什么 |
|---|---|---|
| `src/app/api/leads/search/route.ts` 里 `buildSystemPrompt` | "QZT" / "隐藏摄像头/录音设备/取证设备/GPS追踪器/信号屏蔽器/间谍设备配件" | 你公司名 + 你的产品线（中英文都要） |
| 同上 `buildMapSearchQueries` 里的 `typeQueries` | "spy shop" / "nanny camera store" / "voice recorder shop" 等 | 改成你行业的本地业态关键词 |
| 同上 `scoreMapPlace` 的黑/白名单 | 安防类业态加分、画廊餐厅减分 | 重新定义"哪些 Google Places 类型对你而言相关" |
| `src/app/api/generate-copy/route.ts` 里 `COMPANY_CONTEXT` | 产品矩阵 / 欧洲仓 Naples / CE+RoHS / 客户群体 | **重写一遍**，包括地理、认证、客户类型 |
| 同上 outreach prompt 的 proof-point 菜单（A-I） | 仓库 / 展厅 / 售后 / 认证 / OEM 等 9 个角度 | 重新设计你公司能给客户的 9 个卖点 |

### 13.2 UI 文案（4 处可选改）

| 位置 | 改什么 |
|---|---|
| `src/components/Header.tsx` | logo 图片 + "QZT" 文字 + "European Market Intelligence" 副标题 |
| `src/components/LeadSearch.tsx` | `DEFAULT_KEYWORDS`（候选产品词）、`DEFAULT_COUNTRIES`（默认国家） |
| `src/components/MaterialsLibrary.tsx` | 物料 8 个分类是否合适（产品实拍图/规格书/展会图/客户合影/工厂图/认证证书/包装物流/其他） |
| `src/app/page.tsx` 里 metadata | 浏览器标题 / 描述 |
| `public/Logo120-120.jpg` | 换 logo |

### 13.3 RAG 知识库（如果对方公司也有 SOP 想接）

新公司想接自己的知识库（钉钉 RAG / 公司 Wiki / 飞书文档）有两种选：

**A. 简单方案**：把对方现有的内容塞到一个 Google Sheet 里（每行一条 SOP / 案例），仿照 `qzt-bot` 项目部署一个 Cloudflare Worker，提供 `/ask?question=...` API，配置 env var：
```
QZT_KB_API_URL=<新公司的 Apps Script URL>
QZT_KB_API_KEY=<访问 token>
QZT_BOT_ASK_URL=<新公司的 Worker URL>
```

**B. 不接知识库**：留空上面 3 个 env，文案生成会自动跳过 RAG，纯靠 prompt + 客户背景生成，质量会稍弱但完全能用。

### 13.4 不用改的地方

- 整个数据库 schema（适用于任何 B2B 行业）
- 整个登录 / 云同步系统
- 物料库（R2 那一套）
- 客户分级 A/B/C 算法（`computeLeadScore`）—— 维度通用
- 邮箱反查 / 公司域名第三方提及（爬虫扩展）—— 通用
- 部署、CORS、env 管理流程

### 13.5 复刻一份的快速操作

```bash
# 假设原项目仓库叫 qzt-frontend，要复刻给 acme 用
gh repo create acme-lead-system --private
git clone <你的 qzt-frontend>
cd qzt-frontend
git remote set-url origin <acme repo>
git push -u origin main

# 改公司身份（13.1 那 5 处）
# 重新部署到 Vercel（新建项目即可）
```

---

## 14. 已知问题 / 待改进

按业务影响排序：

| 严重度 | 问题 | 改进方向 |
|---|---|---|
| 🔴 高 | **深度背调的"已验证"标签可靠性差**（14 客户里 4 假 + 3 邮箱无效，但全标 ✓） | 加官网真实性预检 / 邮箱域名匹配校验 / DoH MX 检查 |
| 🔴 高 | AI 网搜偶尔捏造"看似真实但不存在"的公司 | 收紧 prompt + 加事后存在性核验（搜公司名 + 域名第三方提及） |
| 🟡 中 | Vercel 60s / Fluid 300s 限制下，深度调查 + 关联站点搜索可能超时 | 拆成两个独立请求；关联站点改后台 cron 跑 |
| 🟡 中 | 物料库缩略图懒加载 + R2 没有自动压缩 | 接 Cloudflare Images 转 300px 缩略 |
| 🟡 中 | 钉钉 RAG (`qzt-bot.workers.dev`) 依赖硅基流动 BGE-M3，偶尔 500 抖动 | 已加重试 + 网页可换 key（但需要去那个 repo 部署） |
| 🟢 低 | 物料库 manifest.json 并发写存在覆盖风险 | 上 R2 conditional PUT 或加锁 |
| 🟢 低 | 销售助手"复盘"模式生成的 SOP 没自动回流到 RAG | 接钉钉 bot 项目的 Vectorize 索引 |

---

## 15. 成本估算（以 QZT 当前用量为参考）

| 项 | 月成本 | 备注 |
|---|---|---|
| Vercel Pro | $20 | Fluid + 多并发，10 人团队够用 |
| Supabase Free | $0 | 500 MB 数据库 + 1 GB 流量足够 |
| Cloudflare R2 | $0 | 10 GB 物料够开始用，超出 $0.015/GB/月 |
| AIHubMix | ~$30-80 | 跟用量走，深度调查 ~¥0.5/次，搜索 ~¥0.2/次 |
| Google Places | $0-50 | $200/月免费额度，正常用不超 |
| **合计** | **~¥250-1000/月** | 取决于业务员人数和调用频率 |

---

## 16. 联系信息（团队内部）

- 当前部署：`https://pluie-leads.vercel.app`
- GitHub: `https://github.com/jolm1314zy1997-debug/qzt-eu-lead-system`
- Supabase 项目 ID: `enzemnivztupnncijjcu`
- 用户 QZT Bot（RAG）: `https://qzt-bot.qzt-sop.workers.dev`（独立 CF Worker 项目，源码在 `/Users/wei/projects/qzt-bot/`）

---

**最后**：本文档持续更新。每改重大架构就同步一下。
