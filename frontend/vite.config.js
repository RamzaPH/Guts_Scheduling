import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const proxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:5000';

  return {
    plugins: [
      react(),
      tailwindcss()
    ],
    build: {
      // The PH address dataset is intentionally large and loaded in its own chunk.
      // Raise warning threshold so build output reflects real regressions instead of known data size.
      chunkSizeWarningLimit: 9000,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            query: ['@tanstack/react-query'],
            icons: ['lucide-react'],
            phAddress: ['latest-ph-address-thanks-to-anehan', 'psgc'],
          },
        },
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      watch: {
        usePolling: true,
      },
      // Force HMR client to connect directly to the Vite server port so
      // browsers served through a proxy (host:8080) will still reach HMR.
      // Use VITE_HMR_CLIENT_PORT env to override when necessary, but default
      // to 5173 which is where Vite listens inside the container.
      hmr: {
        protocol: 'ws',
        host: 'localhost',
        port: 5173,
        clientPort: Number(env.VITE_HMR_CLIENT_PORT || 5173),
      },
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true
        }
      }
    }
  };
})