// Empacota a extensão para download no site, sem passar por nenhuma loja:
//   public/downloads/gaveta-extension.zip  → Vivaldi/Chrome/Edge/Brave ("Carregar sem compactação")
//   public/downloads/gaveta-firefox.xpi    → Firefox Developer Edition / Nightly / ESR (sem assinatura)
//   public/downloads/info.json             → versão, lida pela tela "Instalar extensão"
//
// Roda sozinho antes de `npm run dev` e `npm run build` (predev/prebuild).

import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { deflateRawSync } from 'node:zlib';

const root = new URL('..', import.meta.url).pathname;
const extDir = join(root, 'extension');
const outDir = join(root, 'public', 'downloads');
const manifest = JSON.parse(readFileSync(join(extDir, 'manifest.json'), 'utf8'));

// ---------- ZIP mínimo (sem dependências) ----------
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = ~0;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return ~c >>> 0;
}

function zip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  const DOS_TIME = 0;
  const DOS_DATE = (2026 - 1980) << 9 | (1 << 5) | 1;
  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const compressed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // nomes em UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + compressed.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    if (f.startsWith('.')) return [];
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = walk(extDir).map((p) => ({
  path: relative(extDir, p).split(sep).join('/'),
  data: readFileSync(p),
}));

// No Vercel, já embute o endereço do site para pré-preencher a configuração
const siteUrl =
  process.env.GAVETA_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '');
if (siteUrl) files.push({ path: 'defaults.json', data: Buffer.from(JSON.stringify({ gavetaUrl: siteUrl }) + '\n') });

// .zip: tudo dentro de uma pasta "gaveta-extension/", para descompactar organizado
writeFileSync(join(outDir, 'gaveta-extension.zip'), zip(files.map((f) => ({ name: 'gaveta-extension/' + f.path, data: f.data }))));
// .xpi: mesmo conteúdo, com o manifest.json na raiz (exigência do Firefox)
writeFileSync(join(outDir, 'gaveta-firefox.xpi'), zip(files.map((f) => ({ name: f.path, data: f.data }))));
writeFileSync(join(outDir, 'info.json'), JSON.stringify({ version: manifest.version }, null, 2) + '\n');

console.log(`✓ extensão v${manifest.version} empacotada${siteUrl ? ` (endereço: ${siteUrl})` : ''}`);
