import { useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromCache,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
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

export function deleteLink(uid: string, id: string) {
  const batch = writeBatch(db);
  batch.delete(doc(linksCol(uid), id));
  batch.delete(thumbDoc(uid, id));
  thumbCache.delete(id);
  return batch.commit();
}

// Miniaturas nunca mudam depois de gravadas, então o cache nunca precisa revalidar
const thumbCache = new Map<string, Promise<string | null>>();

/** Grava a miniatura junto com a marca no link. Só é chamada ao salvar o link. */
export function saveThumb(uid: string, id: string, data: string) {
  const batch = writeBatch(db);
  batch.set(thumbDoc(uid, id), { data });
  batch.update(doc(linksCol(uid), id), { hasThumb: true });
  return batch.commit();
}

export function loadThumb(uid: string, id: string): Promise<string | null> {
  const cached = thumbCache.get(id);
  if (cached) return cached;
  const ref = thumbDoc(uid, id);
  const pending = getDocFromCache(ref)
    .catch(() => getDoc(ref))
    .then((s) => (s.data()?.data as string | undefined) ?? null)
    .catch(() => null);
  pending.then((data) => data === null && thumbCache.delete(id));
  thumbCache.set(id, pending);
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
    ...linkIds.map((lid) => ({ ref: doc(linksCol(uid), lid), patch: { categoryId: parentId } })),
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
