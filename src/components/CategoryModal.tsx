import { useMemo, useState, type FormEvent } from 'react';
import { CATEGORY_COLORS, type Category } from '../lib/types';
import { flattenTree, withDescendants } from '../lib/tree';
import { Modal } from './Modal';

const EMOJIS = ['📁', '📚', '💻', '🎨', '🎬', '🎵', '🛒', '✈️', '🍳', '💡', '🧪', '📰', '💼', '🎮', '🏋️', '❤️'];

type Props = {
  category: Category | null;
  categories: Category[];
  /** Gaveta onde a nova vai ficar, quando criada de dentro de outra */
  defaultParentId: string | null;
  linkCount: number;
  childCount: number;
  onSave: (data: { name: string; emoji: string; color: string; parentId: string | null }) => void;
  onDelete: () => void;
  onClose: () => void;
};

export function CategoryModal({ category, categories, defaultParentId, linkCount, childCount, onSave, onDelete, onClose }: Props) {
  const [name, setName] = useState(category?.name ?? '');
  const [emoji, setEmoji] = useState(category?.emoji ?? '📁');
  const [color, setColor] = useState(category?.color ?? CATEGORY_COLORS[Math.floor(Math.random() * CATEGORY_COLORS.length)]);

  const [parentId, setParentId] = useState<string | null>(category ? category.parentId ?? null : defaultParentId);

  // Uma gaveta não pode ficar dentro dela mesma nem de uma subpasta sua
  const parents = useMemo(() => {
    const invalid = category ? withDescendants(categories, category.id) : new Set<string>();
    return flattenTree(categories).filter(({ category: c }) => !invalid.has(c.id));
  }, [categories, category]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim(), emoji: emoji.trim() || '📁', color, parentId });
  }

  return (
    <Modal title={category ? 'Editar gaveta' : defaultParentId ? 'Nova subpasta' : 'Nova gaveta'} onClose={onClose} width={420}>
      <form className="form" onSubmit={submit}>
        <div className="cat-preview" style={{ background: color + '22', borderColor: color + '66' }}>
          <span className="cat-preview-emoji">{emoji || '📁'}</span>
          <span>{name || 'Nome da gaveta'}</span>
        </div>
        <label>
          <span>Nome</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Estudar, Receitas, Trabalho" autoFocus required maxLength={40} />
        </label>
        <label>
          <span>Dentro de</span>
          <select value={parentId ?? ''} onChange={(e) => setParentId(e.target.value || null)}>
            <option value="">Nenhuma (gaveta principal)</option>
            {parents.map(({ category: c, depth }) => (
              <option key={c.id} value={c.id}>
                {'\u00A0\u00A0\u00A0'.repeat(depth)}
                {c.emoji} {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span>Ícone</span>
          <div className="emoji-grid">
            {EMOJIS.map((e) => (
              <button type="button" key={e} className={'emoji-opt' + (e === emoji ? ' on' : '')} onClick={() => setEmoji(e)}>
                {e}
              </button>
            ))}
            <input className="emoji-input" value={emoji} onChange={(e) => setEmoji([...e.target.value].slice(-2).join(''))} aria-label="Outro emoji" title="Ou digite qualquer emoji" />
          </div>
        </div>
        <div className="field">
          <span>Cor</span>
          <div className="color-row">
            {CATEGORY_COLORS.map((c) => (
              <button type="button" key={c} className={'color-opt' + (c === color ? ' on' : '')} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Cor ${c}`} />
            ))}
          </div>
        </div>
        <div className="form-actions">
          {category && (
            <button
              type="button"
              className="btn ghost danger push-left"
              onClick={() => {
                const parent = categories.find((c) => c.id === category.parentId);
                const moved = [linkCount && `${linkCount} link(s)`, childCount && `${childCount} subpasta(s)`].filter(Boolean).join(' e ');
                const place = parent ? `a gaveta "${parent.name}"` : 'o nível principal (links na Caixa de entrada)';
                const msg = moved ? `Excluir a gaveta "${category.name}"? Nada se perde: ${moved} vão para ${place}.` : `Excluir a gaveta "${category.name}"?`;
                if (confirm(msg)) onDelete();
              }}
            >
              Excluir
            </button>
          )}
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn primary">
            {category ? 'Salvar' : 'Criar gaveta'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
