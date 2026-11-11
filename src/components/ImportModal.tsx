import { useMemo, useState } from 'react';
import type { Category } from '../lib/types';
import { parseBulk, urlKey } from '../lib/utils';
import { Modal } from './Modal';

type Props = {
  categories: Category[];
  existingKeys: Set<string>;
  defaultCategoryId: string | null;
  onImport: (items: { url: string; title: string }[], categoryId: string | null) => Promise<void>;
  onClose: () => void;
};

export function ImportModal({ categories, existingKeys, defaultCategoryId, onImport, onClose }: Props) {
  const [text, setText] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(defaultCategoryId);
  const [busy, setBusy] = useState(false);

  const { fresh, dupes } = useMemo(() => {
    const parsed = parseBulk(text);
    const fresh = parsed.filter((p) => !existingKeys.has(urlKey(p.url)));
    return { fresh, dupes: parsed.length - fresh.length };
  }, [text, existingKeys]);

  async function run() {
    setBusy(true);
    try {
      await onImport(fresh, categoryId);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Importar vários links" onClose={onClose} width={620}>
      <div className="form">
        <p className="muted small">
          Cole uma lista de links — um por linha, texto solto ou exportação do <b>OneTab</b> (<code>url | título</code>). Dica: extensões como{' '}
          <b>Copy All URLs</b> copiam todas as abas abertas de uma vez.
        </p>
        <textarea
          className="mono"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder={'https://exemplo.com/artigo\nhttps://outro.site/video | Título do vídeo\n…'}
          autoFocus
        />
        <label>
          <span>Guardar em</span>
          <select value={categoryId ?? ''} onChange={(e) => setCategoryId(e.target.value || null)}>
            <option value="">📥 Caixa de entrada</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="form-actions">
          <span className="muted small push-left">
            {fresh.length} {fresh.length === 1 ? 'link novo' : 'links novos'}
            {dupes > 0 && ` · ${dupes} já ${dupes === 1 ? 'salvo' : 'salvos'} (ignorados)`}
          </span>
          <button className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={!fresh.length || busy} onClick={run}>
            {busy ? 'Importando…' : `Importar ${fresh.length || ''}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
