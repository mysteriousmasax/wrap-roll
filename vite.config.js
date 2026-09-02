import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    allowedHosts: true,
    fs: {
      allow: [process.cwd(), path.resolve(__dirname), fs.realpathSync(__dirname)],
    },
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/ws': { target: 'http://localhost:3000', ws: true, changeOrigin: true },
    },
  },
});
