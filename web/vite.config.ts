import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 127.0.0.1 by address: the server binds IPv4 loopback only (D-127),
      // and Node may resolve "localhost" to ::1 first.
      '/api': 'http://127.0.0.1:4600',
      '/ws': { target: 'ws://127.0.0.1:4600', ws: true },
    },
  },
});
