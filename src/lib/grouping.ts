import { CATEGORY_COLORS, type Category } from './types';

/** Domínios diferentes que são o mesmo site */
const ALIASES: Record<string, string> = {
  'youtu.be': 'youtube.com',
  'youtube-nocookie.com': 'youtube.com',
  'redd.it': 'reddit.com',
  'twitter.com': 'x.com',
  'amzn.to': 'amazon.com',
  'instagr.am': 'instagram.com',
  'fb.com': 'facebook.com',
  'fb.watch': 'facebook.com',
};

/** Nomes que não dá pra deduzir só capitalizando o domínio */
const NAMES: Record<string, string> = {
  'youtube.com': 'YouTube',
  'github.com': 'GitHub',
  'gitlab.com': 'GitLab',
  'x.com': 'X',
  'linkedin.com': 'LinkedIn',
  'tiktok.com': 'TikTok',
  'stackoverflow.com': 'Stack Overflow',
  'mercadolivre.com.br': 'Mercado Livre',
};

// Segundo nível de domínios como .com.br e .co.uk
const SECOND_LEVEL = new Set(['com', 'co', 'org', 'net', 'gov', 'edu', 'ac']);

/** Identifica o site de um link: "m.youtube.com" e "youtu.be" viram "youtube.com" */
export function siteKey(url: string): string | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!host.includes('.') || /^[\d.]+$/.test(host) || host.startsWith('[')) return null;
  const parts = host.split('.');
  const [second, top] = parts.slice(-2);
  const size = parts.length > 2 && top.length === 2 && SECOND_LEVEL.has(second) ? 3 : 2;
  const domain = parts.slice(-size).join('.');
  return ALIASES[domain] ?? domain;
}

export function siteName(key: string): string {
  if (NAMES[key]) return NAMES[key];
  const label = key.split('.')[0];
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function siteColor(key: string): string {
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return CATEGORY_COLORS[hash % CATEGORY_COLORS.length];
}

/**
 * Decide a gaveta de cada link. Reaproveita a gaveta do site, ou uma criada por
 * você com o mesmo nome. O id das gavetas novas é fixo por site, então dois
 * aparelhos salvando ao mesmo tempo não criam gavetas repetidas.
 */
export function planGrouping(urls: string[], categories: Category[]) {
  const created = new Map<string, Category>();
  const now = Date.now();

  const categoryIds = urls.map((url) => {
    const key = siteKey(url);
    if (!key) return null;
    const name = siteName(key);
    const existing =
      categories.find((c) => c.domain === key) ??
      categories.find((c) => c.name.trim().toLowerCase() === name.toLowerCase());
    if (existing) return existing.id;
    if (!created.has(key)) {
      created.set(key, { id: `site-${key}`, name, emoji: '🌐', color: siteColor(key), domain: key, order: now, createdAt: now });
    }
    return created.get(key)!.id;
  });

  return { categoryIds, newCategories: [...created.values()] };
}
