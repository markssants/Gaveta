import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { Modal } from './Modal';

type Info = { version: string };
type Browser = 'chromium' | 'firefox';

const isFirefox = typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent);
const isVivaldi = typeof navigator !== 'undefined' && /vivaldi/i.test(navigator.userAgent);

const EXT_PAGE: Record<string, string> = {
  vivaldi: 'vivaldi://extensions',
  edge: 'edge://extensions',
  brave: 'brave://extensions',
  opera: 'opera://extensions',
  chrome: 'chrome://extensions',
};

function chromiumExtPage() {
  const ua = navigator.userAgent;
  if (isVivaldi) return EXT_PAGE.vivaldi;
  if (/edg\//i.test(ua)) return EXT_PAGE.edge;
  if (/opr\//i.test(ua)) return EXT_PAGE.opera;
  if ((navigator as Navigator & { brave?: unknown }).brave) return EXT_PAGE.brave;
  return EXT_PAGE.chrome;
}

export function ExtensionModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Browser>(isFirefox ? 'firefox' : 'chromium');
  const [info, setInfo] = useState<Info | null>(null);

  useEffect(() => {
    fetch('/downloads/info.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  return (
    <Modal title="Extensão do navegador" onClose={onClose} width={560}>
      <div className="ext">
        <p className="muted">
          Guarde a aba atual ou <b>todas as abas da janela</b> com um clique e, se quiser, feche as abas depois que o Gaveta confirmar que gravou.
        </p>

        <div className="seg" role="tablist">
          <button role="tab" aria-selected={tab === 'chromium'} className={tab === 'chromium' ? 'on' : ''} onClick={() => setTab('chromium')}>
            Vivaldi, Chrome, Edge, Brave
          </button>
          <button role="tab" aria-selected={tab === 'firefox'} className={tab === 'firefox' ? 'on' : ''} onClick={() => setTab('firefox')}>
            Firefox
          </button>
        </div>

        {tab === 'chromium' ? <ChromiumSteps /> : <FirefoxSteps />}

        <p className="muted small ext-version">
          Nada passa por loja: a extensão é instalada direto deste site{info ? ` · versão ${info.version}` : ''}
        </p>
      </div>
    </Modal>
  );
}

function ChromiumSteps() {
  const page = chromiumExtPage();
  return (
    <ol className="steps">
      <li>
        <a className="btn primary" href="/downloads/gaveta-extension.zip" download>
          <Icon name="download" size={16} /> Baixar extensão (.zip)
        </a>
      </li>
      <li>
        <b>Descompacte</b> e guarde a pasta <code>gaveta-extension</code> num lugar fixo, por exemplo em Documentos.
        <span className="muted"> Se apagar a pasta, a extensão para de funcionar.</span>
      </li>
      <li>
        Abra esta página numa aba nova (o navegador não deixa abrir por link):
        <CopyField value={page} />
      </li>
      <li>
        Ative o <b>Modo do desenvolvedor</b>, clique em <b>Carregar sem compactação</b> e escolha a pasta <code>gaveta-extension</code>.
      </li>
      <ConfigStep />
    </ol>
  );
}

function FirefoxSteps() {
  const [mode, setMode] = useState<'permanent' | 'temporary'>('permanent');
  return (
    <>
      <div className="ff-modes">
        <label className={mode === 'permanent' ? 'on' : ''}>
          <input type="radio" checked={mode === 'permanent'} onChange={() => setMode('permanent')} />
          <span>
            <b>Firefox Developer Edition, Nightly ou ESR</b>
            <span className="muted small block">Fica instalada de vez.</span>
          </span>
        </label>
        <label className={mode === 'temporary' ? 'on' : ''}>
          <input type="radio" checked={mode === 'temporary'} onChange={() => setMode('temporary')} />
          <span>
            <b>Firefox comum</b>
            <span className="muted small block">Só modo temporário: some quando o Firefox fecha.</span>
          </span>
        </label>
      </div>

      {mode === 'permanent' ? (
        <ol className="steps">
          <li>
            Abra esta página numa aba nova, aceite o aviso e procure por <code>xpinstall.signatures.required</code>:
            <CopyField value="about:config" />
            Dê dois cliques para deixar como <b>false</b>. (Isso libera extensões que não passaram pela loja da Mozilla.)
          </li>
          <li>
            <a className="btn primary" href="/downloads/gaveta-firefox.xpi" download>
              <Icon name="download" size={16} /> Baixar extensão (.xpi)
            </a>
          </li>
          <li>
            Arraste o arquivo baixado para uma janela do Firefox e clique em <b>Adicionar</b>. Ou abra <code>about:addons</code> → engrenagem ⚙ →{' '}
            <b>Instalar extensão a partir de arquivo</b>.
          </li>
          <ConfigStep />
        </ol>
      ) : (
        <ol className="steps">
          <li>
            <a className="btn primary" href="/downloads/gaveta-firefox.xpi" download>
              <Icon name="download" size={16} /> Baixar extensão (.xpi)
            </a>
          </li>
          <li>
            Abra esta página numa aba nova:
            <CopyField value="about:debugging#/runtime/this-firefox" />
          </li>
          <li>
            Clique em <b>Carregar extensão temporária…</b> e escolha o arquivo <code>gaveta-firefox.xpi</code>.
            <span className="muted"> Toda vez que reabrir o Firefox, repita este passo.</span>
          </li>
          <ConfigStep />
        </ol>
      )}
    </>
  );
}

function ConfigStep() {
  return (
    <li>
      A extensão abre uma tela pedindo o endereço do Gaveta. Use este e clique em <b>Salvar</b> e depois em <b>Permitir</b>:
      <CopyField value={window.location.origin} />
    </li>
  );
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copy-field">
      <code>{value}</code>
      <button
        className="btn"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          } catch {
            /* sem permissão de área de transferência */
          }
        }}
      >
        {copied ? 'Copiado!' : 'Copiar'}
      </button>
    </div>
  );
}
