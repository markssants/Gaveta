import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
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
  setAutoGroup,
  updateCategory,
  updateLink,
  useUserData,
} from '../lib/data';
import type { Category, LinkItem } from '../lib/types';
import { DRAG_LINK } from '../lib/types';
import { planGrouping } from '../lib/grouping';
import { download, fetchTitle, hostOf, normalizeUrl, pool, urlKey } from '../lib/utils';
import { CategoryModal } from './CategoryModal';
import { Icon } from './Icon';
import { ImportModal } from './ImportModal';
import { LinkCard } from './LinkCard';
import { LinkModal, type LinkDraft } from './LinkModal';
import { SettingsModal } from './SettingsModal';
import { ExtensionModal } from './ExtensionModal';
import { Sidebar, VIEW_ALL, VIEW_FAV, VIEW_INBOX } from './Sidebar';

type LinkModalState =
  | { mode: 'new'; initial: Partial<LinkItem>; rid?: string; closeAfter?: boolean }
  | { mode: 'edit'; initial: LinkItem }
  | null;

type ImportState = { items?: { url: string; title: string }[]; rid?: string } | null;

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
    return { items, rid: typeof data.rid === 'string' ? data.rid : undefined };
  } catch {
    return null;
  }
}

export function Dashboard({ user }: { user: User }) {
  const uid = user.uid;
  const { categories, links, autoGroup, loading, error } = useUserData(uid);

  const [view, setView] = useState(VIEW_ALL);
  const [search, setSearch] = useState('');
  const [quick, setQuick] = useState('');
  const [navOpen, setNavOpen] = useState(false);
  const [linkModal, setLinkModal] = useState<LinkModalState>(null);
  const [catModal, setCatModal] = useState<Category | 'new' | null>(null);
  const [importState, setImportState] = useState<ImportState>(null);
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
  const catLabel = (id: string | null) => {
    const c = id ? catById.get(id) : null;
    return c ? `${c.emoji} ${c.name}` : 'Caixa de entrada';
  };

  const currentCategory = catById.get(view) ?? null;
  const isSearching = search.trim().length > 0;

  // Se a gaveta aberta for excluída, volta para "Tudo"
  useEffect(() => {
    if (!loading && ![VIEW_ALL, VIEW_INBOX, VIEW_FAV].includes(view) && !catById.has(view)) setView(VIEW_ALL);
  }, [view, catById, loading]);

  // Abertura via bookmarklet/extensão: /?add=URL&title=TÍTULO[&rid=ID&popup=1]
  // ou várias abas da extensão: /#gaveta={rid, items}
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const add = p.get('add');
    const fromHash = readHashPayload();
    if (add) {
      setLinkModal({
        mode: 'new',
        initial: { url: add, title: p.get('title') ?? '' },
        rid: p.get('rid') ?? undefined,
        closeAfter: p.get('popup') === '1' || Boolean(window.opener),
      });
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
    for (const l of links) {
      const c = l.categoryId && catById.has(l.categoryId) ? l.categoryId : null;
      if (c) byCat.set(c, (byCat.get(c) ?? 0) + 1);
      else inbox++;
      if (l.favorite) fav++;
    }
    return { total: links.length, inbox, fav, byCat };
  }, [links, catById]);

  const existingKeys = useMemo(() => new Set(links.map((l) => urlKey(l.url))), [links]);

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

  function findDuplicate(url: string, exceptId?: string) {
    const key = urlKey(url);
    return links.find((l) => l.id !== exceptId && urlKey(l.url) === key);
  }

  type SaveResult = { error: string; duplicate?: boolean } | { error: null; saved: Promise<void> };

  /** keepInbox: a pessoa escolheu a Caixa de entrada de propósito (soltou o link nela) */
  function saveNew(rawUrl: string, title: string, note: string, categoryId: string | null, keepInbox = false): SaveResult {
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
    if (!title) void fillTitle(id, url);
    showToast(`Guardado em ${label}`);
    return { error: null, saved };
  }

  function quickAdd(e: FormEvent) {
    e.preventDefault();
    if (!quick.trim()) return;
    const res = saveNew(quick, '', '', currentCategory?.id ?? null);
    if (res.error) showToast(res.error);
    else setQuick('');
  }

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
      const res = saveNew(draft.url, draft.title, draft.note, draft.categoryId);
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

  async function handleImport(items: { url: string; title: string }[], categoryId: string | null) {
    if (!items.length) {
      showToast('Tudo isso já estava guardado');
      return;
    }
    const grouped = categoryId === null && autoGroup;
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
  }

  function moveLink(linkId: string, categoryId: string | null) {
    const l = links.find((x) => x.id === linkId);
    if (!l || (catOf(l)?.id ?? null) === categoryId) return;
    void updateLink(uid, linkId, { categoryId });
    showToast(`Movido para ${catLabel(categoryId)}`);
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
          : { emoji: currentCategory?.emoji, title: currentCategory?.name ?? '' };

  const showCategoryChip = isSearching || view === VIEW_ALL || view === VIEW_FAV;

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
          onNewCategory={() => setCatModal('new')}
          onEditCategory={(c) => setCatModal(c)}
          onDropLink={moveLink}
          onDropUrl={(url, categoryId) => dropUrl(url, categoryId, categoryId === null)}
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
            <div className="content-title">
              {heading.emoji && (
                <span className="title-emoji" style={{ background: (currentCategory?.color ?? '#888') + '26' }}>
                  {heading.emoji}
                </span>
              )}
              <h1>{heading.title}</h1>
              <span className="title-count">{visible.length}</span>
              {currentCategory && !isSearching && (
                <button className="icon-btn sm" onClick={() => setCatModal(currentCategory)} title="Editar gaveta">
                  <Icon name="edit" size={14} />
                </button>
              )}
            </div>

            <form className="quick-add" onSubmit={quickAdd}>
              <input
                value={quick}
                onChange={(e) => setQuick(e.target.value)}
                placeholder={`Cole um link para guardar em ${currentCategory ? currentCategory.name : autoGroup ? 'a gaveta do site' : 'Caixa de entrada'}…`}
                aria-label="Novo link"
              />
              <button type="submit" className="btn primary" disabled={!quick.trim()}>
                <Icon name="plus" size={16} /> <span className="hide-sm">Guardar</span>
              </button>
              <button type="button" className="btn" onClick={() => setImportState({})} title="Importar vários links">
                <Icon name="upload" size={16} /> <span className="hide-sm">Importar</span>
              </button>
            </form>
          </div>

          {error && <div className="banner error">Erro ao carregar dados: {error}</div>}

          {loading ? (
            <div className="grid">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="card skeleton" />
              ))}
            </div>
          ) : visible.length ? (
            <div className="grid">
              {visible.map((l) => (
                <LinkCard
                  key={l.id}
                  link={l}
                  category={catOf(l)}
                  showCategory={showCategoryChip}
                  onToggleFavorite={() => void updateLink(uid, l.id, { favorite: !l.favorite })}
                  onEdit={() => setLinkModal({ mode: 'edit', initial: l })}
                  onDelete={() => removeLink(l)}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              searching={isSearching}
              view={view}
              hasAny={links.length > 0}
              onImport={() => setImportState({})}
              onNewCategory={() => setCatModal('new')}
            />
          )}

          <div className="drop-hint">Solte para guardar o link</div>
        </main>
      </div>

      {linkModal && (
        <LinkModal
          autoGroup={autoGroup}
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
          linkCount={catModal === 'new' ? 0 : counts.byCat.get(catModal.id) ?? 0}
          onClose={() => setCatModal(null)}
          onSave={(data) => {
            if (catModal === 'new') {
              const id = addCategory(uid, { ...data, order: Date.now(), createdAt: Date.now() });
              setView(id);
              setSearch('');
            } else {
              void updateCategory(uid, catModal.id, data);
            }
            setCatModal(null);
          }}
          onDelete={() => {
            if (catModal === 'new') return;
            const ids = links.filter((l) => l.categoryId === catModal.id).map((l) => l.id);
            void deleteCategory(uid, catModal.id, ids);
            showToast(`Gaveta "${catModal.name}" excluída`);
            setCatModal(null);
          }}
        />
      )}

      {importState && (
        <ImportModal
          autoGroup={autoGroup}
          loading={loading}
          categories={categories}
          existingKeys={existingKeys}
          defaultCategoryId={currentCategory?.id ?? null}
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
        : 'Nenhum link nesta gaveta. Cole um acima ou arraste cards para cá pela barra lateral.';
  return (
    <div className="empty">
      <p>{msg}</p>
    </div>
  );
}
