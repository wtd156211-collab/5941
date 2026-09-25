import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  root: 'src/client',
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': `http://localhost:${process.env.VITE_API_PORT ?? 8787}`,
    },
  },
});
