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

export function useUserData(uid: string) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [ready, setReady] = useState({ cats: false, links: false });
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
    return () => {
      u1();
      u2();
    };
  }, [uid]);

  return { categories, links, loading: !(ready.cats && ready.links), error };
}

/** Cria o link e retorna o id na hora (a escrita sincroniza em segundo plano) */
export function addLink(uid: string, data: NewLink): string {
  const ref = doc(linksCol(uid));
  void setDoc(ref, data);
  return ref.id;
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
