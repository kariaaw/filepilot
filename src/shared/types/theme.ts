/**
 * Theme preference selected by the user.
 *
 * The system option follows the operating-system color preference and
 * automatically responds when that preference changes.
 */
export type ThemePreference = 'system' | 'light' | 'dark';

/**
 * Concrete theme currently applied to the document.
 */
export type ResolvedTheme = Exclude<ThemePreference, 'system'>;
