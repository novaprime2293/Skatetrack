import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Skatetrack is a PWA. Deploy target is GitHub Pages at /Skatetrack/.
// Use HashRouter so the app works on any static host without server-side
// rewrite config (no need to know the base path at runtime).
//
// The base path is still useful for assets — set to ./ for relative paths
// so the same build works on GitHub Pages, Netlify, Cloudflare, etc.

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  server: {
    host: true,
    port: 5173,
  },
});
