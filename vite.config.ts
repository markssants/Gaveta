import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Em dev, serve /api/title com a mesma função usada no Vercel
function devApi(): Plugin {
  return {
    name: 'gaveta-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/title', async (req, res) => {
        const { default: handler } = await import('./api/title.js');
        const query = Object.fromEntries(new URL(req.url ?? '', 'http://x').searchParams);
        const r = res as typeof res & { status: (c: number) => typeof r; json: (b: unknown) => void };
        r.status = (c) => { res.statusCode = c; return r; };
        r.json = (b) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(b)); };
        await handler({ query }, r);
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
