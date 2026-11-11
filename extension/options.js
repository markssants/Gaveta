import { getSettings, matchPattern, toOrigin } from './shared.js';

const input = document.getElementById('url');
const status = document.getElementById('status');

const { gavetaUrl } = await getSettings();
input.value = gavetaUrl || (await bundledDefault());

/** Endereço embutido pelo site ao gerar o download (defaults.json), se houver */
async function bundledDefault() {
  try {
    const r = await fetch(chrome.runtime.getURL('defaults.json'));
    return r.ok ? (await r.json()).gavetaUrl || '' : '';
  } catch {
    return '';
  }
}

function show(msg, kind) {
  status.textContent = msg;
  status.className = kind;
}

/** Registra o bridge.js no site do Gaveta, para receber a confirmação de "gravado" */
async function registerBridge(origin) {
  const id = 'gaveta-bridge';
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
  if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [id] });
  await chrome.scripting.registerContentScripts([
    { id, matches: [matchPattern(origin)], js: ['bridge.js'], runAt: 'document_start', persistAcrossSessions: true },
  ]);
}

document.getElementById('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const origin = toOrigin(input.value);
  if (!origin) return show('Esse endereço não parece válido.', 'err');

  // Precisa ser chamado direto no clique (gesto do usuário)
  const granted = await chrome.permissions.request({ origins: [matchPattern(origin)] });
  if (!granted) {
    return show('Sem a permissão, a extensão não consegue fechar as abas depois de guardar. Tente de novo e clique em "Permitir".', 'err');
  }

  // Remove a permissão do endereço antigo, se mudou
  if (gavetaUrl && gavetaUrl !== origin) {
    const old = matchPattern(gavetaUrl);
    if (old !== matchPattern(origin)) await chrome.permissions.remove({ origins: [old] }).catch(() => {});
  }

  await registerBridge(origin);
  await chrome.storage.sync.set({ gavetaUrl: origin });
  input.value = origin;
  show('Pronto! Já pode usar o ícone da extensão.', 'ok');
});
