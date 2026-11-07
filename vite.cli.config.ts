import { defineConfig } from 'vite';

// Builds the offline command-line tool into a single file: bin/tallyleaf.js
export default defineConfig({
  publicDir: false,
  build: {
    ssr: 'cli/main.ts',
    outDir: 'bin',
    emptyOutDir: true,
    target: 'node20',
    minify: false,
    sourcemap: false,
    rollupOptions: {
      external: [/^node:/, /^@napi-rs\/canvas/, /^pdfjs-dist/],
      output: { entryFileNames: 'tallyleaf.js', banner: '#!/usr/bin/env node' },
    },
  },
  ssr: { noExternal: true, external: ['@napi-rs/canvas', 'pdfjs-dist'] },
});
