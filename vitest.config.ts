import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Dedicated Vitest configuration for FilePilot unit and integration tests.
 *
 * Tests run inside Node.js while browser APIs such as IndexedDB are provided
 * by explicit polyfills in the shared setup file.
 */
export default defineConfig({
  resolve: {
    /*
     * Keep test imports consistent with the production application.
     * Example: import { FileEntry } from '@/core/entities/file-entry'.
     */
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  test: {
    name: 'filepilot-unit-tests',
    environment: 'node',

    /**
     * Install browser API polyfills before each test file is collected.
     */
    setupFiles: ['./src/test/setup.ts'],

    /**
     * Keep test discovery inside the frontend source tree.
     */
    include: ['src/**/*.test.{ts,tsx}'],

    /**
     * Prevent state from one test from leaking into another.
     */
    clearMocks: true,
    mockReset: true,
    restoreMocks: true,
  },
});
