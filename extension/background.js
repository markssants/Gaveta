import { getSettings, isSavable } from './shared.js';

// ---------- Pedidos pendentes ----------
// Cada envio ao Gaveta tem um id (rid). Quando o site confirma que gravou,
// fechamos as abas daquele pedido (se o usuário pediu) e a janelinha.

async function remember(rid, data) {
  const { pending = {} } = await chrome.storage.session.get('pending');
  // limpa pedidos com mais de 1 dia
  for (const [k, v] of Object.entries(pending)) if (Date.now() - v.at > 86_400_000) delete pending[k];
  pending[rid] = { ...data, at: Date.now() };
  await chrome.storage.session.set({ pending });
}

async function take(rid) {
  const { pending = {} } = await chrome.storage.session.get('pending');
  const item = pending[rid];
  if (item) {
    delete pending[rid];
    await chrome.storage.session.set({ pending });
  }
  return item;
}

// ---------- Ações ----------

async function requireUrl() {
  const s = await getSettings();
  if (!s.gavetaUrl) {
    await chrome.runtime.openOptionsPage();
    return null;
  }
  return s;
}

/** Abre a janelinha de "Guardar link" do Gaveta, já preenchida */
async function saveOne({ url, title, tabId, close }) {
  const s = await requireUrl();
  if (!s) return;
  const rid = crypto.randomUUID();
  const target = new URL(s.gavetaUrl);
  target.searchParams.set('add', url);
  if (title) target.searchParams.set('title', title);
  target.searchParams.set('rid', rid);
  target.searchParams.set('popup', '1');

  const win = await chrome.windows.create({ url: target.href, type: 'popup', width: 520, height: 680, focused: true });
  await remember(rid, { tabIds: close && tabId != null ? [tabId] : [], popupWindowId: win.id });
}

/** Abre o Gaveta numa aba nova com a lista de abas para importar */
async function saveMany({ tabs, close }) {
  const s = await requireUrl();
  if (!s || !tabs.length) return;
  const rid = crypto.randomUUID();
  const payload = { v: 1, rid, items: tabs.map((t) => ({ url: t.url, title: t.title || '' })) };
  const target = new URL(s.gavetaUrl);
  target.hash = 'gaveta=' + encodeURIComponent(JSON.stringify(payload));

  await chrome.tabs.create({ url: target.href, active: true, windowId: tabs[0].windowId });
  await remember(rid, { tabIds: close ? tabs.map((t) => t.id) : [] });
}

async function saveActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const { gavetaUrl, closeAfterSave } = await getSettings();
  if (!isSavable(tab, gavetaUrl)) return;
  await saveOne({ url: tab.url, title: tab.title, tabId: tab.id, close: closeAfterSave });
}

async function onSaved(rid, sender) {
  const { gavetaUrl } = await getSettings();
  // Só aceita confirmação vinda do próprio Gaveta
  let senderOrigin = null;
  try {
    senderOrigin = new URL(sender.url).origin;
  } catch {}
  if (!gavetaUrl || senderOrigin !== gavetaUrl) return;
  const p = await take(rid);
  if (!p) return;
  if (p.tabIds.length) await chrome.tabs.remove(p.tabIds).catch(() => {});
  if (p.popupWindowId) setTimeout(() => chrome.windows.remove(p.popupWindowId).catch(() => {}), 700);
}

// ---------- Mensagens ----------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const run = async () => {
    if (msg?.source === 'gaveta-app' && msg.type === 'saved') return onSaved(msg.rid, sender);
    if (msg?.type === 'save-one') return saveOne(msg);
    if (msg?.type === 'save-many') return saveMany(msg);
  };
  run().then(
    () => sendResponse({ ok: true }),
    (e) => sendResponse({ ok: false, error: String(e) }),
  );
  return true; // resposta assíncrona
});

// ---------- Atalho de teclado ----------

chrome.commands.onCommand.addListener((cmd) => {
  if (cmd === 'save-current-tab') void saveActiveTab();
});

// ---------- Menu do botão direito ----------

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'save-page', title: 'Guardar esta página no Gaveta', contexts: ['page'] });
    chrome.contextMenus.create({ id: 'save-link', title: 'Guardar link no Gaveta', contexts: ['link'] });
  });
  if (reason === 'install') {
    const { gavetaUrl } = await getSettings();
    if (!gavetaUrl) chrome.runtime.openOptionsPage();
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const { closeAfterSave } = await getSettings();
  if (info.menuItemId === 'save-page' && tab?.url) {
    await saveOne({ url: tab.url, title: tab.title, tabId: tab.id, close: closeAfterSave });
  } else if (info.menuItemId === 'save-link' && info.linkUrl) {
    // Para um link dentro da página, o título é buscado pelo Gaveta
    await saveOne({ url: info.linkUrl, title: info.linkText || '', close: false });
  }
});
