import type { ReactNode } from 'react';
import { buildTree } from '../lib/tree';
import type { Category, LinkItem } from '../lib/types';
import { hostOf } from '../lib/utils';
import { Favicon } from './Favicon';
import { FolderTile } from './FolderTile';
import { Icon, type IconName } from './Icon';
import { Thumb } from './Thumb';
import { VIEW_FAV, VIEW_IMPORTANT, VIEW_LATER } from './Sidebar';

type Props = {
  categories: Category[];
  links: LinkItem[];
  totals: Map<string, number>;
  uid: string;
  /** Tira o link da lista da seção (a marca correspondente é desligada) */
  onUnmark: (link: LinkItem, mark: Mark) => void;
  onOpenView: (view: string) => void;
  onNewCategory: () => void;
  onVisit: (link: LinkItem) => void;
  onMoveLink: (linkId: string, categoryId: string) => void;
  onMoveFolder: (folderId: string, parentId: string) => void;
  canNest: (folderId: string | null, parentId: string) => boolean;
};

const MAX_SITES = 8;
const MAX_ROWS = 6;

type Mark = 'important' | 'later' | 'favorite';

export function Home({ categories, links, totals, uid, onUnmark, onOpenView, onNewCategory, onVisit, onMoveLink, onMoveFolder, canNest }: Props) {
  const { roots } = buildTree(categories);
  const nameOf = new Map(categories.map((c) => [c.id, c.name]));
  const row = (mark: Mark, label: string) => (l: LinkItem) => (
    <LinkRow key={l.id} uid={uid} link={l} place={l.categoryId ? nameOf.get(l.categoryId) : undefined} unmarkLabel={label} onVisit={() => onVisit(l)} onUnmark={() => onUnmark(l, mark)} />
  );
  const manual = roots.filter((c) => !c.domain);
  const sites = roots.filter((c) => c.domain).sort((a, b) => (totals.get(b.id) ?? 0) - (totals.get(a.id) ?? 0));

  const visited = links
    .filter((l) => (l.visits ?? 0) > 0)
    .sort((a, b) => (b.visits ?? 0) - (a.visits ?? 0) || (b.lastVisitedAt ?? 0) - (a.lastVisitedAt ?? 0))
    .slice(0, 8);
  const favorites = links.filter((l) => l.favorite);
  const later = links.filter((l) => l.later);
  const important = links.filter((l) => l.important);

  return (
    <div className="home">
      <Section icon="flag" title="Importante" count={important.length} onSeeAll={important.length > MAX_ROWS ? () => onOpenView(VIEW_IMPORTANT) : undefined}>
        {important.length ? (
          <div className="row-list">{important.slice(0, MAX_ROWS).map(row('important', 'Tirar de Importante'))}</div>
        ) : (
          <p className="home-empty">Marque um link com a bandeira para ele aparecer aqui.</p>
        )}
      </Section>

      <Section icon="clock" title="Ver depois" count={later.length} onSeeAll={later.length > MAX_ROWS ? () => onOpenView(VIEW_LATER) : undefined}>
        {later.length ? (
          <div className="row-list">{later.slice(0, MAX_ROWS).map(row('later', 'Tirar de Ver depois'))}</div>
        ) : (
          <p className="home-empty">Marque um link com o relógio para ele aparecer aqui.</p>
        )}
      </Section>

      <Section icon="star" title="Favoritos" count={favorites.length} onSeeAll={favorites.length > MAX_ROWS ? () => onOpenView(VIEW_FAV) : undefined}>
        {favorites.length ? (
          <div className="row-list">{favorites.slice(0, MAX_ROWS).map(row('favorite', 'Tirar dos favoritos'))}</div>
        ) : (
          <p className="home-empty">Clique na estrela de um card para favoritar.</p>
        )}
      </Section>

      <Section icon="external" title="Mais visitados">
        {visited.length ? (
          <ol className="top-list">
            {visited.map((l) => (
              <li key={l.id}>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => onVisit(l)}
                  onAuxClick={(e) => e.button === 1 && onVisit(l)}
                >
                  <Favicon url={l.url} size={18} />
                  <span className="top-title">{l.title || hostOf(l.url)}</span>
                  <span className="top-meta">
                    {hostOf(l.url)} · {l.visits}×
                  </span>
                </a>
              </li>
            ))}
          </ol>
        ) : (
          <p className="home-empty">Os links que você mais abrir pelo Gaveta aparecem aqui.</p>
        )}
      </Section>

      <Section icon="layers" title="Gavetas">
        <div className="subfolders">
          {[...manual, ...sites.slice(0, MAX_SITES)].map((c) => (
            <FolderTile
              key={c.id}
              category={c}
              count={totals.get(c.id) ?? 0}
              onOpen={() => onOpenView(c.id)}
              onMoveLink={onMoveLink}
              onMoveFolder={onMoveFolder}
              canNest={canNest}
            />
          ))}
          <button className="subfolder new" onClick={onNewCategory}>
            <Icon name="plus" size={15} /> Nova gaveta
          </button>
        </div>
        {sites.length > MAX_SITES && <p className="muted small home-note">Mais {sites.length - MAX_SITES} sites na barra lateral.</p>}
      </Section>
    </div>
  );
}

/** Linha compacta: miniatura pequena, título e site. Sem os botões do card completo. */
function LinkRow({
  uid,
  link,
  place,
  unmarkLabel,
  onVisit,
  onUnmark,
}: {
  uid: string;
  link: LinkItem;
  place?: string;
  unmarkLabel: string;
  onVisit: () => void;
  onUnmark: () => void;
}) {
  return (
    <div className="row">
      <a className="row-main" href={link.url} target="_blank" rel="noopener noreferrer" onClick={onVisit} onAuxClick={(e) => e.button === 1 && onVisit()}>
        <Thumb uid={uid} link={link} compact />
        <span className="row-text">
          <span className="row-title">{link.title || hostOf(link.url)}</span>
          <span className="row-meta">
            {hostOf(link.url)}
            {place && ` · ${place}`}
          </span>
        </span>
      </a>
      <button className="icon-btn sm row-x" onClick={onUnmark} title={unmarkLabel} aria-label={unmarkLabel}>
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}

function Section({
  icon,
  title,
  count,
  onSeeAll,
  children,
}: {
  icon: IconName;
  title: string;
  count?: number;
  onSeeAll?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="home-section">
      <header className="home-head">
        <span className="home-icon">
          <Icon name={icon} size={16} />
        </span>
        <h2>{title}</h2>
        {count !== undefined && count > 0 && <span className="title-count">{count}</span>}
        {onSeeAll && (
          <button className="home-all" onClick={onSeeAll}>
            Ver todos →
          </button>
        )}
      </header>
      {children}
    </section>
  );
}
