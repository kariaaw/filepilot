/**
 * Top-level workspaces available inside the FilePilot application shell.
 *
 * Keeping navigation identifiers independent from UI labels allows routes,
 * keyboard shortcuts, and analytics-free local state to reuse them safely.
 */
export type AppView = 'overview' | 'library' | 'duplicates' | 'timeline' | 'settings';
