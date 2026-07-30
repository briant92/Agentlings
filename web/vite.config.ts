import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:4600',
      '/ws': { target: 'ws://localhost:4600', ws: true },
    },
  },
});
