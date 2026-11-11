// Vercel Serverless Function: GET /api/thumb?url=https://...
// Devolve a imagem de preview de uma página (capa do vídeo ou og:image).
// O navegador reduz a imagem e guarda o resultado, então isto só roda ao salvar.
//
// Como baixa endereços arbitrários, exige login e bloqueia a rede interna.

import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

const MAX_IMAGE = 5 * 1024 * 1024;
const MAX_HTML = 600_000;
const MAX_REDIRECTS = 4;
const IMAGE_TYPE = /^image\/(jpeg|png|webp|gif|avif)\b/i;
const UA = 'Mozilla/5.0 (compatible; GavetaBot/1.0)';

const blocked = new BlockList();
for (const [net, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 3],
]) blocked.addSubnet(net, bits, 'ipv4');
for (const [net, bits] of [['::1', 128], ['::', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]]) blocked.addSubnet(net, bits, 'ipv6');

function isBlockedIp(ip) {
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return blocked.check(mapped[1], 'ipv4');
  return blocked.check(ip, isIP(ip) === 6 ? 'ipv6' : 'ipv4');
}

async function assertPublic(url) {
  if (!/^https?:$/.test(url.protocol)) throw new Error('protocol');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addresses.length || addresses.some((a) => isBlockedIp(a.address))) throw new Error('blocked');
}

/** fetch que confere o destino de cada redirecionamento */
async function safeFetch(start, init) {
  let url = new URL(start);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(url);
    const r = await fetch(url, { ...init, redirect: 'manual' });
    const next = r.status >= 300 && r.status < 400 ? r.headers.get('location') : null;
    if (!next) return { response: r, finalUrl: url };
    await r.body?.cancel().catch(() => {});
    url = new URL(next, url);
  }
  throw new Error('too many redirects');
}

async function readLimited(response, limit, stopAt) {
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      if (stopAt) break; // HTML: usa o que já leu
      return null; // imagem: grande demais
    }
    chunks.push(value);
    if (stopAt) {
      text += decoder.decode(value, { stream: true });
      if (stopAt.test(text)) {
        await reader.cancel().catch(() => {});
        break;
      }
    }
  }
  return Buffer.concat(chunks);
}

const OEMBED = [
  { test: /(^|\.)(youtube\.com|youtu\.be)$/i, endpoint: 'https://www.youtube.com/oembed?format=json&url=' },
  { test: /(^|\.)vimeo\.com$/i, endpoint: 'https://vimeo.com/api/oembed.json?url=' },
];

function metaImage(html) {
  for (const name of ['og:image', 'twitter:image']) {
    const n = name.replace(':', '\\:');
    const m =
      html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]*content=["']([^"']+)["']`, 'i')) ||
      html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${n}["']`, 'i'));
    if (m) return m[1].replace(/&amp;/g, '&').trim();
  }
  return null;
}

async function findImage(target, signal) {
  const provider = OEMBED.find((p) => p.test.test(target.hostname));
  if (provider) {
    const r = await fetch(provider.endpoint + encodeURIComponent(target.href), { signal });
    if (!r.ok) return null;
    return (await r.json()).thumbnail_url || null;
  }
  const { response, finalUrl } = await safeFetch(target, {
    signal,
    headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,image/*' },
  });
  const type = response.headers.get('content-type') || '';
  if (IMAGE_TYPE.test(type)) {
    await response.body?.cancel().catch(() => {});
    return finalUrl.href; // o próprio link já é uma imagem
  }
  if (!response.ok || !response.body || !type.includes('html')) return null;
  const html = (await readLimited(response, MAX_HTML, /<\/head>/i)).toString('utf8');
  const found = metaImage(html);
  return found ? new URL(found, finalUrl).href : null;
}

/** Confere o login do Firebase, sem precisar do SDK de servidor */
async function isLoggedIn(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const key = process.env.VITE_FIREBASE_API_KEY;
  if (!token || !key) return false;
  try {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken: token }),
    });
    return r.ok && Boolean((await r.json()).users?.length);
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (!(await isLoggedIn(req))) return res.status(401).json({ error: 'login required' });

  let target;
  try {
    target = new URL(String(req.query.url || ''));
  } catch {
    return res.status(400).json({ error: 'invalid url' });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    await assertPublic(target);
    const imageUrl = await findImage(target, ctrl.signal);
    if (!imageUrl) return res.status(204).end();

    const { response } = await safeFetch(imageUrl, { signal: ctrl.signal, headers: { 'user-agent': UA, accept: 'image/*' } });
    const type = response.headers.get('content-type') || '';
    if (!response.ok || !response.body || !IMAGE_TYPE.test(type)) return res.status(204).end();
    const image = await readLimited(response, MAX_IMAGE);
    if (!image) return res.status(204).end();

    res.setHeader('content-type', type);
    res.setHeader('cache-control', 'private, no-store');
    res.setHeader('x-content-type-options', 'nosniff');
    return res.status(200).end(image);
  } catch {
    return res.status(204).end();
  } finally {
    clearTimeout(timer);
  }
}
