import type { CSSProperties } from 'react';
import type { Category, LinkItem } from '../lib/types';
import { DRAG_LINK } from '../lib/types';
import { hostOf, relTime } from '../lib/utils';
import { Favicon } from './Favicon';
import { Icon } from './Icon';
import { Thumb } from './Thumb';

type Props = {
  uid: string;
  link: LinkItem;
  category: Category | null;
  showCategory: boolean;
  refreshing: boolean;
  onRefreshThumb: () => void;
  onToggleFavorite: () => void;
  onToggleLater: () => void;
  onToggleImportant: () => void;
  onVisit: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

export function LinkCard({ uid, link, category, showCategory, refreshing, onRefreshThumb, onToggleFavorite, onToggleLater, onToggleImportant, onVisit, onEdit, onDelete }: Props) {
  const host = hostOf(link.url);
  const style = category ? ({ '--cat': category.color } as CSSProperties) : undefined;

  return (
    <article
      className={'card' + (category ? ' has-cat' : '')}
      style={style}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_LINK, link.id);
        e.dataTransfer.effectAllowed = 'move';
        document.body.classList.add('dragging-link');
      }}
      onDragEnd={() => document.body.classList.remove('dragging-link')}
    >
      <a
        className="card-main"
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        draggable={false}
        onClick={onVisit}
        onAuxClick={(e) => e.button === 1 && onVisit()}
      >
        <Thumb uid={uid} link={link} />
        <div className="card-top">
          <Favicon url={link.url} />
          <span className="card-host">{host}</span>
        </div>
        <div className="card-text">
          <h3 className="card-title">{link.title || host}</h3>
          {link.note && <p className="card-note">{link.note}</p>}
        </div>
      </a>
      <button
        className={'icon-btn sm thumb-refresh' + (refreshing ? ' busy' : '')}
        onClick={onRefreshThumb}
        disabled={refreshing}
        title="Recarregar miniatura"
        aria-label="Recarregar miniatura"
      >
        <Icon name="refresh" size={15} />
      </button>
      <footer className="card-foot">
        {showCategory && (
          <span className="chip">
            {category ? (
              <>
                <span className="chip-dot" style={{ background: category.color }} />
                {category.emoji} {category.name}
              </>
            ) : (
              'Caixa de entrada'
            )}
          </span>
        )}
        <span className="card-time">{relTime(link.createdAt)}</span>
        <div className="card-actions">
          <button
            className={'icon-btn sm' + (link.later ? ' later-on is-on' : '')}
            onClick={onToggleLater}
            title={link.later ? 'Tirar de Ver depois' : 'Ver depois'}
            aria-pressed={Boolean(link.later)}
          >
            <Icon name="clock" size={16} />
          </button>
          <button
            className={'icon-btn sm' + (link.important ? ' important-on is-on' : '')}
            onClick={onToggleImportant}
            title={link.important ? 'Tirar de Importante' : 'Importante'}
            aria-pressed={Boolean(link.important)}
          >
            <Icon name="flag" size={15} filled={link.important} />
          </button>
          <button
            className={'icon-btn sm' + (link.favorite ? ' fav-on is-on' : '')}
            onClick={onToggleFavorite}
            title={link.favorite ? 'Tirar dos favoritos' : 'Favoritar'}
            aria-pressed={link.favorite}
          >
            <Icon name="star" size={16} filled={link.favorite} />
          </button>
          <button className="icon-btn sm" onClick={onEdit} title="Editar / mover">
            <Icon name="edit" size={15} />
          </button>
          <button className="icon-btn sm danger" onClick={onDelete} title="Excluir">
            <Icon name="trash" size={15} />
          </button>
        </div>
      </footer>
    </article>
  );
}
