# QZT WhatsApp Chat Extractor MVP

这个 MVP Chrome 插件用于 `web.whatsapp.com`：

- 抓取当前打开客户聊天窗口中已经加载出来的可见消息。
- 按 WhatsApp Web 版面判断发言人：左侧消息标记为 `Customer`，右侧消息标记为 `Me`。
- 整理成可直接给 QZT 销售助手分析的文字。
- 自动复制到剪贴板。
- 一键打开 QZT 第 4 步「销售助手」，并把聊天内容自动填进「详细对话内容」。

## 安装

1. 打开 Chrome：`chrome://extensions/`
2. 打开右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择这个目录：

```text
/Volumes/Rock-工作盘/龙虾开发程序/qzt-frontend/extensions/whatsapp-qzt-mvp
```

如果之前已经加载过这个插件，修改代码后需要在 `chrome://extensions/` 里点击该插件卡片上的刷新按钮，然后刷新 `web.whatsapp.com` 页面。

## 使用

1. 打开 `https://web.whatsapp.com/`
2. 进入某个客户的聊天窗口
3. 如果要更多历史记录，先向上滚动，让 WhatsApp Web 把历史消息加载出来
4. 点击右下角 QZT 浮窗：
   - `抓取并打开销售助手`：复制聊天并打开 QZT 销售助手自动填入
   - `只复制聊天`：只复制整理后的文字

如果右下角浮窗没有出现：

1. 刷新 `web.whatsapp.com`
2. 点击浏览器右上角的 QZT 插件图标
3. 在弹窗里点击 `抓取并打开销售助手`

## 当前限制

- 只抓取当前聊天窗口中 WhatsApp Web 已经加载到页面里的消息。
- 不会读取 WhatsApp 后台数据库，也不会绕过端到端加密。
- WhatsApp Web 的 DOM 结构可能变化，后续需要按页面变化维护选择器。
- MVP 不做自动发送，仍由业务员人工确认后发送，避免账号风控。

## 配置 QZT 网页地址

默认打开：

```text
https://pluie-leads.vercel.app/
```

如需换成别的正式域名，修改 `content-script.js` 顶部的 `QZT_APP_URL`。
