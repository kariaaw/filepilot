// @ts-check

import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  {
    /*
     * Generated files and third-party dependencies must not be linted.
     * Ignoring them keeps ESLint fast and prevents irrelevant warnings.
     */
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'src-tauri/target/**'],
  },

  {
    name: 'filepilot/frontend',

    files: ['src/**/*.{ts,tsx}'],

    extends: [js.configs.recommended, tseslint.configs.recommended],

    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',

      globals: {
        ...globals.browser,
      },
    },

    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },

    rules: {
      /*
       * Enforce React's Rules of Hooks and detect incomplete
       * dependency arrays in hooks such as useEffect.
       */
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      /*
       * Keep Vite Fast Refresh reliable by warning when component
       * modules export unsupported values.
       */
      'react-refresh/only-export-components': [
        'warn',
        {
          allowConstantExport: true,
        },
      ],

      /*
       * Unused variables are usually mistakes. Names beginning with
       * an underscore are intentionally allowed for future adapters
       * and callback signatures.
       */
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  {
    name: 'filepilot/tooling',

    /*
     * Project configuration files run in Node.js rather than inside
     * the browser, so they receive a separate global environment.
     */
    files: ['eslint.config.js', 'vite.config.ts', '*.config.{js,mjs,cjs,ts}'],

    extends: [js.configs.recommended, tseslint.configs.recommended],

    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',

      globals: {
        ...globals.node,
      },
    },
  },

  /*
   * Disable formatting rules that could conflict with Prettier.
   * Prettier will be responsible only for formatting.
   */
  prettier,
]);
