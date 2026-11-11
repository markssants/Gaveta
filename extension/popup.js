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

  // Seletor de gaveta: lista enviada pelo site do Gaveta, última escolha lembrada
  const { folders, lastFolder } = await chrome.storage.local.get(['folders', 'lastFolder']);
  const select = $('folder');
  const addOption = (value, label) => {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = label;
    select.append(o);
  };
  if (folders?.autoGroup) {
    addOption('', '✨ Automático (gaveta do site)');
    addOption('__inbox', '📥 Caixa de entrada');
  } else {
    addOption('', '📥 Caixa de entrada');
  }
  for (const f of folders?.items ?? []) addOption(f.id, '\u00A0\u00A0\u00A0'.repeat(f.depth) + `${f.emoji} ${f.name}`.trim());
  $('folderHint').hidden = Boolean(folders);
  if (lastFolder && [...select.options].some((o) => o.value === lastFolder)) select.value = lastFolder;
  select.onchange = () => {
    chrome.storage.local.set({ lastFolder: select.value });
    updateSub();
  };

  // Nova gaveta: a extensão não acessa a conta, então quem cria é o site, junto com o link
  const nameInput = $('newFolderName');
  const isFolder = (v) => v && v !== '__inbox';
  function updateSub() {
    const show = isFolder(select.value);
    $('asSubRow').hidden = !show;
    if (show) $('asSubLabel').textContent = `Criar como subpasta de ${select.selectedOptions[0].textContent.trim()}`;
    else $('asSub').checked = false;
  }
  updateSub();
  $('newFolderBtn').onclick = () => {
    const open = $('newFolder').hidden;
    $('newFolder').hidden = !open;
    $('newFolderBtn').setAttribute('aria-expanded', String(open));
    if (open) nameInput.focus();
    else nameInput.value = '';
  };
  function newFolder() {
    const name = $('newFolder').hidden ? '' : nameInput.value.trim();
    if (!name) return undefined;
    const parentId = $('asSub').checked && isFolder(select.value) ? select.value : null;
    // Lembra para deixar a gaveta nova selecionada na próxima vez
    chrome.storage.local.set({ pendingFolder: { name, parentId } });
    return { name, parentId };
  }

  // Opção de fechar
  const closeBox = $('close');
  closeBox.checked = settings.closeAfterSave;
  closeBox.onchange = () => chrome.storage.sync.set({ closeAfterSave: closeBox.checked });

  $('saveOne').onclick = async () => {
    await chrome.runtime.sendMessage({ type: 'save-one', url: active.url, title: active.title, tabId: active.id, close: closeBox.checked, categoryId: select.value, auto: true, newFolder: newFolder() });
    window.close();
  };

  $('editFirst').onclick = async () => {
    await chrome.runtime.sendMessage({ type: 'save-one', url: active.url, title: active.title, tabId: active.id, close: closeBox.checked, categoryId: select.value, auto: false, newFolder: newFolder() });
    window.close();
  };
  $('editFirst').disabled = $('saveOne').disabled;

  $('saveAll').onclick = async () => {
    const tabs = all.map((t) => ({ id: t.id, url: t.url, title: t.title, windowId: t.windowId }));
    await chrome.runtime.sendMessage({ type: 'save-many', tabs, close: closeBox.checked, categoryId: select.value, auto: true, newFolder: newFolder() });
    window.close();
  };
}
