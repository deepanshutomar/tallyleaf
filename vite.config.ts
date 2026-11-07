import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1500,
    // Ship every script as .js: many shared hosts don't serve .mjs as JavaScript, which breaks the PDF reader.
    rollupOptions: {
      output: {
        assetFileNames: (info: { name?: string; names?: string[] }) =>
          /\.mjs$/.test(info.names?.[0] ?? info.name ?? '') ? 'assets/[name]-[hash].js' : 'assets/[name]-[hash][extname]',
      },
    },
  },
  test: { environment: 'node' },
} as any);
