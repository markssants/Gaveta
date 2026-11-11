import { useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
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
  return deleteDoc(doc(linksCol(uid), id));
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

/** Exclui a gaveta e manda os links dela para a Caixa de entrada */
export async function deleteCategory(uid: string, id: string, linkIds: string[]) {
  for (let i = 0; i < linkIds.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const lid of linkIds.slice(i, i + BATCH_LIMIT)) {
      batch.update(doc(linksCol(uid), lid), { categoryId: null });
    }
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
