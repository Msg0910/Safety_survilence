import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-reacts'],
  },
  server: {
    proxy: {
      '/api/model-control': {
        target: 'http://localhost:5173/camera-grid',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/,''),
        headers: {
          'Content-Type': 'application/json',
        },
      },
    },
  },
});
