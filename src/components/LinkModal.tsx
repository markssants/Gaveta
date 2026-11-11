import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Category, LinkItem } from '../lib/types';
import { flattenTree } from '../lib/tree';
import { fetchTitle, normalizeUrl } from '../lib/utils';
import { Modal } from './Modal';

export type LinkDraft = { url: string; title: string; note: string; categoryId: string | null };

type Props = {
  mode: 'new' | 'edit';
  initial: Partial<LinkItem>;
  categories: Category[];
  autoGroup: boolean;
  /** Retorna mensagem de erro, ou null se salvou */
  onSave: (draft: LinkDraft) => string | null;
  onClose: () => void;
};

export function LinkModal({ mode, initial, categories, autoGroup, onSave, onClose }: Props) {
  const [url, setUrl] = useState(initial.url ?? '');
  const [title, setTitle] = useState(initial.title ?? '');
  const [note, setNote] = useState(initial.note ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(initial.categoryId ?? null);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const titleTouched = useRef(Boolean(initial.title));

  // Busca o título automaticamente ao abrir com um link novo
  useEffect(() => {
    if (mode !== 'new' || titleTouched.current) return;
    const normalized = normalizeUrl(url);
    if (!normalized) return;
    let alive = true;
    setFetching(true);
    const t = setTimeout(async () => {
      const found = await fetchTitle(normalized);
      if (alive) {
        setFetching(false);
        if (found && !titleTouched.current) setTitle(found);
      }
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
      setFetching(false);
    };
  }, [url, mode]);

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(onSave({ url, title: title.trim(), note: note.trim(), categoryId }));
  }

  return (
    <Modal title={mode === 'new' ? 'Guardar link' : 'Editar link'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>
          <span>Link</span>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" autoFocus={!initial.url} required />
        </label>
        <label>
          <span>Título {fetching && <em className="muted">buscando…</em>}</span>
          <input
            value={title}
            onChange={(e) => {
              titleTouched.current = true;
              setTitle(e.target.value);
            }}
            placeholder="Deixe vazio para usar o título da página"
            autoFocus={Boolean(initial.url)}
          />
        </label>
        <label>
          <span>Gaveta</span>
          <select value={categoryId ?? ''} onChange={(e) => setCategoryId(e.target.value || null)}>
            <option value="">{autoGroup && mode === 'new' ? '✨ Automático (gaveta do site)' : '📥 Caixa de entrada'}</option>
            {flattenTree(categories).map(({ category: c, depth }) => (
              <option key={c.id} value={c.id}>
                {'\u00A0\u00A0\u00A0'.repeat(depth)}
                {c.emoji} {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Nota</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Por que guardou isso? (opcional)" />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn primary">
            {mode === 'new' ? 'Guardar' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
