import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { firebaseConfigured } from './lib/config';
import './styles.css';

const root = createRoot(document.getElementById('root')!);

if (firebaseConfigured) {
  import('./App').then(({ default: App }) =>
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  );
} else {
  root.render(
    <main className="login">
      <div className="login-card">
        <h1>Gaveta</h1>
        <p className="login-tag">Falta configurar o Firebase.</p>
        <p className="muted small">
          Copie <code>.env.example</code> para <code>.env.local</code>, preencha com a configuração do seu app Web do Firebase e reinicie o{' '}
          <code>npm run dev</code>. No Vercel, adicione as mesmas variáveis em Settings → Environment Variables. Veja o README.
        </p>
      </div>
    </main>,
  );
}
