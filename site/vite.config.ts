import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** The pages: each is its own HTML file, so every address works on a static host. */
export const PAGES = ['index', 'results', 'gallery', 'method', 'briefs'] as const;

const entry = (page: string) =>
  fileURLToPath(new URL(page === 'index' ? 'index.html' : `${page}/index.html`, import.meta.url));

// The path the site is served under: "/" by default, "/First-Edit/" on GitHub Pages
// (the workflow sets SITE_BASE to the repository's name).
const raw = process.env.SITE_BASE ?? '/';
const base = `/${raw.replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: { input: Object.fromEntries(PAGES.map((page) => [page, entry(page)])) },
  },
});
