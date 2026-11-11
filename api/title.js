// Vercel Serverless Function: GET /api/title?url=https://...
// Busca o <title> de uma página para preencher o nome do link automaticamente.

const PRIVATE_HOST =
  /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:)/i;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

function decode(str) {
  return str
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+|#39);/gi, (m, e) => ENTITIES[e.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTitle(html) {
  const og =
    html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const raw = (title && title[1].trim()) || (og && og[1]) || '';
  return raw ? decode(raw).slice(0, 300) : null;
}

// Sites de vídeo bloqueiam a leitura direta do HTML, mas têm uma API oEmbed oficial
const OEMBED = [
  { test: /(^|\.)(youtube\.com|youtu\.be)$/i, endpoint: 'https://www.youtube.com/oembed?format=json&url=' },
  { test: /(^|\.)vimeo\.com$/i, endpoint: 'https://vimeo.com/api/oembed.json?url=' },
];

async function oembedTitle(target, signal) {
  const provider = OEMBED.find((p) => p.test.test(target.hostname));
  if (!provider) return undefined;
  try {
    const r = await fetch(provider.endpoint + encodeURIComponent(target.href), { signal });
    if (!r.ok) return null;
    const data = await r.json();
    if (!data.title) return null;
    // Guarda também o canal: ajuda a achar o vídeo de novo se ele sumir
    return data.author_name ? `${data.title} · ${data.author_name}` : data.title;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  let target;
  try {
    target = new URL(String(req.query.url || ''));
  } catch {
    return res.status(400).json({ title: null, error: 'invalid url' });
  }
  if (!/^https?:$/.test(target.protocol) || PRIVATE_HOST.test(target.hostname)) {
    return res.status(400).json({ title: null, error: 'url not allowed' });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const fromOembed = await oembedTitle(target, ctrl.signal);
    if (fromOembed) {
      res.setHeader('cache-control', 'public, s-maxage=86400, stale-while-revalidate=604800');
      return res.status(200).json({ title: fromOembed });
    }

    const r = await fetch(target, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; GavetaBot/1.0; +https://github.com)',
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
      },
    });
    const type = r.headers.get('content-type') || '';
    if (!r.body || !type.includes('html')) {
      return res.status(200).json({ title: null });
    }

    // Lê no máximo ~400KB, parando assim que encontrar </title>
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let html = '';
    while (html.length < 400_000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      if (/<\/title>/i.test(html)) break;
    }
    reader.cancel().catch(() => {});

    res.setHeader('cache-control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({ title: extractTitle(html) });
  } catch {
    return res.status(200).json({ title: null });
  } finally {
    clearTimeout(timer);
  }
}
