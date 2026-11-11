import type { CSSProperties } from 'react';
import type { Category, LinkItem } from '../lib/types';
import { DRAG_LINK } from '../lib/types';
import { hostOf, relTime } from '../lib/utils';
import { Favicon } from './Favicon';
import { Icon } from './Icon';

type Props = {
  link: LinkItem;
  category: Category | null;
  showCategory: boolean;
  onToggleFavorite: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

export function LinkCard({ link, category, showCategory, onToggleFavorite, onEdit, onDelete }: Props) {
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
      <a className="card-main" href={link.url} target="_blank" rel="noopener noreferrer" draggable={false}>
        <div className="card-top">
          <Favicon url={link.url} />
          <span className="card-host">{host}</span>
        </div>
        <h3 className="card-title">{link.title || host}</h3>
        {link.note && <p className="card-note">{link.note}</p>}
      </a>
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
            className={'icon-btn sm' + (link.favorite ? ' fav-on' : '')}
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
