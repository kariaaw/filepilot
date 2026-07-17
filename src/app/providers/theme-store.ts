import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { ThemePreference } from '@/shared/types/theme';

/**
 * Stable storage key for FilePilot interface preferences.
 *
 * Renaming this key would make existing user theme preferences appear lost.
 */
const THEME_STORAGE_KEY = 'filepilot-theme-preference';

interface ThemeState {
  /**
   * User-selected preference rather than the currently resolved theme.
   */
  preference: ThemePreference;

  /**
   * Updates and persists the theme preference on the current device.
   */
  setPreference: (preference: ThemePreference) => void;
}

/**
 * Small persisted store dedicated to appearance preferences.
 *
 * FilePilot remains local-first: this preference is stored only inside
 * the user's current browser profile or desktop WebView.
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      preference: 'system',

      setPreference: (preference) => {
        set({ preference });
      },
    }),
    {
      name: THEME_STORAGE_KEY,

      /*
       * Persist only durable user preferences. Actions and derived values
       * should never be serialized into local storage.
       */
      partialize: (state) => ({
        preference: state.preference,
      }),
    },
  ),
);
