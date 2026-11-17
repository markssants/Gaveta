import { isValidThumb } from './thumbFormat';
import type { Category, LinkItem } from './types';
import { hostOf, normalizeUrl, urlKey } from './utils';

export const BACKUP_VERSION = 2;

export type Thumbs = Record<string, { data: string; at?: number }>;

export type BackupFile = {
  app: 'gaveta';
  version: number;
  exportedAt: string;
  settings: { autoGroup: boolean };
  categories: Category[];
  links: LinkItem[];
  /** Miniaturas por id do link. Ausente quando o backup foi feito sem elas */
  thumbs?: Thumbs;
};

export function backupFilename(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `gaveta-backup-${day}-${pad(date.getHours())}h${pad(date.getMinutes())}.json`;
}

export function buildBackup(data: { categories: Category[]; links: LinkItem[]; autoGroup: boolean; thumbs?: Thumbs }): BackupFile {
  return {
    app: 'gaveta',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: { autoGroup: data.autoGroup },
    categories: data.categories,
    links: data.links,
    ...(data.thumbs ? { thumbs: data.thumbs } : {}),
  };
}

// ---------- Leitura de um arquivo de backup ----------

const ID = /^[\w.-]{1,200}$/;
const validId = (v: unknown): v is string => typeof v === 'string' && ID.test(v) && v !== '.' && v !== '..';
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** O Firestore não aceita campos undefined, então só entram os que existem */
function clean<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

function readCategory(raw: unknown): Category | null {
  const c = raw as Record<string, unknown>;
  if (!c || typeof c !== 'object' || !validId(c.id)) return null;
  const name = str(c.name, 80).trim();
  if (!name) return null;
  const createdAt = num(c.createdAt) ?? Date.now();
  return clean({
    id: c.id,
    name,
    emoji: str(c.emoji, 8) || '📁',
    color: typeof c.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(c.color) ? c.color : '#8a8580',
    order: num(c.order) ?? createdAt,
    createdAt,
    parentId: validId(c.parentId) ? c.parentId : null,
    domain: typeof c.domain === 'string' && c.domain ? c.domain.slice(0, 200) : undefined,
    favorite: c.favorite === true ? true : undefined,
  }) as Category;
}

function readLink(raw: unknown): LinkItem | null {
  const l = raw as Record<string, unknown>;
  if (!l || typeof l !== 'object' || !validId(l.id)) return null;
  const url = normalizeUrl(str(l.url, 4000));
  if (!url) return null;
  return clean({
    id: l.id,
    url,
    title: str(l.title, 500) || hostOf(url),
    note: str(l.note, 5000),
    categoryId: validId(l.categoryId) ? l.categoryId : null,
    favorite: l.favorite === true,
    createdAt: num(l.createdAt) ?? Date.now(),
    later: l.later === true ? true : undefined,
    important: l.important === true ? true : undefined,
    pinned: l.pinned === true ? true : undefined,
    visits: num(l.visits) && num(l.visits)! > 0 ? Math.floor(num(l.visits)!) : undefined,
    lastVisitedAt: num(l.lastVisitedAt),
    hasThumb: l.hasThumb === true ? true : undefined,
    thumbAt: num(l.thumbAt),
  }) as LinkItem;
}

export type ParsedBackup = {
  exportedAt?: string;
  categories: Category[];
  links: LinkItem[];
  thumbs: Thumbs;
  /** Itens do arquivo que não deu pra ler (link inválido, sem id...) */
  unreadable: number;
};

/** Lê e valida o arquivo. Aceita também o formato antigo (sem versão e sem miniaturas). */
export function parseBackup(text: string): ParsedBackup | { error: string } {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: 'Esse arquivo não é um backup válido (não é JSON).' };
  }
  if (!data || data.app !== 'gaveta' || !Array.isArray(data.links) || !Array.isArray(data.categories)) {
    return { error: 'Esse arquivo não parece ser um backup do Gaveta.' };
  }

  const categories = data.categories.map(readCategory);
  const links = data.links.map(readLink);
  const thumbs: Thumbs = {};
  const rawThumbs = data.thumbs as Record<string, { data?: unknown; at?: unknown }> | undefined;
  if (rawThumbs && typeof rawThumbs === 'object') {
    for (const [id, t] of Object.entries(rawThumbs)) {
      if (validId(id) && isValidThumb(t?.data)) thumbs[id] = clean({ data: t.data as string, at: num(t.at) });
    }
  }

  return {
    exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : undefined,
    categories: categories.filter((c): c is Category => c !== null),
    links: links.filter((l): l is LinkItem => l !== null),
    thumbs,
    unreadable: categories.filter((c) => c === null).length + links.filter((l) => l === null).length,
  };
}

// ---------- Restauração ----------

export type RestorePlan = {
  categories: Category[];
  links: LinkItem[];
  thumbs: Record<string, { data: string; at: number }>;
  /** Links do arquivo que já existem aqui (mesmo id ou mesmo endereço) e por isso não são tocados */
  alreadyHere: number;
};

/**
 * Restauração que nunca apaga nem sobrescreve nada: só entra o que ainda não existe.
 * Gavetas mantêm os mesmos ids, então as subpastas e os links voltam para o lugar certo.
 */
export function planRestore(backup: ParsedBackup, existing: { categories: Category[]; links: LinkItem[] }): RestorePlan {
  const knownCategoryIds = new Set(existing.categories.map((c) => c.id));
  const added = backup.categories.filter((c) => !knownCategoryIds.has(c.id));
  const allCategoryIds = new Set([...knownCategoryIds, ...added.map((c) => c.id)]);
  const categories = added.map((c) => (c.parentId && c.parentId !== c.id && allCategoryIds.has(c.parentId) ? c : { ...c, parentId: null }));

  const knownLinkIds = new Set(existing.links.map((l) => l.id));
  const knownKeys = new Set(existing.links.map((l) => urlKey(l.url)));
  const links: LinkItem[] = [];
  const thumbs: RestorePlan['thumbs'] = {};
  let alreadyHere = 0;

  for (const l of backup.links) {
    const key = urlKey(l.url);
    if (knownLinkIds.has(l.id) || knownKeys.has(key)) {
      alreadyHere++;
      continue;
    }
    knownKeys.add(key);
    const thumb = backup.thumbs[l.id];
    const link: LinkItem = { ...l, categoryId: l.categoryId && allCategoryIds.has(l.categoryId) ? l.categoryId : null };
    if (thumb) {
      thumbs[l.id] = { data: thumb.data, at: thumb.at ?? l.thumbAt ?? Date.now() };
      link.hasThumb = true;
      link.thumbAt = thumbs[l.id].at;
    } else {
      delete link.hasThumb;
      delete link.thumbAt;
    }
    links.push(link);
  }

  return { categories, links, thumbs, alreadyHere };
}
