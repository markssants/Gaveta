/** Aceita "site.com/x" ou "https://site.com/x". Retorna null se não for um link http(s) válido. */
export function normalizeUrl(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Chave para detectar links duplicados (ignora protocolo, www, barra final e #hash) */
export function urlKey(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, '');
    return (u.hostname.replace(/^www\./, '') + path + u.search).toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

export function faviconOf(url: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostOf(url))}&sz=64`;
}

/**
 * Lê uma lista de links colada: um por linha, texto solto, ou o formato de
 * exportação do OneTab ("https://url | Título").
 */
export function parseBulk(text: string): { url: string; title: string }[] {
  const out: { url: string; title: string }[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const matches = line.match(/https?:\/\/[^\s<>"'|]+/gi);
    if (!matches) continue;
    const single = matches.length === 1;
    for (const m of matches) {
      const url = normalizeUrl(m.replace(/[),.;]+$/, ''));
      if (!url) continue;
      const key = urlKey(url);
      if (seen.has(key)) continue;
      seen.add(key);
      let title = '';
      if (single) {
        const pipe = line.indexOf(' | ');
        if (pipe > -1) title = line.slice(pipe + 3).trim();
      }
      out.push({ url, title });
    }
  }
  return out;
}

const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });

export function relTime(ts: number): string {
  const diff = (ts - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return 'agora';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export async function fetchTitle(url: string): Promise<string | null> {
  try {
    const r = await fetch('/api/title?url=' + encodeURIComponent(url));
    if (!r.ok) return null;
    const data = (await r.json()) as { title: string | null };
    return data.title || null;
  } catch {
    return null;
  }
}

/** Executa tarefas assíncronas com limite de concorrência */
export async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  });
  await Promise.all(workers);
}

export function download(filename: string, content: string, type = 'application/json') {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Normaliza e remove repetidos de uma lista de links (ex.: abas vindas da extensão) */
export function cleanItems(items: { url: string; title: string }[]): { url: string; title: string }[] {
  const seen = new Set<string>();
  const out: { url: string; title: string }[] = [];
  for (const it of items) {
    const url = normalizeUrl(it.url);
    if (!url || seen.has(urlKey(url))) continue;
    seen.add(urlKey(url));
    out.push({ url, title: it.title.trim() });
  }
  return out;
}

/**
 * Links do campo rápido: um ou vários, separados por linha, espaço ou vírgula.
 * Se o texto tiver algum link com http(s)://, só esses contam (evita que palavras
 * como "Node.js" num título virem link). Sem nenhum, aceita "site.com".
 */
export function parseQuick(text: string): string[] {
  const explicit = text.match(/https?:\/\/[^\s<>"'|]+/gi);
  const tokens = explicit ?? text.split(/[\s,;]+/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of tokens) {
    const url = normalizeUrl(token.replace(/^[<("']+/, '').replace(/[>)"'.,;]+$/, ''));
    if (!url || seen.has(urlKey(url))) continue;
    seen.add(urlKey(url));
    out.push(url);
  }
  return out;
}
