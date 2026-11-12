import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// briefs/ and candidates/ sit next to harness/, so the dev server must be
// allowed to read from the repo root.
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Candidate files have no node_modules above them. Resolve react from
    // harness/node_modules so every candidate shares one copy.
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    // Pre-bundle up front so a first run never reloads the page mid-render.
    include: ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom/client'],
  },
  server: {
    fs: { allow: [repoRoot] },
  },
});
