import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const api = process.env.API_URL || 'http://127.0.0.1:4000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': api, '/uploads': api, '/manifest.webmanifest': api } },
  preview: { proxy: { '/api': api, '/uploads': api, '/manifest.webmanifest': api } },
});
