import { useEffect, useRef } from 'react';
import type { User } from 'firebase/auth';
import { Icon } from './Icon';
import { Modal } from './Modal';

type Props = {
  user: User;
  onExport: () => void;
  onSignOut: () => void;
  onClose: () => void;
};

export function SettingsModal({ user, onExport, onSignOut, onClose }: Props) {
  const bmRef = useRef<HTMLAnchorElement>(null);

  // React bloqueia href="javascript:", então definimos direto no DOM
  useEffect(() => {
    const origin = window.location.origin;
    const code =
      `javascript:(()=>{window.open('${origin}/?add='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title),'gaveta','width=520,height=640')})()`;
    bmRef.current?.setAttribute('href', code);
  }, []);

  return (
    <Modal title="Sua gaveta" onClose={onClose} width={520}>
      <div className="settings">
        <div className="user-row">
          {user.photoURL ? <img src={user.photoURL} alt="" className="avatar lg" referrerPolicy="no-referrer" /> : <span className="avatar lg" />}
          <div>
            <strong>{user.displayName}</strong>
            <div className="muted small">{user.email}</div>
          </div>
        </div>

        <section>
          <h3>Botão "Guardar na Gaveta"</h3>
          <p className="muted small">
            Arraste o botão abaixo para a barra de favoritos do navegador. Em qualquer site, clique nele para guardar a página atual sem sair dela.
          </p>
          <a ref={bmRef} className="bookmarklet" onClick={(e) => e.preventDefault()} title="Arraste para a barra de favoritos">
            <Icon name="bookmark" size={16} /> Guardar na Gaveta
          </a>
        </section>

        <section>
          <h3>Dica para esvaziar as abas</h3>
          <p className="muted small">
            Copie todas as abas abertas (extensões <b>Copy All URLs</b> ou <b>OneTab</b>), clique em <b>Importar</b> e cole. Tudo cai na Caixa de entrada e
            você organiza depois com calma.
          </p>
        </section>

        <section>
          <h3>Backup</h3>
          <button className="btn" onClick={onExport}>
            <Icon name="download" size={16} /> Exportar tudo (JSON)
          </button>
        </section>

        <div className="form-actions">
          <button className="btn ghost danger push-left" onClick={onSignOut}>
            <Icon name="logout" size={16} /> Sair
          </button>
        </div>
      </div>
    </Modal>
  );
}
