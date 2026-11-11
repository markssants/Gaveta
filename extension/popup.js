import { getSettings, isSavable, matchPattern } from './shared.js';

const $ = (id) => document.getElementById(id);

const settings = await getSettings();
const { gavetaUrl } = settings;

$('settings').onclick = () => chrome.runtime.openOptionsPage();
$('goSetup').onclick = () => chrome.runtime.openOptionsPage();
$('open').onclick = async () => {
  if (!gavetaUrl) return chrome.runtime.openOptionsPage();
  const tabs = await chrome.tabs.query({ url: matchPattern(gavetaUrl) });
  const existing = tabs.find((t) => t.url?.startsWith(gavetaUrl));
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: gavetaUrl });
  }
  window.close();
};

if (!gavetaUrl) {
  $('setup').hidden = false;
} else {
  $('main').hidden = false;

  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  const all = (await chrome.tabs.query({ currentWindow: true })).filter((t) => !t.pinned && isSavable(t, gavetaUrl));

  // Aba atual
  if (isSavable(active, gavetaUrl)) {
    $('title').textContent = active.title || active.url;
    $('host').textContent = new URL(active.url).hostname.replace(/^www\./, '');
    if (active.favIconUrl) $('favicon').src = active.favIconUrl;
    else $('favicon').hidden = true;
  } else {
    $('title').textContent = 'Esta aba não pode ser guardada';
    $('host').textContent = 'páginas internas do navegador ficam de fora';
    $('favicon').hidden = true;
    $('saveOne').disabled = true;
  }

  // Todas as abas
  $('saveAll').textContent = `Guardar todas as abas desta janela (${all.length})`;
  $('saveAll').disabled = all.length === 0;

  // Opção de fechar
  const closeBox = $('close');
  closeBox.checked = settings.closeAfterSave;
  closeBox.onchange = () => chrome.storage.sync.set({ closeAfterSave: closeBox.checked });

  $('saveOne').onclick = async () => {
    await chrome.runtime.sendMessage({ type: 'save-one', url: active.url, title: active.title, tabId: active.id, close: closeBox.checked });
    window.close();
  };

  $('saveAll').onclick = async () => {
    const tabs = all.map((t) => ({ id: t.id, url: t.url, title: t.title, windowId: t.windowId }));
    await chrome.runtime.sendMessage({ type: 'save-many', tabs, close: closeBox.checked });
    window.close();
  };
}
