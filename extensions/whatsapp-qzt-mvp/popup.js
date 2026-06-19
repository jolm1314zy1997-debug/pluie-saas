const statusEl = document.getElementById('status');

function setStatus(text, type = '') {
  statusEl.textContent = text;
  statusEl.className = type;
}

async function getActiveWhatsAppTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.startsWith('https://web.whatsapp.com/')) {
    throw new Error('请先切到 web.whatsapp.com 的客户聊天页面。');
  }
  return tab;
}

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'QZT_WA_PING' });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content-script.js'],
    });
  }
}

async function run(action) {
  setStatus('正在抓取当前聊天...');
  try {
    const tab = await getActiveWhatsAppTab();
    await ensureContentScript(tab.id);
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: action === 'send' ? 'QZT_WA_EXTRACT_AND_OPEN' : 'QZT_WA_EXTRACT_AND_COPY',
    });

    if (!response?.ok) {
      throw new Error(response?.error || '抓取失败');
    }

    setStatus(action === 'send' ? '已打开 QZT 销售助手。' : '已复制当前聊天。', 'ok');
  } catch (error) {
    setStatus(error.message || '抓取失败', 'error');
  }
}

document.getElementById('send')?.addEventListener('click', () => run('send'));
document.getElementById('copy')?.addEventListener('click', () => run('copy'));
