import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const backendUrl = `http://${process.env.BACKEND_HOST ?? 'localhost'}:9174`;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    watch: {
      usePolling: true,
    },
    hmr: {
      path: '/__vite_hmr',
    },
    proxy: {
      '/api': {
        target: backendUrl,
        changeOrigin: true,
      },
      '/ws': {
        target: backendUrl,
        ws: true,
      },
    },
  },
  build: {
    target: 'esnext',
    minify: 'terser',
    rollupOptions: {
      output: {
        manualChunks: {
          'xterm': ['@xterm/xterm', '@xterm/addon-fit', '@xterm/addon-webgl'],
          'react-vendor': ['react', 'react-dom'],
        },
      },
    },
  },
});
