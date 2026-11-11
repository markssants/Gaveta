import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Em dev, serve /api/* com as mesmas funções usadas no Vercel
function devApi(): Plugin {
  return {
    name: 'gaveta-dev-api',
    configureServer(server) {
      Object.assign(process.env, loadEnv(server.config.mode, process.cwd(), 'VITE_'));
      const routes = { '/api/title': () => import('./api/title.js'), '/api/thumb': () => import('./api/thumb.js') };
      for (const [path, load] of Object.entries(routes)) server.middlewares.use(path, async (req, res) => {
        const { default: handler } = await load();
        const query = Object.fromEntries(new URL(req.url ?? '', 'http://x').searchParams);
        const r = res as typeof res & { status: (c: number) => typeof r; json: (b: unknown) => void };
        r.status = (c) => { res.statusCode = c; return r; };
        r.json = (b) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(b)); };
        await handler({ query, headers: req.headers }, r);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devApi()],
  server: { port: 5180, strictPort: true },
  preview: { port: 5180, strictPort: true },
  build: { chunkSizeWarningLimit: 1000 },
});
