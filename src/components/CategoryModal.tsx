import { useState, type FormEvent } from 'react';
import { CATEGORY_COLORS, type Category } from '../lib/types';
import { Modal } from './Modal';

const EMOJIS = ['📁', '📚', '💻', '🎨', '🎬', '🎵', '🛒', '✈️', '🍳', '💡', '🧪', '📰', '💼', '🎮', '🏋️', '❤️'];

type Props = {
  category: Category | null;
  linkCount: number;
  onSave: (data: { name: string; emoji: string; color: string }) => void;
  onDelete: () => void;
  onClose: () => void;
};

export function CategoryModal({ category, linkCount, onSave, onDelete, onClose }: Props) {
  const [name, setName] = useState(category?.name ?? '');
  const [emoji, setEmoji] = useState(category?.emoji ?? '📁');
  const [color, setColor] = useState(category?.color ?? CATEGORY_COLORS[Math.floor(Math.random() * CATEGORY_COLORS.length)]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim(), emoji: emoji.trim() || '📁', color });
  }

  return (
    <Modal title={category ? 'Editar gaveta' : 'Nova gaveta'} onClose={onClose} width={420}>
      <form className="form" onSubmit={submit}>
        <div className="cat-preview" style={{ background: color + '22', borderColor: color + '66' }}>
          <span className="cat-preview-emoji">{emoji || '📁'}</span>
          <span>{name || 'Nome da gaveta'}</span>
        </div>
        <label>
          <span>Nome</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Estudar, Receitas, Trabalho" autoFocus required maxLength={40} />
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
                const msg = linkCount
                  ? `Excluir a gaveta "${category.name}"? Os ${linkCount} links dela vão para a Caixa de entrada.`
                  : `Excluir a gaveta "${category.name}"?`;
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
