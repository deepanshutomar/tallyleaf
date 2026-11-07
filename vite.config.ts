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
  // The end-to-end tests render, photograph and scan real pages; shared CI machines need more than the 5 s default.
  test: { environment: 'node', testTimeout: 120_000, hookTimeout: 120_000 },
} as any);
