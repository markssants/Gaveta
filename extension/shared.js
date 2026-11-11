// Funções usadas pelo background, pelo popup e pela página de opções

export const DEFAULTS = { gavetaUrl: '', closeAfterSave: false };

export async function getSettings() {
  const stored = await chrome.storage.sync.get(Object.keys(DEFAULTS));
  return { ...DEFAULTS, ...stored };
}

/** Normaliza o endereço do Gaveta para a origem (ex.: https://gaveta.vercel.app) */
export function toOrigin(raw) {
  let s = String(raw || '').trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = (/^(localhost|127\.0\.0\.1)/.test(s) ? 'http://' : 'https://') + s;
  try {
    return new URL(s).origin;
  } catch {
    return null;
  }
}

/** Padrão de permissão/match para a origem (padrões de match ignoram a porta) */
export function matchPattern(origin) {
  const u = new URL(origin);
  return `${u.protocol}//${u.hostname}/*`;
}

const UNSAVABLE = /^(chrome|edge|brave|opera|vivaldi|about|chrome-extension|moz-extension|view-source|devtools|file|data|blob|javascript):/i;

/** Abas que dá pra guardar: só http(s), sem o próprio Gaveta */
export function isSavable(tab, gavetaOrigin) {
  if (!tab?.url || UNSAVABLE.test(tab.url)) return false;
  if (gavetaOrigin && tab.url.startsWith(gavetaOrigin)) return false;
  return /^https?:\/\//i.test(tab.url);
}
