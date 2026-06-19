# 物料库（Materials Library）开通说明

业务员开发客户时随时打开「物料库」tab 调取产品实拍图、规格书、展会图、客户合影、工厂图、认证证书、视频等。**点一下复制公开链接就能直接粘到 WhatsApp / 邮件**，或者一键下载。

存储后端用 **Cloudflare R2**：
- **10 GB 免费**（Supabase 是 1 GB）
- **客户下载完全 0 流量费**（Supabase 超出 2 GB/月就开始烧钱）
- 业务员上传只要输一次"团队口令"，**不需要注册账号 / 不需要登录**
- 单文件 ≤ 500MB，证书 / 高清图 / 短视频都能装

---

## 一次性开通步骤（10 分钟）

### 1. 在 Cloudflare 建 R2 桶

打开 https://dash.cloudflare.com → 左侧 **R2** → **Create bucket**

- Bucket name: `qzt-materials`（或你喜欢的名字，**全小写**）
- Location: **Automatic**（让 CF 自动选）
- 点 **Create bucket**

### 2. 开公开访问

进入刚建的桶 → 顶部 **Settings**

- 找到 **Public access** 区域
- 点 **Allow Access** 开 r2.dev subdomain
- 会弹一个二次确认，确认后会给你一个像 `https://pub-xxxxxxxxxxxxxxxxxxxxx.r2.dev` 的地址
- **复制这个地址**——后面要填到 Vercel

> 也可以绑自定义域（如 `materials.qztsecurity.com`），更专业；但 r2.dev 子域已经够用。

### 3. 配 CORS（让网页能上传）

仍在 **Settings** 页，找到 **CORS Policy**，点 **Add CORS policy**，贴下面这段（注意把 `<你的 Vercel 域名>` 换成实际的）：

```json
[
  {
    "AllowedOrigins": [
      "https://pluie-leads.vercel.app",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

保存。**不配 CORS 浏览器直传会被卡**。

### 4. 拿 R2 API Token

回到 R2 主页 → 右上角 **Manage R2 API Tokens** → **Create API token**

- Token name: `qzt-materials-rw`
- Permissions: **Object Read & Write**
- Specify bucket: `qzt-materials`（不选就是全部桶，建议指定）
- TTL: **Forever**
- 点 **Create API Token**

会显示一次：
- **Access Key ID**（约 32 位）
- **Secret Access Key**（约 64 位）

**复制下来，关掉页面就再也看不到了**。也顺便复制账号 ID（在 token 页面或主页右下角）。

### 5. 在 Vercel 加 6 个环境变量

打开 Vercel → 项目 → **Settings** → **Environment Variables**，加：

| Key | Value |
|---|---|
| `R2_ACCOUNT_ID` | 上一步的 Account ID |
| `R2_ACCESS_KEY_ID` | 上一步的 Access Key ID |
| `R2_SECRET_ACCESS_KEY` | 上一步的 Secret Access Key |
| `R2_BUCKET_NAME` | `qzt-materials`（你建的桶名） |
| `R2_PUBLIC_URL` | `https://pub-xxxxx.r2.dev`（第 2 步复制的，**不要加 /**） |
| `MATERIALS_UPLOAD_KEY` | 自己想一个口令，例如 `qzt-sales-2026`，业务员都用这个 |

**Production + Preview + Development 全选**，三个环境一起开。

### 6. Redeploy

Vercel → **Deployments** → 最新一条右边 `...` → **Redeploy**（不勾"使用现有构建缓存"）。

等 1 分钟，打开线上「物料库」tab。

---

## 业务员怎么用

### 第一次上传

1. 点「物料库」tab → 右上角「上传素材」
2. 弹窗里：
   - **团队口令**：填销售管理员告诉的口令（就是 `MATERIALS_UPLOAD_KEY`）
   - **你的名字**：填自己名字方便溯源（如 `Pluie`）
   - 这两个会记在浏览器里，**下次不用再填**
3. 拖文件进去（或点击选）
4. 填标题、选分类、填产品型号、加标签
5. 点「确认上传」

文件直接从浏览器上传到 Cloudflare R2，**完全不走 Vercel 服务器**，所以速度只看你和 CF 的网络，不会被 Vercel 4.5MB 限制卡。

### 找素材

- 顶部搜索框：搜标题 / 描述 / 产品名 / tag
- 旁边产品筛选：只看某型号（如 `S820`）
- 11 个分类按钮：全部 / 产品实拍图 / 产品规格书 / 展会图片 / 展厅图片 / 客户合影 / 工厂图片 / 视频 / 认证证书 / 包装物流 / 其他

### 发给客户

每张卡片底部：

- **下载** → 浏览器直接下载文件
- **复制链接** → 公开 URL 复制到剪贴板，粘到 WhatsApp / 邮件即可，**客户点击直接预览/下载，完全不需要登录**
- **删除**（只有输了团队口令的业务员看得到） → 一并清掉 R2 文件

点缩略图打开预览模态框，可放大查看图片 / 在线播放视频 / 直接下载。

---

## 成本估算

| 用量 | 月费 |
|---|---|
| 10 GB 以下 | **¥0** |
| 50 GB | ¥4-5（按 (50-10)*$0.015 算） |
| 100 GB | ¥9-10 |
| 500 GB | ¥50 左右 |

而且**客户下载永远不收钱**，业务员每天发 100 条链接给客户都不烧钱。

---

## 故障排查

| 现象 | 原因 | 解决 |
|---|---|---|
| 物料库页面显示"后端还没接上" | 6 个 env 没配全 | 检查 Vercel env vars，重新 Redeploy |
| 上传时报"团队口令错误" | 浏览器存的口令和服务器对不上 | 点「退出上传」清掉重新输 |
| 上传时进度卡住 | CORS 没配 | 回 R2 → Settings → CORS Policy 加上你的 Vercel 域名 |
| 链接打开报错或 403 | 桶不是 Public | R2 → Bucket → Settings → Public access → Allow Access |
| 上传成功但页面没刷出来 | 罕见，manifest 写入失败 | 刷新一次页面，再看 |
| 想换 R2 桶 | 改 `R2_BUCKET_NAME` 重新部署 | 旧数据需要手动迁移 |

---

## 安全说明

- **下载链接是公开的**：任何拿到 URL 的人都能下载。**不要往物料库上传公司内部敏感资料**（如客户报价单、内部备忘录）。
- **上传口令**：只发给可信销售员，泄露后任何人都能往你的桶里塞东西。如果泄露，改 Vercel `MATERIALS_UPLOAD_KEY` 重部署即可（已上传文件不受影响，但旧口令立刻失效）。
- **删除是真删除**：删了的文件 R2 和 manifest 都不留备份，慎删。

---

## 进阶（可选）

### 绑自定义域

R2 → Bucket → Settings → **Custom Domains** → Add domain `materials.qztsecurity.com`

CF 自动加 DNS + SSL，然后把 `R2_PUBLIC_URL` 改成 `https://materials.qztsecurity.com`，链接看起来更像公司自己的。

### 自动生成缩略图（成本优化）

如果存了很多大图，列表加载慢。可以：
1. 上传时用 Cloudflare Images 转一份 300px 缩略图
2. 把缩略图 URL 写到 `thumbnail_url` 字段
3. 列表显示缩略图，预览时才取原图

需要时再做。
