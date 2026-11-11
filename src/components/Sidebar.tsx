import { useState, type DragEvent, type ReactNode } from 'react';
import type { Category } from '../lib/types';
import { DRAG_LINK } from '../lib/types';
import { Icon } from './Icon';

export const VIEW_ALL = '__all';
export const VIEW_INBOX = '__inbox';
export const VIEW_FAV = '__fav';

type Props = {
  categories: Category[];
  counts: { total: number; inbox: number; fav: number; byCat: Map<string, number> };
  view: string;
  open: boolean;
  onSelect: (view: string) => void;
  onNewCategory: () => void;
  onEditCategory: (c: Category) => void;
  /** categoryId null = Caixa de entrada */
  onDropLink: (linkId: string, categoryId: string | null) => void;
  onDropUrl: (url: string, categoryId: string | null) => void;
  onClose: () => void;
  onOpenExtension: () => void;
};

export function Sidebar(p: Props) {
  return (
    <>
      <div className={'nav-scrim' + (p.open ? ' show' : '')} onClick={p.onClose} />
      <nav className={'sidebar' + (p.open ? ' open' : '')} aria-label="Gavetas">
        <div className="nav-group">
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
        </div>

        <div className="nav-heading">
          <span>Gavetas</span>
          <button className="icon-btn sm" onClick={p.onNewCategory} title="Nova gaveta" aria-label="Nova gaveta">
            <Icon name="plus" size={16} />
          </button>
        </div>

        <div className="nav-group nav-cats">
          {p.categories.map((c) => (
            <NavItem
              key={c.id}
              active={p.view === c.id}
              onClick={() => p.onSelect(c.id)}
              icon={<span className="cat-emoji" style={{ background: c.color + '26' }}>{c.emoji}</span>}
              label={c.name}
              count={p.counts.byCat.get(c.id) ?? 0}
              onEdit={() => p.onEditCategory(c)}
              dropTarget={c.id}
              onDropLink={p.onDropLink}
              onDropUrl={p.onDropUrl}
            />
          ))}
          {p.categories.length === 0 && (
            <button className="nav-empty" onClick={p.onNewCategory}>
              <Icon name="plus" size={15} /> Criar primeira gaveta
            </button>
          )}
        </div>
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

function NavItem({
  active,
  onClick,
  icon,
  label,
  count,
  onEdit,
  dropTarget,
  onDropLink,
  onDropUrl,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  count: number;
  onEdit?: () => void;
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
      className={'nav-item' + (active ? ' active' : '') + (over ? ' drop-over' : '')}
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
      <button className="nav-btn" onClick={onClick}>
        <span className="nav-icon">{icon}</span>
        <span className="nav-label">{label}</span>
        <span className="nav-count">{count}</span>
      </button>
      {onEdit && (
        <button className="icon-btn sm nav-edit" onClick={onEdit} title={`Editar ${label}`} aria-label={`Editar ${label}`}>
          <Icon name="edit" size={13} />
        </button>
      )}
    </div>
  );
}
