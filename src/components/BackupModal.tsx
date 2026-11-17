import { useRef, useState } from 'react';
import { backupFilename, buildBackup, parseBackup, planRestore, type ParsedBackup, type RestorePlan } from '../lib/backup';
import { fetchAllThumbs, restoreData } from '../lib/data';
import type { Category, LinkItem } from '../lib/types';
import { download, relTime } from '../lib/utils';
import { Icon } from './Icon';
import { Modal } from './Modal';

type Props = {
  uid: string;
  categories: Category[];
  links: LinkItem[];
  autoGroup: boolean;
  lastBackup: number | null;
  onBackedUp: (at: number) => void;
  onRestored: (summary: string) => void;
  onClose: () => void;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function BackupModal({ uid, categories, links, autoGroup, lastBackup, onBackedUp, onRestored, onClose }: Props) {
  const [withThumbs, setWithThumbs] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [file, setFile] = useState<{ name: string; parsed: ParsedBackup; plan: RestorePlan } | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  async function save() {
    setBusy('Preparando o backup…');
    setMessage(null);
    try {
      const thumbs = withThumbs ? await fetchAllThumbs(uid) : undefined;
      const data = buildBackup({ categories, links, autoGroup, thumbs });
      download(backupFilename(), JSON.stringify(data), 'application/json');
      const at = Date.now();
      onBackedUp(at);
      const extra = thumbs ? `, ${plural(Object.keys(thumbs).length, 'miniatura', 'miniaturas')}` : '';
      setMessage({ kind: 'ok', text: `Backup salvo: ${plural(links.length, 'link', 'links')}, ${plural(categories.length, 'gaveta', 'gavetas')}${extra}. Procure o arquivo na pasta Downloads.` });
    } catch (e) {
      setMessage({ kind: 'error', text: 'Não deu pra gerar o backup: ' + (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function choose(selected: File | undefined) {
    setMessage(null);
    setFile(null);
    if (!selected) return;
    const parsed = parseBackup(await selected.text());
    if ('error' in parsed) return setMessage({ kind: 'error', text: parsed.error });
    setFile({ name: selected.name, parsed, plan: planRestore(parsed, { categories, links }) });
  }

  async function restore() {
    if (!file) return;
    setBusy('Restaurando…');
    setMessage(null);
    try {
      await restoreData(uid, file.plan, (done, total) => setBusy(`Restaurando… ${Math.round((done / total) * 100)}%`));
      const { plan } = file;
      onRestored(`Restaurado: ${plural(plan.links.length, 'link', 'links')} e ${plural(plan.categories.length, 'gaveta', 'gavetas')}`);
      onClose();
    } catch (e) {
      setMessage({ kind: 'error', text: 'Não deu pra restaurar: ' + (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const nothingNew = file && file.plan.links.length === 0 && file.plan.categories.length === 0;

  return (
    <Modal title="Backup" onClose={busy ? () => {} : onClose} width={540}>
      <div className="backup">
        <section>
          <h3>Salvar tudo em um arquivo</h3>
          <p className="muted small">
            Guarda todos os seus links, gavetas e subpastas, com marcas (favoritos, importante, ver depois) e as miniaturas. Você tem agora{' '}
            <b>{plural(links.length, 'link', 'links')}</b> e <b>{plural(categories.length, 'gaveta', 'gavetas')}</b>.
          </p>
          <label className="check">
            <input type="checkbox" checked={withThumbs} onChange={(e) => setWithThumbs(e.target.checked)} disabled={Boolean(busy)} /> Incluir miniaturas
            <span className="muted small"> (o arquivo fica maior)</span>
          </label>
          <button className="btn primary wide-sm" onClick={save} disabled={Boolean(busy)}>
            <Icon name="download" size={16} /> Baixar backup agora
          </button>
          <p className="muted small backup-last">{lastBackup ? `Último backup: ${relTime(lastBackup)}` : 'Você ainda não fez nenhum backup neste navegador.'}</p>
        </section>

        <hr />

        <section>
          <h3>Restaurar de um arquivo</h3>
          <p className="muted small">
            Escolha um arquivo de backup do Gaveta. Nada é apagado nem substituído: só voltam os links e gavetas que não estão aqui agora, cada um no seu lugar.
          </p>
          <input ref={picker} type="file" accept="application/json,.json" hidden onChange={(e) => void choose(e.target.files?.[0])} />
          <button className="btn" onClick={() => picker.current?.click()} disabled={Boolean(busy)}>
            <Icon name="upload" size={16} /> Escolher arquivo…
          </button>

          {file && (
            <div className="restore-preview">
              <strong>{file.name}</strong>
              <span className="muted small">
                {file.parsed.exportedAt ? `Feito em ${new Date(file.parsed.exportedAt).toLocaleString('pt-BR')} · ` : ''}
                {plural(file.parsed.links.length, 'link', 'links')}, {plural(file.parsed.categories.length, 'gaveta', 'gavetas')}
                {Object.keys(file.parsed.thumbs).length > 0 && `, ${plural(Object.keys(file.parsed.thumbs).length, 'miniatura', 'miniaturas')}`}
              </span>
              {nothingNew ? (
                <span className="small">Tudo que está nesse arquivo já está aqui. Não há nada para restaurar.</span>
              ) : (
                <span className="small">
                  Vão voltar <b>{plural(file.plan.links.length, 'link', 'links')}</b> e <b>{plural(file.plan.categories.length, 'gaveta', 'gavetas')}</b>
                  {file.plan.alreadyHere > 0 && ` (${file.plan.alreadyHere} já estavam aqui)`}.
                </span>
              )}
              {file.parsed.unreadable > 0 && <span className="muted small">{plural(file.parsed.unreadable, 'item do arquivo foi ignorado', 'itens do arquivo foram ignorados')} por estarem incompletos.</span>}
              {!nothingNew && (
                <button className="btn primary" onClick={restore} disabled={Boolean(busy)}>
                  Restaurar
                </button>
              )}
            </div>
          )}
        </section>

        {busy && <p className="backup-busy">{busy}</p>}
        {message && <p className={message.kind === 'ok' ? 'form-ok' : 'form-error'}>{message.text}</p>}
      </div>
    </Modal>
  );
}
