import { useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromCache,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import type { RestorePlan, Thumbs } from './backup';
import type { Category, LinkItem, NewLink } from './types';

const linksCol = (uid: string) => collection(db, 'users', uid, 'links');
const catsCol = (uid: string) => collection(db, 'users', uid, 'categories');
const thumbDoc = (uid: string, id: string) => doc(db, 'users', uid, 'thumbs', id);
const settingsDoc = (uid: string) => doc(db, 'users', uid, 'meta', 'settings');

export function useUserData(uid: string) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [autoGroup, setAutoGroupState] = useState(false);
  const [ready, setReady] = useState({ cats: false, links: false, settings: false });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onErr = (e: Error) => setError(e.message);
    const u1 = onSnapshot(
      query(catsCol(uid), orderBy('order')),
      (s) => {
        setCategories(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Category));
        setReady((r) => ({ ...r, cats: true }));
      },
      onErr,
    );
    const u2 = onSnapshot(
      query(linksCol(uid), orderBy('createdAt', 'desc')),
      (s) => {
        setLinks(s.docs.map((d) => ({ id: d.id, ...d.data() }) as LinkItem));
        setReady((r) => ({ ...r, links: true }));
      },
      onErr,
    );
    const u3 = onSnapshot(
      settingsDoc(uid),
      (s) => {
        setAutoGroupState(s.data()?.autoGroup === true);
        setReady((r) => ({ ...r, settings: true }));
      },
      onErr,
    );
    return () => {
      u1();
      u2();
      u3();
    };
  }, [uid]);

  return { categories, links, autoGroup, loading: !(ready.cats && ready.links && ready.settings), error };
}

/**
 * Cria o link e retorna o id na hora. `saved` resolve quando o servidor
 * confirma a gravação (a tela já atualiza antes disso, pelo cache local).
 */
export function addLink(uid: string, data: NewLink): { id: string; saved: Promise<void> } {
  const ref = doc(linksCol(uid));
  return { id: ref.id, saved: setDoc(ref, data) };
}

export function updateLink(uid: string, id: string, patch: Partial<NewLink>) {
  return updateDoc(doc(linksCol(uid), id), patch);
}

/** Conta uma abertura do link (para "Mais visitados") */
export function recordVisit(uid: string, id: string) {
  return updateDoc(doc(linksCol(uid), id), { visits: increment(1), lastVisitedAt: Date.now() });
}

export function deleteLink(uid: string, id: string) {
  const batch = writeBatch(db);
  batch.delete(doc(linksCol(uid), id));
  batch.delete(thumbDoc(uid, id));
  thumbCache.delete(id);
  return batch.commit();
}

/** Atualiza vários links de uma vez (em lotes, por causa do limite do Firestore) */
export async function updateLinks(uid: string, ids: string[], patch: Partial<NewLink>) {
  for (let i = 0; i < ids.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const id of ids.slice(i, i + BATCH_LIMIT)) batch.update(doc(linksCol(uid), id), patch);
    await batch.commit();
  }
}

/** Exclui vários links e as miniaturas deles */
export async function deleteLinks(uid: string, ids: string[]) {
  const PER_BATCH = Math.floor(BATCH_LIMIT / 2); // 2 exclusões por link
  for (let i = 0; i < ids.length; i += PER_BATCH) {
    const batch = writeBatch(db);
    for (const id of ids.slice(i, i + PER_BATCH)) {
      batch.delete(doc(linksCol(uid), id));
      batch.delete(thumbDoc(uid, id));
      thumbCache.delete(id);
    }
    await batch.commit();
  }
}

// A miniatura só muda quando recarregada à mão, e aí o link ganha um novo thumbAt
const thumbCache = new Map<string, { version?: number; pending: Promise<string | null> }>();

/** Grava a miniatura junto com a marca no link. Roda ao salvar o link ou ao recarregar à mão. */
export function saveThumb(uid: string, id: string, data: string) {
  const at = Date.now();
  const batch = writeBatch(db);
  batch.set(thumbDoc(uid, id), { data, at });
  batch.update(doc(linksCol(uid), id), { hasThumb: true, thumbAt: at });
  thumbCache.set(id, { version: at, pending: Promise.resolve(data) });
  return batch.commit();
}

export function loadThumb(uid: string, id: string, version?: number): Promise<string | null> {
  const cached = thumbCache.get(id);
  if (cached && cached.version === version) return cached.pending;
  const ref = thumbDoc(uid, id);
  const pending = getDocFromCache(ref)
    .then((s) => {
      // Recarregada em outro aparelho: o cache local ainda tem a imagem anterior
      if (s.data()?.at !== version) throw new Error('stale');
      return s;
    })
    .catch(() => getDoc(ref))
    .then((s) => (s.data()?.data as string | undefined) ?? null)
    .catch(() => null);
  pending.then((data) => data === null && thumbCache.delete(id));
  thumbCache.set(id, { version, pending });
  return pending;
}

export function addCategory(uid: string, data: Omit<Category, 'id'>): string {
  const ref = doc(catsCol(uid));
  void setDoc(ref, data);
  return ref.id;
}

export function updateCategory(uid: string, id: string, patch: Partial<Omit<Category, 'id'>>) {
  return updateDoc(doc(catsCol(uid), id), patch);
}

const BATCH_LIMIT = 450;

/**
 * Exclui a gaveta sem perder nada: links e subpastas sobem um nível, para a
 * gaveta de fora (parentId) ou, se ela era de topo, links vão para a Caixa de entrada.
 */
export async function deleteCategory(uid: string, id: string, linkIds: string[], childIds: string[], parentId: string | null) {
  const writes = [
    ...linkIds.map((lid) => ({ ref: doc(linksCol(uid), lid), patch: { categoryId: parentId, pinned: false } })),
    ...childIds.map((cid) => ({ ref: doc(catsCol(uid), cid), patch: { parentId } })),
  ];
  for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const w of writes.slice(i, i + BATCH_LIMIT)) batch.update(w.ref, w.patch);
    await batch.commit();
  }
  await deleteDoc(doc(catsCol(uid), id));
}

export function setAutoGroup(uid: string, on: boolean) {
  return setDoc(settingsDoc(uid), { autoGroup: on }, { merge: true });
}

/** Cria as gavetas de site, com o id definido em planGrouping */
export async function createCategories(uid: string, categories: Category[]) {
  for (let i = 0; i < categories.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const { id, ...data } of categories.slice(i, i + BATCH_LIMIT)) batch.set(doc(catsCol(uid), id), data);
    await batch.commit();
  }
}

export async function moveLinks(uid: string, moves: { id: string; categoryId: string }[]) {
  for (let i = 0; i < moves.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const m of moves.slice(i, i + BATCH_LIMIT)) batch.update(doc(linksCol(uid), m.id), { categoryId: m.categoryId });
    await batch.commit();
  }
}

/** Lê todas as miniaturas guardadas (uma leitura por miniatura) */
export async function fetchAllThumbs(uid: string): Promise<Thumbs> {
  const snap = await getDocs(collection(db, 'users', uid, 'thumbs'));
  const out: Thumbs = {};
  snap.forEach((d) => {
    const { data, at } = d.data() as { data?: string; at?: number };
    if (data) out[d.id] = at ? { data, at } : { data };
  });
  return out;
}

/** Grava o que o plano de restauração mandou, mantendo os ids originais */
export async function restoreData(uid: string, plan: RestorePlan, onProgress?: (done: number, total: number) => void) {
  const ops: ((batch: ReturnType<typeof writeBatch>) => void)[] = [
    ...plan.categories.map(({ id, ...data }) => (b: ReturnType<typeof writeBatch>) => b.set(doc(catsCol(uid), id), data)),
    ...plan.links.map(({ id, ...data }) => (b: ReturnType<typeof writeBatch>) => b.set(doc(linksCol(uid), id), data)),
    ...Object.entries(plan.thumbs).map(([id, t]) => (b: ReturnType<typeof writeBatch>) => b.set(thumbDoc(uid, id), t)),
  ];
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + BATCH_LIMIT)) op(batch);
    await batch.commit();
    onProgress?.(Math.min(i + BATCH_LIMIT, ops.length), ops.length);
  }
}

export async function importLinks(uid: string, items: NewLink[]): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < items.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const item of items.slice(i, i + BATCH_LIMIT)) {
      const ref = doc(linksCol(uid));
      ids.push(ref.id);
      batch.set(ref, item);
    }
    await batch.commit();
  }
  return ids;
}
