import type { ResolvedTheme, ThemePreference } from '@/shared/types/theme';

/**
 * Converts a persisted user preference into the concrete theme that must
 * be applied to the document.
 *
 * Keeping this function independent from React makes it reusable and easy
 * to test without rendering a component.
 */
export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === 'system') {
    return systemPrefersDark ? 'dark' : 'light';
  }

  return preference;
}
