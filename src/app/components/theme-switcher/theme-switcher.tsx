import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';

import { useThemeStore } from '@/app/providers/theme-store';
import { IconButton } from '@/shared/components/icon-button';
import type { ThemePreference } from '@/shared/types/theme';

import styles from './theme-switcher.module.css';

interface ThemeOption {
  preference: ThemePreference;
  label: string;
  icon: LucideIcon;
}

const THEME_OPTIONS: readonly ThemeOption[] = [
  {
    preference: 'system',
    label: 'Use system theme',
    icon: Monitor,
  },
  {
    preference: 'light',
    label: 'Use light theme',
    icon: Sun,
  },
  {
    preference: 'dark',
    label: 'Use dark theme',
    icon: Moon,
  },
];

/**
 * Compact appearance selector for FilePilot toolbars and settings panels.
 *
 * The selected preference is persisted locally by the theme store and is
 * never transmitted outside the user's device.
 */
export function ThemeSwitcher(): React.JSX.Element {
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);

  return (
    <div className={styles.container} role="group" aria-labelledby="theme-switcher-label">
      <span id="theme-switcher-label" className={styles.label}>
        Interface theme
      </span>

      {THEME_OPTIONS.map((option) => {
        const Icon = option.icon;
        const isActive = preference === option.preference;

        return (
          <IconButton
            key={option.preference}
            size="small"
            variant="ghost"
            icon={<Icon />}
            isActive={isActive}
            aria-label={option.label}
            aria-pressed={isActive}
            onClick={() => {
              setPreference(option.preference);
            }}
          />
        );
      })}
    </div>
  );
}
