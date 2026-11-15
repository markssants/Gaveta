import { flattenTree } from '../lib/tree';
import type { Category } from '../lib/types';
import { Icon } from './Icon';

type Props = {
  count: number;
  total: number;
  categories: Category[];
  /** Todos os selecionados já têm a marca? Então o clique tira a marca de todos. */
  allFavorite: boolean;
  allImportant: boolean;
  allLater: boolean;
  onMove: (categoryId: string | null) => void;
  onToggle: (field: 'favorite' | 'important' | 'later') => void;
  onDelete: () => void;
  onSelectAll: () => void;
  onClear: () => void;
};

/** Barra que aparece embaixo quando há links selecionados */
export function SelectionBar(p: Props) {
  return (
    <div className="selection-bar" role="toolbar" aria-label="Ações para os links selecionados">
      <strong className="selection-count">
        {p.count} {p.count === 1 ? 'selecionado' : 'selecionados'}
      </strong>
      {p.count < p.total && (
        <button className="btn ghost sm" onClick={p.onSelectAll}>
          Selecionar todos ({p.total})
        </button>
      )}
      <span className="selection-sep" />
      <select
        className="selection-move"
        value=""
        aria-label="Mover para"
        onChange={(e) => {
          if (!e.target.value) return;
          p.onMove(e.target.value === '__inbox' ? null : e.target.value);
        }}
      >
        <option value="">Mover para…</option>
        <option value="__inbox">📥 Caixa de entrada</option>
        {flattenTree(p.categories).map(({ category: c, depth }) => (
          <option key={c.id} value={c.id}>
            {'   '.repeat(depth)}
            {c.emoji} {c.name}
          </option>
        ))}
      </select>
      <button className={'icon-btn' + (p.allLater ? ' later-on' : '')} onClick={() => p.onToggle('later')} title={p.allLater ? 'Tirar de Ver depois' : 'Marcar Ver depois'}>
        <Icon name="clock" size={17} />
      </button>
      <button className={'icon-btn' + (p.allImportant ? ' important-on' : '')} onClick={() => p.onToggle('important')} title={p.allImportant ? 'Tirar de Importante' : 'Marcar Importante'}>
        <Icon name="flag" size={16} filled={p.allImportant} />
      </button>
      <button className={'icon-btn' + (p.allFavorite ? ' fav-on' : '')} onClick={() => p.onToggle('favorite')} title={p.allFavorite ? 'Tirar dos favoritos' : 'Favoritar'}>
        <Icon name="star" size={17} filled={p.allFavorite} />
      </button>
      <button className="icon-btn danger" onClick={p.onDelete} title="Excluir selecionados">
        <Icon name="trash" size={17} />
      </button>
      <span className="selection-sep" />
      <button className="icon-btn" onClick={p.onClear} title="Limpar seleção (Esc)" aria-label="Limpar seleção">
        <Icon name="x" size={17} />
      </button>
    </div>
  );
}
