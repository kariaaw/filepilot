/**
 * Shared formatting rules for the entire FilePilot codebase.
 *
 * Keeping formatting centralized prevents unnecessary differences
 * between contributors, editors, and automated GitHub checks.
 */

/** @type {import('prettier').Config} */
const config = {
  // Keep statements explicit and consistent.
  semi: true,

  // Match the preferred style for TypeScript and JavaScript files.
  singleQuote: true,

  // Improve readability of multiline arrays, objects, and parameters.
  trailingComma: 'all',

  // Use the standard indentation size across the frontend.
  tabWidth: 2,
  useTabs: false,

  // Prevent excessively long lines while keeping code readable.
  printWidth: 100,

  // Always wrap arrow-function parameters for predictable formatting.
  arrowParens: 'always',

  // Keep line endings consistent across Linux, Windows, and macOS.
  endOfLine: 'lf',

  // Preserve intentional wrapping in documentation files.
  proseWrap: 'preserve',
};

export default config;
