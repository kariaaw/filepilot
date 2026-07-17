import { type PropsWithChildren, useEffect, useMemo, useState } from 'react';

import { useThemeStore } from '@/app/providers/theme-store';
import { resolveTheme } from '@/app/providers/theme-utils';

/**
 * Standard media query used by browsers and Tauri WebViews to expose
 * the operating-system color preference.
 */
const DARK_THEME_MEDIA_QUERY = '(prefers-color-scheme: dark)';

/**
 * Reads the current operating-system preference safely.
 *
 * The fallback prevents non-browser environments such as automated tests
 * and server-side tooling from attempting to access window.
 */
function getInitialSystemPreference(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }

  return window.matchMedia(DARK_THEME_MEDIA_QUERY).matches;
}

/**
 * Applies and maintains FilePilot's active document theme.
 *
 * This provider watches both the persisted user preference and live
 * operating-system changes. Theme information remains on the local device.
 */
export function ThemeProvider({ children }: PropsWithChildren): React.JSX.Element {
  const preference = useThemeStore((state) => state.preference);

  const [systemPrefersDark, setSystemPrefersDark] = useState(getInitialSystemPreference);

  const resolvedTheme = useMemo(
    () => resolveTheme(preference, systemPrefersDark),
    [preference, systemPrefersDark],
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(DARK_THEME_MEDIA_QUERY);

    const handleSystemThemeChange = (event: MediaQueryListEvent): void => {
      setSystemPrefersDark(event.matches);
    };

    /*
     * Synchronize immediately in case the system preference changed
     * between the first render and effect registration.
     */
    setSystemPrefersDark(mediaQuery.matches);

    mediaQuery.addEventListener('change', handleSystemThemeChange);

    return () => {
      mediaQuery.removeEventListener('change', handleSystemThemeChange);
    };
  }, []);

  useEffect(() => {
    const documentRoot = document.documentElement;

    documentRoot.dataset.theme = resolvedTheme;
    documentRoot.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  return <>{children}</>;
}
