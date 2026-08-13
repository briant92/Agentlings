import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    // `tailscale serve` reaches this dev server on loopback and forwards the
    // tailnet hostname in Host, which Vite rejects unless it is allowed. The
    // leading dot covers any tailnet name, so nothing here needs updating if
    // it changes. Not a widening of the bind: the listener stays loopback and
    // the tailnet is what a phone has to be on to arrive at all.
    allowedHosts: ['.ts.net'],
    // Same trap as the proxy comment below, pointed the other way: the default
    // host is "localhost", which Node resolved to ::1 here — so this listened
    // on IPv6 loopback alone and `tailscale serve` forwarding to 127.0.0.1
    // was refused. Bind IPv4 loopback by address. Still loopback only.
    host: '127.0.0.1',
    proxy: {
      // 127.0.0.1 by address: the server binds IPv4 loopback only (D-127),
      // and Node may resolve "localhost" to ::1 first.
      '/api': 'http://127.0.0.1:4600',
      '/ws': { target: 'ws://127.0.0.1:4600', ws: true },
    },
  },
});
