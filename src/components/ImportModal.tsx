import { useMemo, useState } from 'react';
import type { Category } from '../lib/types';
import { cleanItems, hostOf, parseBulk, urlKey } from '../lib/utils';
import { Favicon } from './Favicon';
import { FolderPicker } from './FolderPicker';
import { Modal } from './Modal';

type Item = { url: string; title: string };

type Props = {
  categories: Category[];
  existingKeys: Set<string>;
  defaultCategoryId: string | null;
  autoGroup: boolean;
  loading: boolean;
  onCreateCategory: (name: string, parentId: string | null) => string;
  /** Abas enviadas pela extensão: mostra a lista em vez da caixa de texto */
  initialItems?: Item[];
  onImport: (items: Item[], categoryId: string | null) => Promise<void>;
  onClose: () => void;
};

export function ImportModal({ categories, existingKeys, defaultCategoryId, autoGroup, loading, onCreateCategory, initialItems, onImport, onClose }: Props) {
  const fromTabs = Boolean(initialItems);
  const [text, setText] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(defaultCategoryId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => (initialItems ? cleanItems(initialItems) : parseBulk(text)), [initialItems, text]);
  const fresh = useMemo(() => parsed.filter((p) => !existingKeys.has(urlKey(p.url))), [parsed, existingKeys]);
  const dupes = parsed.length - fresh.length;

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await onImport(fresh, categoryId);
      onClose();
    } catch (e) {
      setError('Não deu pra gravar: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const allSaved = fromTabs && parsed.length > 0 && fresh.length === 0;

  return (
    <Modal title={fromTabs ? `Guardar ${parsed.length} ${parsed.length === 1 ? 'aba' : 'abas'}` : 'Importar vários links'} onClose={onClose} width={620}>
      <div className="form">
        {fromTabs ? (
          <ul className="import-list">
            {parsed.map((it) => {
              const dup = existingKeys.has(urlKey(it.url));
              return (
                <li key={it.url} className={dup ? 'is-dup' : ''}>
                  <Favicon url={it.url} size={16} />
                  <span className="import-title">{it.title || hostOf(it.url)}</span>
                  {dup ? <span className="import-tag">já guardado</span> : <span className="import-host">{hostOf(it.url)}</span>}
                </li>
              );
            })}
          </ul>
        ) : (
          <>
            <p className="muted small">
              Cole uma lista de links: um por linha, texto solto ou a exportação do <b>OneTab</b> (<code>url | título</code>). Dica: a extensão do Gaveta
              guarda todas as abas abertas com um clique.
            </p>
            <textarea
              className="mono"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              placeholder={'https://exemplo.com/artigo\nhttps://outro.site/video | Título do vídeo\n…'}
              autoFocus
            />
          </>
        )}
        <FolderPicker
          label="Guardar em"
          categories={categories}
          value={categoryId}
          onChange={setCategoryId}
          emptyLabel={autoGroup ? '✨ Automático (gaveta de cada site)' : '📥 Caixa de entrada'}
          onCreate={onCreateCategory}
        />
        {error && <p className="form-error">{error}</p>}
        <div className="form-actions">
          <span className="muted small push-left">
            {fresh.length} {fresh.length === 1 ? 'link novo' : 'links novos'}
            {dupes > 0 && ` · ${dupes} já ${dupes === 1 ? 'guardado' : 'guardados'}`}
          </span>
          <button className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={(!fresh.length && !allSaved) || busy || loading} onClick={run}>
            {busy ? 'Guardando…' : allSaved ? 'Ok, já está tudo guardado' : `Guardar ${fresh.length || ''}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
