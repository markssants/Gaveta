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

/** Tira um print da aba, reduzido a 480×270. Só funciona se ela for a aba visível. */
async function captureThumb(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.active) return null;
    const shot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 85 });
    const bytes = Uint8Array.from(atob(shot.split(',')[1]), (c) => c.charCodeAt(0));
    const image = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));

    const W = 480;
    const H = 270;
    // Mantém o topo da página, que é a parte que identifica o site
    const sourceHeight = Math.min(image.height, Math.round((image.width * H) / W));
    const sourceWidth = Math.round((sourceHeight * W) / H);
    const canvas = new OffscreenCanvas(W, H);
    canvas.getContext('2d').drawImage(image, (image.width - sourceWidth) / 2, 0, sourceWidth, sourceHeight, 0, 0, W, H);
    const out = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.72 })).arrayBuffer());

    let binary = '';
    for (const byte of out) binary += String.fromCharCode(byte);
    return 'data:image/jpeg;base64,' + btoa(binary);
  } catch {
    return null; // o Gaveta tenta a imagem de preview do site
  }
}

/** Abre a janelinha de "Guardar link" do Gaveta, já preenchida */
async function saveOne({ url, title, tabId, close, categoryId, auto, newFolder }) {
  const s = await requireUrl();
  if (!s) return;
  const rid = crypto.randomUUID();
  // Antes de abrir a janelinha, enquanto a aba ainda está visível
  const thumb = tabId != null ? await captureThumb(tabId) : null;
  const target = new URL(s.gavetaUrl);
  target.searchParams.set('add', url);
  if (title) target.searchParams.set('title', title);
  target.searchParams.set('rid', rid);
  target.searchParams.set('popup', '1');
  if (categoryId) target.searchParams.set('cat', categoryId);
  if (auto) target.searchParams.set('auto', '1');
  if (newFolder?.name) {
    target.searchParams.set('newName', newFolder.name);
    if (newFolder.parentId) target.searchParams.set('newParent', newFolder.parentId);
  }
  // No hash, para o print não ir para o servidor na URL
  if (thumb) target.hash = 'thumb=' + encodeURIComponent(thumb);

  // Guardando direto, a janelinha só aparece por um instante
  const size = auto ? { width: 420, height: 320 } : { width: 520, height: 680 };
  const win = await chrome.windows.create({ url: target.href, type: 'popup', ...size, focused: true });
  await remember(rid, { tabIds: close && tabId != null ? [tabId] : [], popupWindowId: win.id });
}

/** Abre o Gaveta numa aba nova com a lista de abas para importar */
async function saveMany({ tabs, close, categoryId, auto, newFolder }) {
  const s = await requireUrl();
  if (!s || !tabs.length) return;
  const rid = crypto.randomUUID();
  const payload = { v: 1, rid, categoryId, auto, newFolder, items: tabs.map((t) => ({ url: t.url, title: t.title || '' })) };
  const target = new URL(s.gavetaUrl);
  target.hash = 'gaveta=' + encodeURIComponent(JSON.stringify(payload));

  await chrome.tabs.create({ url: target.href, active: true, windowId: tabs[0].windowId });
  await remember(rid, { tabIds: close ? tabs.map((t) => t.id) : [] });
}

async function saveActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const { gavetaUrl, closeAfterSave } = await getSettings();
  if (!isSavable(tab, gavetaUrl)) return;
  const { lastFolder } = await chrome.storage.local.get('lastFolder');
  // Atalho: abre o formulário já com a última gaveta usada
  await saveOne({ url: tab.url, title: tab.title, tabId: tab.id, close: closeAfterSave, categoryId: lastFolder });
}

/** Só aceita mensagens vindas do próprio site do Gaveta */
async function fromGaveta(sender) {
  const { gavetaUrl } = await getSettings();
  try {
    return Boolean(gavetaUrl) && new URL(sender.url).origin === gavetaUrl;
  } catch {
    return false;
  }
}

/** Guarda a lista de gavetas que o site mandou, para o seletor do popup */
async function onCategories(msg, sender) {
  if (!(await fromGaveta(sender))) return;
  const items = msg.items
    .slice(0, 2000)
    .filter((c) => typeof c?.id === 'string' && typeof c?.name === 'string')
    .map((c) => ({
      id: c.id,
      name: c.name.slice(0, 80),
      emoji: String(c.emoji ?? '').slice(0, 8),
      depth: Math.min(Number(c.depth) || 0, 10),
      parentId: typeof c.parentId === 'string' ? c.parentId : null,
    }));
  const update = { folders: { items, autoGroup: msg.autoGroup === true, at: Date.now() } };
  // Gaveta criada pelo popup: quando ela aparece na lista, vira a escolha padrão
  const { pendingFolder } = await chrome.storage.local.get('pendingFolder');
  if (pendingFolder) {
    const match = items.find((c) => c.parentId === pendingFolder.parentId && c.name.trim().toLowerCase() === pendingFolder.name.toLowerCase());
    if (match) {
      update.lastFolder = match.id;
      await chrome.storage.local.remove('pendingFolder');
    }
  }
  await chrome.storage.local.set(update);
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
    if (msg?.source === 'gaveta-app' && msg.type === 'categories') return onCategories(msg, sender);
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
