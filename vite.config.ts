import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Cross-origin isolation, so the multi-threaded engine can run (see public/_headers for the deployed equivalent).
const ISOLATION = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless' };

// `base: './'` makes the production build relocatable: it can be served from
// the root of a domain or from a sub-path (e.g. GitHub Pages) without changes.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (/react-chessboard|@dnd-kit/.test(id)) return 'board';
          if (/node_modules\/chess\.js/.test(id)) return 'chess';
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) return 'react';
          return undefined;
        },
      },
    },
  },
  server: { port: 5173, host: true, headers: ISOLATION },
  preview: { port: 4173, host: true, headers: ISOLATION },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',
    testTimeout: 90_000,
    hookTimeout: 60_000,
  },
});
