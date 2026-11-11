import { useState, type KeyboardEvent } from 'react';
import { flattenTree } from '../lib/tree';
import type { Category } from '../lib/types';
import { Icon } from './Icon';

type Props = {
  label: string;
  categories: Category[];
  value: string | null;
  onChange: (id: string | null) => void;
  /** Texto da opção vazia: Caixa de entrada ou Automático */
  emptyLabel: string;
  /** Cria a gaveta (ou reaproveita uma igual) e devolve o id */
  onCreate: (name: string, parentId: string | null) => string;
};

/** Seletor de gaveta com opção de criar uma nova ou uma subpasta na hora */
export function FolderPicker({ label, categories, value, onChange, emptyLabel, onCreate }: Props) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<string | null>(null);
  const tree = flattenTree(categories);

  const options = tree.map(({ category: c, depth }) => (
    <option key={c.id} value={c.id}>
      {'   '.repeat(depth)}
      {c.emoji} {c.name}
    </option>
  ));

  function create() {
    if (!name.trim()) return;
    onChange(onCreate(name.trim(), parentId));
    setName('');
    setCreating(false);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault(); // não envia o formulário de fora
      create();
    } else if (e.key === 'Escape') {
      e.stopPropagation(); // fecha só a criação, não o modal
      setCreating(false);
    }
  }

  return (
    <div className="field">
      <span>{label}</span>
      <div className="picker-row">
        <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} aria-label={label}>
          <option value="">{emptyLabel}</option>
          {options}
        </select>
        <button
          type="button"
          className={'btn' + (creating ? ' on' : '')}
          onClick={() => {
            // Já sugere criar dentro da gaveta selecionada
            setParentId(value);
            setCreating((v) => !v);
          }}
          aria-expanded={creating}
        >
          <Icon name="plus" size={15} /> Nova
        </button>
      </div>
      {creating && (
        <div className="new-folder">
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={onKey} placeholder="Nome da nova gaveta" maxLength={40} autoFocus aria-label="Nome da nova gaveta" />
          <select value={parentId ?? ''} onChange={(e) => setParentId(e.target.value || null)} aria-label="Criar dentro de">
            <option value="">Gaveta principal</option>
            {tree.map(({ category: c, depth }) => (
              <option key={c.id} value={c.id}>
                {'   '.repeat(depth)}
                Dentro de {c.emoji} {c.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn primary" disabled={!name.trim()} onClick={create}>
            Criar
          </button>
        </div>
      )}
    </div>
  );
}
