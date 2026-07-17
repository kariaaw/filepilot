import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react()],

  resolve: {
    /*
     * Keep frontend imports short and stable.
     * Example: import Button from '@/shared/components/Button'.
     */
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  /*
   * These development options are tailored for Tauri.
   * They keep Rust errors visible and guarantee a predictable port.
   */
  clearScreen: false,

  server: {
    port: 1420,
    strictPort: true,
    host: host || false,

    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,

    watch: {
      // Rust builds are handled by Cargo, so Vite should ignore this directory.
      ignored: ['**/src-tauri/**'],
    },
  },
}));
