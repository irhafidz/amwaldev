import { lingui } from '@lingui/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tsConfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  server: {
    port: 3000,
    // No dev proxy: apps/server is decommissioned (Putaran 17, Batch 6) —
    // /rpc/*, /health, and /api/* are all served by this same TanStack
    // Start process now (routes/rpc/$.ts, routes/health.ts,
    // routes/api/webhooks/payment.ts, routes/api/certificates.$id.ts).
    // Proxying any of them to a nonexistent :3001 would just reproduce the
    // "http proxy error / connection refused" failure this cleanup fixes.
  },
  plugins: [
    tsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    tanstackStart({
      customViteReactPlugin: true,
      target: 'bun',
    }),
    react({
      babel: {
        plugins: ['@lingui/babel-plugin-lingui-macro'],
      },
    }),
    lingui(),
  ],
});
