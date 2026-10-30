import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const api = process.env.API_URL || 'http://127.0.0.1:4000';

// Served under /admin/ so the backend can host it next to the customer app on one origin.
export default defineConfig({
  base: '/admin/',
  plugins: [react(), tailwindcss()],
  server: { port: 5174, proxy: { '/api': api, '/uploads': api } },
  preview: { port: 4174, proxy: { '/api': api, '/uploads': api } },
});
