import { Fragment, useMemo, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react';
import type { Category } from '../lib/types';
import { DRAG_LINK } from '../lib/types';
import { ancestorsOf, buildTree, totalsOf } from '../lib/tree';
import { Favicon } from './Favicon';
import { Icon } from './Icon';

export const VIEW_ALL = '__all';
export const VIEW_INBOX = '__inbox';
export const VIEW_FAV = '__fav';
export const VIEW_HOME = '__home';
export const VIEW_LATER = '__later';
export const VIEW_IMPORTANT = '__important';

type Props = {
  categories: Category[];
  counts: { total: number; inbox: number; fav: number; later: number; important: number; byCat: Map<string, number> };
  view: string;
  open: boolean;
  onSelect: (view: string) => void;
  onNewCategory: (parentId?: string) => void;
  onEditCategory: (c: Category) => void;
  /** categoryId null = Caixa de entrada */
  onDropLink: (linkId: string, categoryId: string | null) => void;
  onDropUrl: (url: string, categoryId: string | null) => void;
  onClose: () => void;
  onOpenExtension: () => void;
};

export function Sidebar(p: Props) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const { roots, children } = useMemo(() => buildTree(p.categories), [p.categories]);
  const totals = useMemo(() => totalsOf(p.categories, p.counts.byCat), [p.categories, p.counts.byCat]);
  // A gaveta aberta fica sempre visível, mesmo dentro de uma pasta recolhida
  const openPath = useMemo(() => new Set(ancestorsOf(p.categories, p.view).map((c) => c.id)), [p.categories, p.view]);

  const manual = roots.filter((c) => !c.domain);
  // Sites com mais links primeiro
  const sites = roots
    .filter((c) => c.domain)
    .sort((a, b) => (totals.get(b.id) ?? 0) - (totals.get(a.id) ?? 0) || a.name.localeCompare(b.name));

  function toggle(id: string) {
    const next = new Set(collapsed);
    if (!next.delete(id)) next.add(id);
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
    } catch {
      /* sem armazenamento: vale só nesta sessão */
    }
  }

  function renderNode(c: Category, depth: number): ReactNode {
    const kids = children.get(c.id) ?? [];
    const expanded = !collapsed.has(c.id) || openPath.has(c.id);
    return (
      <Fragment key={c.id}>
        <NavItem
          active={p.view === c.id}
          onClick={() => p.onSelect(c.id)}
          icon={
            c.domain ? (
              <Favicon url={`https://${c.domain}`} size={18} />
            ) : (
              <span className="cat-emoji" style={{ background: c.color + '26' }}>{c.emoji}</span>
            )
          }
          label={c.name}
          count={totals.get(c.id) ?? 0}
          depth={depth}
          expanded={kids.length ? expanded : undefined}
          onToggle={() => toggle(c.id)}
          onEdit={() => p.onEditCategory(c)}
          onAddChild={() => p.onNewCategory(c.id)}
          dropTarget={c.id}
          onDropLink={p.onDropLink}
          onDropUrl={p.onDropUrl}
        />
        {expanded && kids.map((k) => renderNode(k, depth + 1))}
      </Fragment>
    );
  }

  return (
    <>
      <div className={'nav-scrim' + (p.open ? ' show' : '')} onClick={p.onClose} />
      <nav className={'sidebar' + (p.open ? ' open' : '')} aria-label="Gavetas">
        <div className="nav-group">
          <NavItem active={p.view === VIEW_HOME} onClick={() => p.onSelect(VIEW_HOME)} icon={<Icon name="home" size={17} />} label="Início" count={0} hideCount />
          <NavItem active={p.view === VIEW_ALL} onClick={() => p.onSelect(VIEW_ALL)} icon={<Icon name="layers" size={17} />} label="Tudo" count={p.counts.total} />
          <NavItem
            active={p.view === VIEW_INBOX}
            onClick={() => p.onSelect(VIEW_INBOX)}
            icon={<Icon name="inbox" size={17} />}
            label="Caixa de entrada"
            count={p.counts.inbox}
            dropTarget={null}
            onDropLink={p.onDropLink}
              onDropUrl={p.onDropUrl}
          />
          <NavItem active={p.view === VIEW_FAV} onClick={() => p.onSelect(VIEW_FAV)} icon={<Icon name="star" size={17} />} label="Favoritos" count={p.counts.fav} />
          <NavItem active={p.view === VIEW_LATER} onClick={() => p.onSelect(VIEW_LATER)} icon={<Icon name="clock" size={17} />} label="Ver depois" count={p.counts.later} />
          <NavItem active={p.view === VIEW_IMPORTANT} onClick={() => p.onSelect(VIEW_IMPORTANT)} icon={<Icon name="flag" size={17} />} label="Importante" count={p.counts.important} />
        </div>

        <div className="nav-heading">
          <span>Gavetas</span>
          <button className="icon-btn sm" onClick={() => p.onNewCategory()} title="Nova gaveta" aria-label="Nova gaveta">
            <Icon name="plus" size={16} />
          </button>
        </div>

        <div className="nav-group nav-cats">
          {manual.map((c) => renderNode(c, 0))}
          {manual.length === 0 && (
            <button className="nav-empty" onClick={() => p.onNewCategory()}>
              <Icon name="plus" size={15} /> Criar primeira gaveta
            </button>
          )}
        </div>

        {sites.length > 0 && (
          <>
            <div className="nav-heading">
              <span>Sites</span>
            </div>
            <div className="nav-group nav-cats">
              {sites.map((c) => renderNode(c, 0))}
            </div>
          </>
        )}
        <div className="nav-foot">
          <p className="nav-hint">Arraste um card para uma gaveta para mover.</p>
          <button className="nav-ext" onClick={p.onOpenExtension}>
            <Icon name="puzzle" size={16} /> Instalar extensão
          </button>
        </div>
      </nav>
    </>
  );
}

const COLLAPSED_KEY = 'gaveta-collapsed';

function readCollapsed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function NavItem({
  active,
  onClick,
  icon,
  label,
  count,
  hideCount,
  depth,
  expanded,
  onToggle,
  onEdit,
  onAddChild,
  dropTarget,
  onDropLink,
  onDropUrl,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  count: number;
  hideCount?: boolean;
  /** Presente nos itens da árvore de gavetas */
  depth?: number;
  /** undefined = não tem subpastas */
  expanded?: boolean;
  onToggle?: () => void;
  onEdit?: () => void;
  onAddChild?: () => void;
  dropTarget?: string | null;
  onDropLink?: Props['onDropLink'];
  onDropUrl?: Props['onDropUrl'];
}) {
  const [over, setOver] = useState(false);
  const droppable = dropTarget !== undefined;

  const accepts = (e: DragEvent) =>
    droppable && (e.dataTransfer.types.includes(DRAG_LINK) || e.dataTransfer.types.includes('text/uri-list'));

  return (
    <div
      className={'nav-item' + (active ? ' active' : '') + (over ? ' drop-over' : '') + (depth !== undefined ? ' tree' : '')}
      style={depth !== undefined ? ({ '--depth': depth } as CSSProperties) : undefined}
      onDragOver={(e) => {
        if (!accepts(e)) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!accepts(e)) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        const linkId = e.dataTransfer.getData(DRAG_LINK);
        if (linkId) onDropLink?.(linkId, dropTarget ?? null);
        else {
          const url = e.dataTransfer.getData('text/uri-list').split('\n').find((l) => l && !l.startsWith('#'));
          if (url) onDropUrl?.(url.trim(), dropTarget ?? null);
        }
      }}
    >
      {expanded !== undefined && (
        <button className={'nav-chevron' + (expanded ? ' open' : '')} onClick={onToggle} aria-expanded={expanded} aria-label={`${expanded ? 'Recolher' : 'Expandir'} ${label}`}>
          <Icon name="chevron" size={13} />
        </button>
      )}
      <button className="nav-btn" onClick={onClick}>
        <span className="nav-icon">{icon}</span>
        <span className="nav-label">{label}</span>
        {!hideCount && <span className="nav-count">{count}</span>}
      </button>
      {onEdit && (
        <div className="nav-actions">
          <button className="icon-btn sm" onClick={onAddChild} title={`Nova subpasta em ${label}`} aria-label={`Nova subpasta em ${label}`}>
            <Icon name="plus" size={14} />
          </button>
          <button className="icon-btn sm" onClick={onEdit} title={`Editar ${label}`} aria-label={`Editar ${label}`}>
            <Icon name="edit" size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
