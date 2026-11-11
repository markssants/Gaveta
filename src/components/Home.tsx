import type { ReactNode } from 'react';
import { buildTree } from '../lib/tree';
import type { Category, LinkItem } from '../lib/types';
import { hostOf } from '../lib/utils';
import { Favicon } from './Favicon';
import { FolderTile } from './FolderTile';
import { Icon, type IconName } from './Icon';
import { VIEW_FAV, VIEW_IMPORTANT, VIEW_LATER } from './Sidebar';

type Props = {
  categories: Category[];
  links: LinkItem[];
  totals: Map<string, number>;
  renderCard: (link: LinkItem) => ReactNode;
  onOpenView: (view: string) => void;
  onNewCategory: () => void;
  onVisit: (link: LinkItem) => void;
  onMoveLink: (linkId: string, categoryId: string) => void;
  onMoveFolder: (folderId: string, parentId: string) => void;
  canNest: (folderId: string | null, parentId: string) => boolean;
};

const MAX_SITES = 8;

export function Home({ categories, links, totals, renderCard, onOpenView, onNewCategory, onVisit, onMoveLink, onMoveFolder, canNest }: Props) {
  const { roots } = buildTree(categories);
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

      <Section icon="flag" title="Importante" count={important.length} onSeeAll={important.length > 8 ? () => onOpenView(VIEW_IMPORTANT) : undefined}>
        {important.length ? (
          <div className="grid">{important.slice(0, 8).map(renderCard)}</div>
        ) : (
          <p className="home-empty">Marque um link com a bandeira para ele aparecer aqui.</p>
        )}
      </Section>

      <Section icon="clock" title="Ver depois" count={later.length} onSeeAll={later.length > 8 ? () => onOpenView(VIEW_LATER) : undefined}>
        {later.length ? (
          <div className="grid">{later.slice(0, 8).map(renderCard)}</div>
        ) : (
          <p className="home-empty">Marque um link com o relógio para ele aparecer aqui.</p>
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

      <Section icon="star" title="Favoritos" count={favorites.length} onSeeAll={favorites.length > 4 ? () => onOpenView(VIEW_FAV) : undefined}>
        {favorites.length ? (
          <div className="grid">{favorites.slice(0, 4).map(renderCard)}</div>
        ) : (
          <p className="home-empty">Clique na estrela de um card para favoritar.</p>
        )}
      </Section>
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
