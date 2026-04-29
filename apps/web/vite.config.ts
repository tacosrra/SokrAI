import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig(({ mode }) => {
  const configDir = dirname(fileURLToPath(import.meta.url));
  const envDir = resolve(configDir, '../..');
  const env = {
    ...process.env,
    ...loadEnv(mode, envDir, ''),
  };
  const n8nUser = env.N8N_BASIC_AUTH_USER || '';
  const n8nPassword = env.N8N_BASIC_AUTH_PASSWORD || '';
  const n8nBasicAuth =
    n8nUser && n8nPassword
      ? `Basic ${Buffer.from(`${n8nUser}:${n8nPassword}`).toString('base64')}`
      : '';

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: Number(env.FRONTEND_PORT || 3000),
      proxy: {
        '/api': {
          target: env.API_PROXY_TARGET || 'http://localhost:3001',
          changeOrigin: true,
        },
        '/webhook': {
          target: env.WEBHOOK_PROXY_TARGET || 'http://localhost:5678',
          changeOrigin: true,
          headers: n8nBasicAuth
            ? {
                Authorization: n8nBasicAuth,
              }
            : undefined,
        },
      },
    },
    preview: {
      host: '0.0.0.0',
      port: Number(env.FRONTEND_PORT || 3000),
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  };
});
