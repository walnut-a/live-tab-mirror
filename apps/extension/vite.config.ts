import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const popupPath = new URL('./popup.html', import.meta.url).pathname;
const backgroundPath = new URL('./src/background.ts', import.meta.url).pathname;

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: popupPath,
        background: backgroundPath
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  }
});
