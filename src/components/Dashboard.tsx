import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { signOut, type User } from 'firebase/auth';
import { auth } from '../lib/firebase';
import {
  addCategory,
  addLink,
  createCategories,
  deleteCategory,
  deleteLink,
  importLinks,
  moveLinks,
  recordVisit,
  saveThumb,
  setAutoGroup,
  updateCategory,
  updateLink,
  useUserData,
} from '../lib/data';
import type { Category, LinkItem } from '../lib/types';
import { CATEGORY_COLORS, DRAG_FOLDER, DRAG_LINK, dragState } from '../lib/types';
import { planGrouping } from '../lib/grouping';
import { ancestorsOf, flattenTree, totalsOf, withDescendants } from '../lib/tree';
import { fetchThumb, isValidThumb } from '../lib/thumb';
import { cleanItems, download, parseQuick, fetchTitle, hostOf, normalizeUrl, pool, urlKey } from '../lib/utils';
import { CategoryModal } from './CategoryModal';
import { Icon } from './Icon';
import { ImportModal } from './ImportModal';
import { LinkCard } from './LinkCard';
import { LinkModal, type LinkDraft } from './LinkModal';
import { SettingsModal } from './SettingsModal';
import { ExtensionModal } from './ExtensionModal';
import { Sidebar, VIEW_ALL, VIEW_FAV, VIEW_HOME, VIEW_IMPORTANT, VIEW_INBOX, VIEW_LATER } from './Sidebar';
import { Home } from './Home';
import { FolderTile } from './FolderTile';

type LinkModalState =
  | { mode: 'new'; initial: Partial<LinkItem>; rid?: string; closeAfter?: boolean; thumb?: string }
  | { mode: 'edit'; initial: LinkItem }
  | null;

type ImportState = { items?: { url: string; title: string }[]; rid?: string; categoryId?: string; auto?: boolean; newFolder?: NewFolder } | null;

/** Gaveta nova pedida pela extensão, criada na hora de guardar */
type NewFolder = { name: string; parentId: string | null };

/** Pedido da extensão, tratado quando os dados carregam. edit = abrir o formulário em vez de guardar direto */
type AutoSave =
  | { kind: 'one'; url: string; title: string; categoryId?: string; rid?: string; closeAfter: boolean; thumb?: string; edit: boolean; newFolder?: NewFolder }
  | { kind: 'many'; items: { url: string; title: string }[]; categoryId?: string; rid?: string; newFolder?: NewFolder };

/** Telas que não são gavetas */
const FIXED_VIEWS = [VIEW_HOME, VIEW_ALL, VIEW_INBOX, VIEW_FAV, VIEW_LATER, VIEW_IMPORTANT];

function readNewFolder(name: unknown, parentId: unknown): NewFolder | undefined {
  if (typeof name !== 'string' || !name.trim()) return undefined;
  return { name: name.trim().slice(0, 40), parentId: typeof parentId === 'string' && parentId ? parentId : null };
}

/** "__inbox" = a pessoa escolheu a Caixa de entrada de propósito na extensão */
const INBOX_CHOICE = '__inbox';

/** Avisa a extensão (via content script) que um pedido foi gravado, para ela fechar as abas */
function notifyExtension(rid?: string) {
  if (rid) window.postMessage({ source: 'gaveta-app', type: 'saved', rid }, window.location.origin);
}

/** Lê o pacote de abas enviado pela extensão em /#gaveta=... */
function readHashPayload(): ImportState {
  if (!window.location.hash.startsWith('#gaveta=')) return null;
  try {
    const data = JSON.parse(decodeURIComponent(window.location.hash.slice('#gaveta='.length)));
    if (!Array.isArray(data.items)) return null;
    const items = data.items
      .filter((it: unknown): it is { url: string; title?: string } => typeof (it as { url?: unknown })?.url === 'string')
      .map((it: { url: string; title?: string }) => ({ url: it.url, title: typeof it.title === 'string' ? it.title : '' }));
    return {
      items,
      rid: typeof data.rid === 'string' ? data.rid : undefined,
      categoryId: typeof data.categoryId === 'string' ? data.categoryId : undefined,
      auto: data.auto === true,
      newFolder: readNewFolder(data.newFolder?.name, data.newFolder?.parentId),
    };
  } catch {
    return null;
  }
}

export function Dashboard({ user }: { user: User }) {
  const uid = user.uid;
  const { categories, links, autoGroup, loading, error } = useUserData(uid);

  const [view, setView] = useState(VIEW_HOME);
  const [search, setSearch] = useState('');
  const [quick, setQuick] = useState('');
  const [quickBusy, setQuickBusy] = useState(false);
  const quickRef = useRef<HTMLTextAreaElement>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [linkModal, setLinkModal] = useState<LinkModalState>(null);
  const [catModal, setCatModal] = useState<Category | 'new' | null>(null);
  const [newParentId, setNewParentId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<ReadonlySet<string>>(new Set());
  const [importState, setImportState] = useState<ImportState>(null);
  const [autoSave, setAutoSave] = useState<AutoSave | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [extOpen, setExtOpen] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [toast, setToast] = useState<{ msg: string; id: number } | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const linksRef = useRef(links);
  linksRef.current = links;

  const showToast = useCallback((msg: string) => setToast({ msg, id: Date.now() }), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const catOf = useCallback((l: LinkItem) => (l.categoryId ? catById.get(l.categoryId) ?? null : null), [catById]);
  // Nome das gavetas recém-criadas, antes de chegarem pela sincronização
  const freshLabels = useRef(new Map<string, string>());
  const catLabel = (id: string | null) => {
    const c = id ? catById.get(id) : null;
    return c ? `${c.emoji} ${c.name}` : (id && freshLabels.current.get(id)) || 'Caixa de entrada';
  };

  /** Cria uma gaveta na hora (ou reaproveita uma com o mesmo nome no mesmo lugar) */
  function createFolder(name: string, parentId: string | null): string {
    const parent = parentId && catById.has(parentId) ? parentId : null;
    const same = categories.find((c) => (c.parentId ?? null) === parent && c.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (same) return same.id;
    const now = Date.now();
    const color = CATEGORY_COLORS[Math.floor(Math.random() * CATEGORY_COLORS.length)];
    const id = addCategory(uid, { name: name.trim(), emoji: '📁', color, parentId: parent, order: now, createdAt: now });
    freshLabels.current.set(id, `📁 ${name.trim()}`);
    showToast(`Gaveta "${name.trim()}" criada`);
    return id;
  }

  const currentCategory = catById.get(view) ?? null;
  const isSearching = search.trim().length > 0;

  // Se a gaveta aberta for excluída, volta para "Tudo".
  // Gavetas recém-criadas ainda não chegaram na lista: essas não contam como excluídas.
  const justCreated = useRef(new Set<string>());
  useEffect(() => {
    if (catById.has(view)) justCreated.current.delete(view);
    else if (!loading && !FIXED_VIEWS.includes(view) && !justCreated.current.has(view)) setView(VIEW_HOME);
  }, [view, catById, loading]);

  // Abertura via bookmarklet/extensão: /?add=URL&title=TÍTULO[&rid=ID&popup=1]
  // ou várias abas da extensão: /#gaveta={rid, items}
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const add = p.get('add');
    const fromHash = readHashPayload();
    // Print da aba tirado pela extensão: /?add=...#thumb=data:image/jpeg;base64,...
    const shot = window.location.hash.startsWith('#thumb=') ? decodeURIComponent(window.location.hash.slice('#thumb='.length)) : null;
    const chosen = p.get('cat') ?? undefined;
    const newFolder = readNewFolder(p.get('newName'), p.get('newParent'));
    if (add && (p.get('auto') === '1' || newFolder)) {
      setAutoSave({
        kind: 'one',
        url: add,
        title: p.get('title') ?? '',
        categoryId: chosen,
        rid: p.get('rid') ?? undefined,
        closeAfter: p.get('popup') === '1' || Boolean(window.opener),
        thumb: isValidThumb(shot) ? shot : undefined,
        edit: p.get('auto') !== '1',
        newFolder,
      });
    } else if (add) {
      setLinkModal({
        mode: 'new',
        initial: { url: add, title: p.get('title') ?? '', categoryId: chosen && chosen !== INBOX_CHOICE ? chosen : null },
        rid: p.get('rid') ?? undefined,
        closeAfter: p.get('popup') === '1' || Boolean(window.opener),
        thumb: isValidThumb(shot) ? shot : undefined,
      });
    } else if (fromHash?.auto && fromHash.items) {
      setAutoSave({ kind: 'many', items: fromHash.items, categoryId: fromHash.categoryId, rid: fromHash.rid, newFolder: fromHash.newFolder });
    } else if (fromHash) {
      setImportState(fromHash);
    }
    if (add || window.location.hash) window.history.replaceState(null, '', window.location.pathname);
  }, []);

  // Atalhos: "/" busca, "n" novo link
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'n') {
        e.preventDefault();
        setLinkModal({ mode: 'new', initial: { categoryId: currentCategory?.id ?? null } });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentCategory]);

  const counts = useMemo(() => {
    const byCat = new Map<string, number>();
    let inbox = 0;
    let fav = 0;
    let later = 0;
    let important = 0;
    for (const l of links) {
      if (l.later) later++;
      if (l.important) important++;
      const c = l.categoryId && catById.has(l.categoryId) ? l.categoryId : null;
      if (c) byCat.set(c, (byCat.get(c) ?? 0) + 1);
      else inbox++;
      if (l.favorite) fav++;
    }
    return { total: links.length, inbox, fav, later, important, byCat };
  }, [links, catById]);

  const existingKeys = useMemo(() => new Set(links.map((l) => urlKey(l.url))), [links]);

  const quickUrls = useMemo(() => parseQuick(quick), [quick]);
  const quickCount = quickUrls.length;
  const quickDupes = useMemo(() => quickUrls.filter((u) => existingKeys.has(urlKey(u))).length, [quickUrls, existingKeys]);

  // Manda a lista de gavetas para a extensão mostrar no seletor dela
  useEffect(() => {
    if (loading) return;
    const items = flattenTree(categories).map(({ category: c, depth }) => ({ id: c.id, name: c.name, emoji: c.emoji, depth, parentId: c.parentId ?? null }));
    window.postMessage({ source: 'gaveta-app', type: 'categories', autoGroup, items }, window.location.origin);
  }, [categories, autoGroup, loading]);

  const visible = useMemo(() => {
    const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
    const list = links.filter((l) => {
      if (terms.length) {
        const c = catOf(l);
        const hay = `${l.title} ${l.url} ${l.note} ${c?.name ?? ''}`.toLowerCase();
        return terms.every((t) => hay.includes(t));
      }
      if (view === VIEW_ALL) return true;
      if (view === VIEW_FAV) return l.favorite;
      if (view === VIEW_LATER) return Boolean(l.later);
      if (view === VIEW_IMPORTANT) return Boolean(l.important);
      if (view === VIEW_HOME) return false; // o Início tem layout próprio
      const c = catOf(l);
      return view === VIEW_INBOX ? c === null : c?.id === view;
    });
    // Favoritos primeiro dentro de cada gaveta
    if (!terms.length && view !== VIEW_FAV) list.sort((a, b) => Number(b.favorite) - Number(a.favorite));
    return list;
  }, [links, search, view, catOf]);

  /** Busca o título em segundo plano, sem sobrescrever se o usuário já editou */
  function fillTitle(id: string, url: string) {
    return fetchTitle(url).then((t) => {
      const current = linksRef.current.find((l) => l.id === id);
      if (t && (!current || current.title === hostOf(url))) void updateLink(uid, id, { title: t });
    });
  }

  /** Guarda a miniatura do momento em que o link foi salvo */
  async function storeThumb(id: string, url: string, ready?: string) {
    try {
      const data = ready ?? (await fetchThumb(url));
      if (data) await saveThumb(uid, id, data);
    } catch {
      /* sem miniatura: o card mostra o ícone do site */
    }
  }

  /** Só roda quando a pessoa clica no ícone. Se não achar imagem nova, mantém a atual. */
  async function refreshThumb(l: LinkItem) {
    if (l.hasThumb && !confirm('Trocar a miniatura guardada pela imagem atual do site? A anterior será perdida.')) return;
    setRefreshing((s) => new Set(s).add(l.id));
    try {
      const data = await fetchThumb(l.url);
      if (!data) {
        showToast(l.hasThumb ? 'O site não tem imagem disponível. A miniatura atual foi mantida.' : 'O site não tem imagem disponível.');
        return;
      }
      await saveThumb(uid, l.id, data);
      showToast('Miniatura atualizada');
    } catch (e) {
      showToast('Não deu pra salvar: ' + (e as Error).message);
    } finally {
      setRefreshing((s) => {
        const next = new Set(s);
        next.delete(l.id);
        return next;
      });
    }
  }

  function openNewCategory(parentId?: string) {
    setNewParentId(parentId ?? null);
    setCatModal('new');
  }

  function findDuplicate(url: string, exceptId?: string) {
    const key = urlKey(url);
    return links.find((l) => l.id !== exceptId && urlKey(l.url) === key);
  }

  type SaveResult = { error: string; duplicate?: boolean } | { error: null; saved: Promise<void> };

  /** keepInbox: a pessoa escolheu a Caixa de entrada de propósito (soltou o link nela) */
  function saveNew(rawUrl: string, title: string, note: string, categoryId: string | null, keepInbox = false, thumb?: string): SaveResult {
    if (loading) return { error: 'Ainda carregando seus dados. Tente de novo em um instante.' };
    const url = normalizeUrl(rawUrl);
    if (!url) return { error: 'Esse link não parece válido.' };
    const dup = findDuplicate(url);
    if (dup) return { error: `Esse link já está guardado em ${catLabel(catOf(dup)?.id ?? null)}.`, duplicate: true };
    let target = categoryId;
    let label = catLabel(categoryId);
    if (categoryId === null && autoGroup && !keepInbox) {
      const plan = planGrouping([url], categories);
      target = plan.categoryIds[0];
      const group = [...plan.newCategories, ...categories].find((c) => c.id === target);
      if (group) label = `${group.emoji} ${group.name}`;
      if (plan.newCategories.length) void createCategories(uid, plan.newCategories);
    }
    const { id, saved } = addLink(uid, { url, title: title || hostOf(url), note, categoryId: target, favorite: false, createdAt: Date.now() });
    // A janelinha da extensão só fecha depois de título e miniatura estarem gravados
    const extras = [storeThumb(id, url, thumb), title ? null : fillTitle(id, url)];
    showToast(`Guardado em ${label}`);
    return { error: null, saved: saved.then(() => Promise.all(extras)).then(() => undefined) };
  }

  function setQuickText(value: string) {
    setQuick(value);
    // Cresce junto com o texto, até umas 8 linhas
    const el = quickRef.current;
    if (el) {
      el.style.height = 'auto';
      if (value) el.style.height = Math.min(el.scrollHeight, 200) + 'px';
    }
  }

  async function quickAdd(e: FormEvent) {
    e.preventDefault();
    if (!quick.trim() || quickBusy) return;
    const urls = parseQuick(quick);
    if (!urls.length) return showToast('Nenhum link válido encontrado.');

    if (urls.length === 1) {
      const res = saveNew(urls[0], '', '', currentCategory?.id ?? null);
      if (res.error) showToast(res.error);
      else setQuickText('');
      return;
    }

    if (loading) return showToast('Ainda carregando seus dados. Tente de novo em um instante.');
    const fresh = urls.filter((url) => !existingKeys.has(urlKey(url))).map((url) => ({ url, title: '' }));
    const dupes = urls.length - fresh.length;
    setQuickBusy(true);
    try {
      await handleImport(fresh, currentCategory?.id ?? null);
      if (dupes && fresh.length) showToast(`${fresh.length} links guardados · ${dupes} já estavam guardados`);
      setQuickText('');
    } catch (err) {
      showToast('Não deu pra guardar: ' + (err as Error).message);
    } finally {
      setQuickBusy(false);
    }
  }

  // Guarda direto o que a extensão mandou, assim que os dados carregarem
  useEffect(() => {
    if (loading || !autoSave) return;
    setAutoSave(null);
    const created = autoSave.newFolder ? createFolder(autoSave.newFolder.name, autoSave.newFolder.parentId) : null;
    const keepInbox = !created && autoSave.categoryId === INBOX_CHOICE;
    const known = created ?? (autoSave.categoryId && catById.has(autoSave.categoryId) ? autoSave.categoryId : null);
    if (autoSave.categoryId && !created && !keepInbox && !known) showToast('A gaveta escolhida não existe mais. Usando o padrão.');

    if (autoSave.kind === 'one' && autoSave.edit) {
      setLinkModal({ mode: 'new', initial: { url: autoSave.url, title: autoSave.title, categoryId: known }, rid: autoSave.rid, closeAfter: autoSave.closeAfter, thumb: autoSave.thumb });
      return;
    }

    if (autoSave.kind === 'one') {
      const res = saveNew(autoSave.url, autoSave.title, '', known, keepInbox, autoSave.thumb);
      if (res.error === null) finishExternal(res.saved, autoSave.rid, autoSave.closeAfter);
      else if (res.duplicate) {
        showToast(res.error);
        finishExternal(Promise.resolve(), autoSave.rid, autoSave.closeAfter);
      } else {
        // Não deu para guardar direto: abre o formulário para a pessoa ver o problema
        setLinkModal({ mode: 'new', initial: { url: autoSave.url, title: autoSave.title, categoryId: known }, rid: autoSave.rid, closeAfter: autoSave.closeAfter, thumb: autoSave.thumb });
      }
      return;
    }

    const fresh = cleanItems(autoSave.items).filter((it) => !existingKeys.has(urlKey(it.url)));
    handleImport(fresh, known, keepInbox)
      .then(() => notifyExtension(autoSave.rid))
      .catch(() => {
        // Se falhar, a lista continua na tela e nenhuma aba é fechada
        showToast('Não deu para guardar direto. Confira a lista e tente de novo.');
        setImportState({ items: autoSave.items, rid: autoSave.rid, categoryId: known ?? undefined });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, autoSave]);

  /** Depois de gravado no servidor: avisa a extensão e fecha a janelinha, se veio de uma */
  function finishExternal(saved: Promise<void>, rid?: string, closeAfter?: boolean) {
    saved
      .then(() => {
        notifyExtension(rid);
        if (closeAfter) setTimeout(() => window.close(), 600);
      })
      .catch((e: Error) => showToast('Erro ao gravar: ' + e.message));
  }

  function handleLinkSave(draft: LinkDraft): string | null {
    if (!linkModal) return null;
    if (linkModal.mode === 'new') {
      const res = saveNew(draft.url, draft.title, draft.note, draft.categoryId, false, linkModal.thumb);
      if (res.error === null) {
        finishExternal(res.saved, linkModal.rid, linkModal.closeAfter);
        setLinkModal(null);
        return null;
      }
      // Veio da extensão e já estava guardado: está seguro, pode fechar a aba
      if (res.duplicate && linkModal.rid) {
        showToast(res.error);
        finishExternal(Promise.resolve(), linkModal.rid, linkModal.closeAfter);
        setLinkModal(null);
        return null;
      }
      return res.error;
    }
    const url = normalizeUrl(draft.url);
    if (!url) return 'Esse link não parece válido.';
    const dup = findDuplicate(url, linkModal.initial.id);
    if (dup) return `Esse link já está guardado em ${catLabel(catOf(dup)?.id ?? null)}.`;
    void updateLink(uid, linkModal.initial.id, {
      url,
      title: draft.title || hostOf(url),
      note: draft.note,
      categoryId: draft.categoryId,
    });
    setLinkModal(null);
    return null;
  }

  async function handleImport(items: { url: string; title: string }[], categoryId: string | null, keepInbox = false) {
    if (!items.length) {
      showToast('Tudo isso já estava guardado');
      return;
    }
    const grouped = categoryId === null && autoGroup && !keepInbox;
    const plan = grouped ? planGrouping(items.map((it) => it.url), categories) : null;
    if (plan) await createCategories(uid, plan.newCategories);
    const now = Date.now();
    const ids = await importLinks(
      uid,
      items.map((it, i) => ({
        url: it.url,
        title: it.title || hostOf(it.url),
        note: '',
        categoryId: plan ? plan.categoryIds[i] : categoryId,
        favorite: false,
        createdAt: now - i, // mantém a ordem colada
      })),
    );
    showToast(grouped ? `${items.length} links agrupados por site` : `${items.length} links importados para ${catLabel(categoryId)}`);
    const missing = items.map((it, i) => ({ ...it, id: ids[i] })).filter((it) => !it.title);
    void pool(missing, 4, (it) => fillTitle(it.id, it.url));
    void pool(items.map((it, i) => ({ url: it.url, id: ids[i] })), 3, (it) => storeThumb(it.id, it.url));
  }

  function moveLink(linkId: string, categoryId: string | null) {
    const l = links.find((x) => x.id === linkId);
    if (!l || (catOf(l)?.id ?? null) === categoryId) return;
    void updateLink(uid, linkId, { categoryId });
    showToast(`Movido para ${catLabel(categoryId)}`);
  }

  /** Pode mover a gaveta para dentro de parentId (null = gaveta principal)? */
  function canNest(folderId: string | null, parentId: string | null): boolean {
    const folder = folderId ? catById.get(folderId) : undefined;
    if (!folder) return false;
    const current = folder.parentId && catById.has(folder.parentId) ? folder.parentId : null;
    if (current === parentId) return false; // já está lá
    if (parentId === null) return true;
    return catById.has(parentId) && !withDescendants(categories, folder.id).has(parentId);
  }

  function moveFolder(folderId: string, parentId: string | null) {
    if (!canNest(folderId, parentId)) return;
    const folder = catById.get(folderId)!;
    void updateCategory(uid, folderId, { parentId });
    showToast(parentId ? `"${folder.name}" agora está dentro de "${catById.get(parentId)!.name}"` : `"${folder.name}" virou gaveta principal`);
  }

  function dropUrl(raw: string, categoryId: string | null, keepInbox = false) {
    const res = saveNew(raw, '', '', categoryId, keepInbox);
    if (res.error) showToast(res.error);
  }

  /** Ao ativar, agrupa também o que já está na Caixa de entrada. Ao desativar, nada muda de lugar. */
  async function toggleAutoGroup(on: boolean) {
    try {
      await setAutoGroup(uid, on);
      if (!on) {
        showToast('Agrupamento automático desativado');
        return;
      }
      const inbox = links.filter((l) => catOf(l) === null);
      const plan = planGrouping(inbox.map((l) => l.url), categories);
      await createCategories(uid, plan.newCategories);
      const moves = inbox.flatMap((l, i) => {
        const categoryId = plan.categoryIds[i];
        return categoryId ? [{ id: l.id, categoryId }] : [];
      });
      await moveLinks(uid, moves);
      showToast(moves.length ? `${moves.length} links agrupados por site` : 'Agrupamento automático ativado');
    } catch (e) {
      showToast('Não deu pra salvar: ' + (e as Error).message);
    }
  }

  function removeLink(l: LinkItem) {
    if (!confirm(`Excluir "${l.title || hostOf(l.url)}"?`)) return;
    void deleteLink(uid, l.id);
    showToast('Link excluído');
  }

  function exportAll() {
    const data = {
      app: 'gaveta',
      exportedAt: new Date().toISOString(),
      categories,
      links,
    };
    download(`gaveta-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2));
  }

  const heading = isSearching
    ? { emoji: null, title: `Resultados para "${search.trim()}"` }
    : view === VIEW_ALL
      ? { emoji: null, title: 'Tudo' }
      : view === VIEW_INBOX
        ? { emoji: null, title: 'Caixa de entrada' }
        : view === VIEW_FAV
          ? { emoji: null, title: 'Favoritos' }
          : view === VIEW_LATER
            ? { emoji: null, title: 'Ver depois' }
            : view === VIEW_IMPORTANT
              ? { emoji: null, title: 'Importante' }
            : view === VIEW_HOME
              ? { emoji: null, title: 'Início' }
              : { emoji: currentCategory?.emoji, title: currentCategory?.name ?? '' };

  const inFolder = Boolean(currentCategory) && !isSearching;
  const ancestors = currentCategory ? ancestorsOf(categories, currentCategory.id) : [];
  const subfolders = currentCategory ? categories.filter((c) => c.parentId === currentCategory.id) : [];
  const totals = totalsOf(categories, counts.byCat);

  const showCategoryChip = isSearching || [VIEW_ALL, VIEW_FAV, VIEW_LATER, VIEW_IMPORTANT, VIEW_HOME].includes(view);
  const onHome = view === VIEW_HOME && !isSearching;

  const renderCard = (l: LinkItem) => (
    <LinkCard
      key={l.id}
      uid={uid}
      link={l}
      category={catOf(l)}
      showCategory={showCategoryChip}
      refreshing={refreshing.has(l.id)}
      onRefreshThumb={() => void refreshThumb(l)}
      onToggleFavorite={() => void updateLink(uid, l.id, { favorite: !l.favorite })}
      onToggleLater={() => void updateLink(uid, l.id, { later: !l.later })}
      onToggleImportant={() => void updateLink(uid, l.id, { important: !l.important })}
      onVisit={() => void recordVisit(uid, l.id)}
      onEdit={() => setLinkModal({ mode: 'edit', initial: l })}
      onDelete={() => removeLink(l)}
    />
  );

  return (
    <div className="app">
      <header className="topbar">
        <button className="icon-btn nav-toggle" onClick={() => setNavOpen(true)} aria-label="Abrir gavetas">
          <Icon name="menu" />
        </button>
        <div className="brand">
          <span className="logo-mark">
            <Icon name="logo" size={18} />
          </span>
          <span className="brand-name">Gaveta</span>
        </div>
        <div className="search">
          <Icon name="search" size={17} />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && (setSearch(''), e.currentTarget.blur())}
            placeholder="Buscar em tudo…"
            aria-label="Buscar"
          />
          {search ? (
            <button className="icon-btn sm" onClick={() => setSearch('')} aria-label="Limpar busca">
              <Icon name="x" size={15} />
            </button>
          ) : (
            <kbd>/</kbd>
          )}
        </div>
        <button className="avatar-btn" onClick={() => setSettingsOpen(true)} title="Configurações">
          {user.photoURL ? <img src={user.photoURL} alt="" className="avatar" referrerPolicy="no-referrer" /> : <span className="avatar" />}
        </button>
      </header>

      <div className="layout">
        <Sidebar
          categories={categories}
          counts={counts}
          view={isSearching ? '' : view}
          open={navOpen}
          onSelect={(v) => {
            setView(v);
            setSearch('');
            setNavOpen(false);
          }}
          onNewCategory={openNewCategory}
          onEditCategory={(c) => setCatModal(c)}
          onDropLink={moveLink}
          onDropUrl={(url, categoryId) => dropUrl(url, categoryId, categoryId === null)}
          onMoveFolder={moveFolder}
          canNest={canNest}
          onClose={() => setNavOpen(false)}
          onOpenExtension={() => {
            setNavOpen(false);
            setExtOpen(true);
          }}
        />

        <main
          className={'content' + (dropActive ? ' drop-active' : '')}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(DRAG_LINK) || !e.dataTransfer.types.includes('text/uri-list')) return;
            e.preventDefault();
            setDropActive(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropActive(false);
          }}
          onDrop={(e) => {
            setDropActive(false);
            if (e.dataTransfer.types.includes(DRAG_LINK)) return;
            const url = e.dataTransfer.getData('text/uri-list').split('\n').find((l) => l && !l.startsWith('#'));
            if (!url) return;
            e.preventDefault();
            dropUrl(url.trim(), currentCategory?.id ?? null);
          }}
        >
          <div className="content-head">
            {inFolder && ancestors.length > 0 && (
              <nav className="crumbs" aria-label="Caminho">
                {ancestors.map((a) => (
                  <Fragment key={a.id}>
                    <button
                      onClick={() => setView(a.id)}
                      onDragOver={(e) => {
                        if (e.dataTransfer.types.includes(DRAG_FOLDER) && canNest(dragState.folderId, a.id)) {
                          e.preventDefault();
                          e.currentTarget.classList.add('drop-over');
                        }
                      }}
                      onDragLeave={(e) => e.currentTarget.classList.remove('drop-over')}
                      onDrop={(e) => {
                        e.currentTarget.classList.remove('drop-over');
                        const folderId = e.dataTransfer.getData(DRAG_FOLDER);
                        if (!folderId) return;
                        e.preventDefault();
                        moveFolder(folderId, a.id);
                      }}
                    >
                      {a.name}
                    </button>
                    <span aria-hidden="true">/</span>
                  </Fragment>
                ))}
              </nav>
            )}
            <div className="content-title">
              {heading.emoji && (
                <span className="title-emoji" style={{ background: (currentCategory?.color ?? '#888') + '26' }}>
                  {heading.emoji}
                </span>
              )}
              <h1>{heading.title}</h1>
              {!onHome && <span className="title-count">{visible.length}</span>}
              {currentCategory && !isSearching && (
                <button className="icon-btn sm" onClick={() => setCatModal(currentCategory)} title="Editar gaveta">
                  <Icon name="edit" size={14} />
                </button>
              )}
            </div>

            <form className="quick-add" onSubmit={quickAdd}>
              <textarea
                ref={quickRef}
                rows={1}
                value={quick}
                onChange={(e) => setQuickText(e.target.value)}
                onKeyDown={(e) => {
                  // Enter guarda; Shift+Enter pula linha
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder={`Cole um ou vários links para guardar em ${currentCategory ? currentCategory.name : autoGroup ? 'a gaveta do site' : 'Caixa de entrada'}…`}
                aria-label="Novos links"
              />
              <button type="submit" className="btn primary" disabled={!quick.trim() || quickBusy}>
                <Icon name="plus" size={16} />{' '}
                <span className="hide-sm">{quickBusy ? 'Guardando…' : quickCount > 1 ? `Guardar ${quickCount}` : 'Guardar'}</span>
              </button>
              <button type="button" className="btn" onClick={() => setImportState({})} title="Importar vários links">
                <Icon name="upload" size={16} /> <span className="hide-sm">Importar</span>
              </button>
            </form>
            {quickCount > 1 && (
              <p className="quick-hint muted small">
                {quickCount} links
                {quickDupes > 0 && ` · ${quickDupes} já ${quickDupes === 1 ? 'guardado' : 'guardados'}`} · Enter guarda todos, Shift+Enter pula linha
              </p>
            )}
          </div>

          {error && <div className="banner error">Erro ao carregar dados: {error}</div>}

          {inFolder && currentCategory && (
            <div className="subfolders">
              {subfolders.map((c) => (
                <FolderTile
                  key={c.id}
                  category={c}
                  count={totals.get(c.id) ?? 0}
                  onOpen={() => setView(c.id)}
                  onMoveLink={moveLink}
                  onMoveFolder={moveFolder}
                  canNest={canNest}
                />
              ))}
              <button className="subfolder new" onClick={() => openNewCategory(currentCategory.id)}>
                <Icon name="plus" size={15} /> Nova subpasta
              </button>
            </div>
          )}

          {loading ? (
            <div className="grid">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="card skeleton" />
              ))}
            </div>
          ) : onHome ? (
            <Home
              categories={categories}
              links={links}
              totals={totals}
              renderCard={renderCard}
              onOpenView={(v) => {
                setView(v);
                setSearch('');
              }}
              onNewCategory={() => openNewCategory()}
              onVisit={(l) => void recordVisit(uid, l.id)}
              onMoveLink={moveLink}
              onMoveFolder={moveFolder}
              canNest={canNest}
            />
          ) : visible.length ? (
            <div className="grid">{visible.map(renderCard)}</div>
          ) : (
            <EmptyState
              searching={isSearching}
              view={view}
              hasAny={links.length > 0}
              onImport={() => setImportState({})}
              onNewCategory={() => openNewCategory()}
            />
          )}

          <div className="drop-hint">Solte para guardar o link</div>
        </main>
      </div>

      {linkModal && (
        <LinkModal
          autoGroup={autoGroup}
          onCreateCategory={createFolder}
          key={linkModal.mode + (linkModal.initial.id ?? '')}
          mode={linkModal.mode}
          initial={linkModal.initial}
          categories={categories}
          onSave={handleLinkSave}
          onClose={() => setLinkModal(null)}
        />
      )}

      {catModal && (
        <CategoryModal
          category={catModal === 'new' ? null : catModal}
          categories={categories}
          defaultParentId={newParentId}
          linkCount={catModal === 'new' ? 0 : counts.byCat.get(catModal.id) ?? 0}
          childCount={catModal === 'new' ? 0 : categories.filter((c) => c.parentId === catModal.id).length}
          onClose={() => setCatModal(null)}
          onSave={(data) => {
            if (catModal === 'new') {
              const id = addCategory(uid, { ...data, order: Date.now(), createdAt: Date.now() });
              // Subpasta: continua na gaveta atual, onde ela aparece. Gaveta principal: abre ela.
              if (!data.parentId) {
                justCreated.current.add(id);
                setView(id);
                setSearch('');
              }
            } else {
              void updateCategory(uid, catModal.id, data);
            }
            setCatModal(null);
          }}
          onDelete={() => {
            if (catModal === 'new') return;
            const ids = links.filter((l) => l.categoryId === catModal.id).map((l) => l.id);
            const childIds = categories.filter((c) => c.parentId === catModal.id).map((c) => c.id);
            const parentId = catModal.parentId && catById.has(catModal.parentId) ? catModal.parentId : null;
            void deleteCategory(uid, catModal.id, ids, childIds, parentId);
            showToast(`Gaveta "${catModal.name}" excluída`);
            setCatModal(null);
          }}
        />
      )}

      {importState && (
        <ImportModal
          autoGroup={autoGroup}
          onCreateCategory={createFolder}
          loading={loading}
          categories={categories}
          existingKeys={existingKeys}
          defaultCategoryId={importState.categoryId ?? currentCategory?.id ?? null}
          initialItems={importState.items}
          onImport={async (items, categoryId) => {
            await handleImport(items, categoryId);
            notifyExtension(importState.rid);
          }}
          onClose={() => setImportState(null)}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          user={user}
          autoGroup={autoGroup}
          inboxCount={counts.inbox}
          loading={loading}
          onToggleAutoGroup={(on) => void toggleAutoGroup(on)}
          onExport={exportAll}
          onSignOut={() => void signOut(auth)}
          onOpenExtension={() => {
            setSettingsOpen(false);
            setExtOpen(true);
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {extOpen && <ExtensionModal onClose={() => setExtOpen(false)} />}

      {toast && (
        <div className="toast" key={toast.id} role="status">
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function EmptyState({
  searching,
  view,
  hasAny,
  onImport,
  onNewCategory,
}: {
  searching: boolean;
  view: string;
  hasAny: boolean;
  onImport: () => void;
  onNewCategory: () => void;
}) {
  if (searching) {
    return (
      <div className="empty">
        <h2>Nada encontrado</h2>
        <p>Tente outras palavras — a busca olha título, link, nota e gaveta.</p>
      </div>
    );
  }
  if (!hasAny) {
    return (
      <div className="empty">
        <div className="empty-icon">
          <Icon name="logo" size={34} />
        </div>
        <h2>Sua gaveta está vazia</h2>
        <p>Cole um link acima, arraste um link de outra aba para cá, ou traga todas as suas abas de uma vez.</p>
        <div className="empty-actions">
          <button className="btn primary" onClick={onImport}>
            <Icon name="upload" size={16} /> Importar abas
          </button>
          <button className="btn" onClick={onNewCategory}>
            <Icon name="plus" size={16} /> Criar gaveta
          </button>
        </div>
      </div>
    );
  }
  const msg =
    view === VIEW_INBOX
      ? 'Caixa de entrada zerada. Tudo organizado!'
      : view === VIEW_FAV
        ? 'Nenhum favorito ainda. Clique na estrela de um card.'
        : view === VIEW_LATER
          ? 'Nada para ver depois. Clique no relógio de um card para marcar.'
          : view === VIEW_IMPORTANT
            ? 'Nada marcado como importante. Clique na bandeira de um card.'
        : 'Nenhum link nesta gaveta. Cole um acima ou arraste cards para cá pela barra lateral.';
  return (
    <div className="empty">
      <p>{msg}</p>
    </div>
  );
}
