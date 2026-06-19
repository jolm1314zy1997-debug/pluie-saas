(() => {
  const QZT_APP_URL = 'https://jolm1314zy1997-debug-qzt-eu-lead-sy.vercel.app/';
  const MAX_MESSAGES = 80;
  const MAX_PAYLOAD_CHARS = 14000;

  if (window.__qztWhatsAppExtractorLoaded) return;
  window.__qztWhatsAppExtractorLoaded = true;

  function textOf(node) {
    return (node?.innerText || node?.textContent || '').replace(/\s+\n/g, '\n').trim();
  }

  function getContactName() {
    const header = document.querySelector('header');
    if (!header) return 'Unknown customer';

    const titleNode =
      header.querySelector('[data-testid="conversation-info-header-chat-title"]') ||
      header.querySelector('span[title]') ||
      header.querySelector('h1') ||
      header.querySelector('[role="button"] span');

    const title = titleNode?.getAttribute?.('title') || textOf(titleNode);
    if (title) return title.split('\n')[0].trim();

    return textOf(header).split('\n').find(Boolean) || 'Unknown customer';
  }

  function getMessageText(messageNode) {
    const selectableTexts = Array.from(messageNode.querySelectorAll('span.selectable-text, div.selectable-text'));
    const text = selectableTexts.map(textOf).filter(Boolean).join('\n').trim();
    if (text) return text;

    return textOf(messageNode)
      .replace(/\n?\d{1,2}:\d{2}\s*(AM|PM)?\s*$/i, '')
      .trim();
  }

  function parseSenderFromMeta(meta) {
    const match = meta?.match(/\]\s*([^:]+):\s*$/);
    return match?.[1]?.trim() || '';
  }

  function getConversationCenterX() {
    const main = document.querySelector('#main') || document.querySelector('[role="main"]');
    const rect = main?.getBoundingClientRect?.();
    if (rect && rect.width > 200) return rect.left + rect.width / 2;
    return window.innerWidth / 2;
  }

  function getDirection(messageNode, sender, contactName) {
    const rect = messageNode.getBoundingClientRect();
    if (rect && rect.width > 0) {
      const messageCenter = rect.left + rect.width / 2;
      return messageCenter > getConversationCenterX() ? 'Me' : 'Customer';
    }

    const container = messageNode.closest('[class*="message-"], [data-id]');
    const classes = container?.className || '';
    if (String(classes).includes('message-out')) return 'Me';
    if (String(classes).includes('message-in')) return 'Customer';
    if (sender && contactName && sender.toLowerCase() === contactName.toLowerCase()) return 'Customer';
    if (sender) return sender;
    return 'Unknown';
  }

  function collectChat() {
    const contactName = getContactName();
    const messageNodes = Array.from(document.querySelectorAll('div.copyable-text[data-pre-plain-text]'));

    const messages = messageNodes
      .map((node) => {
        const meta = node.getAttribute('data-pre-plain-text') || '';
        const sender = parseSenderFromMeta(meta);
        const direction = getDirection(node, sender, contactName);
        const text = getMessageText(node);
        if (!text) return null;
        return { meta, direction, text };
      })
      .filter(Boolean)
      .slice(-MAX_MESSAGES);

    if (!messages.length) {
      throw new Error('当前页面没有抓到可见聊天记录。请先打开某个客户聊天，并向上滚动加载需要的历史消息。');
    }

    const lines = [
      '[Source] WhatsApp Web current visible chat',
      `[Extracted at] ${new Date().toLocaleString()}`,
      `[Contact] ${contactName}`,
      `[Visible messages captured] ${messages.length}`,
      '',
      '[Chat log]',
      ...messages.map((message, index) => {
        const meta = message.meta ? ` ${message.meta}` : '';
        return `${index + 1}. [${message.direction}]${meta}\n${message.text}`;
      }),
    ];

    let payload = lines.join('\n\n');
    if (payload.length > MAX_PAYLOAD_CHARS) {
      payload = `${payload.slice(payload.length - MAX_PAYLOAD_CHARS)}\n\n[Note] Earlier visible messages were trimmed because the payload was too long.`;
    }

    return payload;
  }

  async function extractAndCopy() {
    const payload = collectChat();
    await copyToClipboard(payload);
    setStatus('已复制当前可见聊天', 'success');
    return payload;
  }

  async function extractAndOpen() {
    const payload = collectChat();
    await copyToClipboard(payload).catch(() => undefined);
    openQztAssistant(payload);
    setStatus('已打开 QZT 销售助手', 'success');
    return payload;
  }

  async function copyToClipboard(text) {
    await navigator.clipboard.writeText(text);
  }

  function openQztAssistant(text) {
    const url = new URL(QZT_APP_URL);
    url.searchParams.set('assistant', '1');
    url.searchParams.set('assistant_chat', text);
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
  }

  function setStatus(text, tone = 'normal') {
    const status = document.getElementById('qzt-wa-status');
    if (!status) return;
    status.textContent = text;
    status.style.color = tone === 'error' ? '#b91c1c' : tone === 'success' ? '#047857' : '#6b7280';
  }

  function createPanel() {
    const panel = document.createElement('div');
    panel.id = 'qzt-wa-panel';
    panel.innerHTML = `
      <div class="qzt-wa-title">QZT</div>
      <button id="qzt-wa-send" type="button">抓取并打开销售助手</button>
      <button id="qzt-wa-copy" type="button">只复制聊天</button>
      <div id="qzt-wa-status">打开客户聊天后使用</div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #qzt-wa-panel {
        position: fixed;
        right: 18px;
        bottom: 84px;
        z-index: 999999;
        width: 188px;
        padding: 12px;
        border: 1px solid rgba(17, 24, 39, 0.14);
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.96);
        box-shadow: 0 16px 42px rgba(17, 24, 39, 0.18);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #111827;
      }
      #qzt-wa-panel .qzt-wa-title {
        font-size: 13px;
        font-weight: 700;
        margin-bottom: 8px;
      }
      #qzt-wa-panel button {
        width: 100%;
        border: 0;
        border-radius: 9px;
        padding: 8px 9px;
        margin-top: 6px;
        background: #7c4a1e;
        color: #fff;
        font-size: 12px;
        font-weight: 650;
        cursor: pointer;
      }
      #qzt-wa-panel button#qzt-wa-copy {
        background: #f3f4f6;
        color: #374151;
        border: 1px solid #e5e7eb;
      }
      #qzt-wa-panel button:hover {
        filter: brightness(0.96);
      }
      #qzt-wa-status {
        margin-top: 8px;
        font-size: 11px;
        line-height: 1.35;
        color: #6b7280;
      }
    `;

    document.documentElement.appendChild(style);
    document.documentElement.appendChild(panel);

    panel.querySelector('#qzt-wa-copy')?.addEventListener('click', async () => {
      try {
        await extractAndCopy();
      } catch (error) {
        setStatus(error.message || '抓取失败', 'error');
      }
    });

    panel.querySelector('#qzt-wa-send')?.addEventListener('click', async () => {
      try {
        await extractAndOpen();
      } catch (error) {
        setStatus(error.message || '抓取失败', 'error');
      }
    });
  }

  function boot() {
    if (document.getElementById('qzt-wa-panel')) return;
    createPanel();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === 'QZT_WA_PING') {
        sendResponse({ ok: true });
        return false;
      }

      if (message?.type === 'QZT_WA_EXTRACT_AND_COPY') {
        extractAndCopy()
          .then((payload) => sendResponse({ ok: true, chars: payload.length }))
          .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
        return true;
      }

      if (message?.type === 'QZT_WA_EXTRACT_AND_OPEN') {
        extractAndOpen()
          .then((payload) => sendResponse({ ok: true, chars: payload.length }))
          .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
        return true;
      }

      return false;
    });
  }
})();
