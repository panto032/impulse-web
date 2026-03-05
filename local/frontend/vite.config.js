import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4904,
    proxy: {
      '/terminal': {
        target: 'http://localhost:4902',
        ws: true,
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:4902',
      },
    },
  },
});
