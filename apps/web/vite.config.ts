import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'node:path';

const API = process.env.KINKO_API || 'http://localhost:4000';
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode === 'demo' ? [viteSingleFile({ removeViteModuleLoader: true }), { name: 'kinko-demo-html', transformIndexHtml: (h: string) => h.replace(', viewport-fit=cover', '').replace(/<link rel="manifest"[^>]*>\n?/, '') }] : [])],
  resolve: { alias: { '@kinko/core': path.resolve(__dirname, '../../packages/core/src/index.ts'), '@': path.resolve(__dirname, 'src') } },
  server: { host: true, port: 5173, proxy: { '/api': API, '/uploads': API, '/socket.io': { target: API, ws: true } } },
  preview: { host: true, port: 4173, proxy: { '/api': API, '/uploads': API, '/socket.io': { target: API, ws: true } } },
  build: { outDir: mode === 'demo' ? 'dist-demo' : 'dist', chunkSizeWarningLimit: 4000, sourcemap: false, assetsInlineLimit: mode === 'demo' ? 100000000 : 4096 },
  define: { __DEMO__: JSON.stringify(mode === 'demo') },
}));
