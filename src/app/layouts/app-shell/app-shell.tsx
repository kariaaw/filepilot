import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Folder,
  HardDrive,
  Home,
  Search,
  Settings,
  Shield,
  type LucideIcon,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import clsx from 'clsx';

import { ThemeSwitcher } from '@/app/components/theme-switcher';
import type { AppView } from '@/app/navigation/app-view';
import { Button } from '@/shared/components/button';
import { IconButton } from '@/shared/components/icon-button';

import styles from './app-shell.module.css';

interface NavigationItem {
  view: AppView;
  label: string;
  icon: LucideIcon;
}

const NAVIGATION_ITEMS: readonly NavigationItem[] = [
  {
    view: 'overview',
    label: 'Overview',
    icon: Home,
  },
  {
    view: 'library',
    label: 'Library',
    icon: Folder,
  },
  {
    view: 'duplicates',
    label: 'Duplicates',
    icon: Copy,
  },
  {
    view: 'timeline',
    label: 'Timeline',
    icon: Clock,
  },
  {
    view: 'settings',
    label: 'Settings',
    icon: Settings,
  },
];

interface AppShellProps {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  children: ReactNode;
}

/**
 * Main responsive application frame for FilePilot.
 *
 * The shell owns only global navigation and layout. Individual feature
 * pages remain responsible for their own content and business behavior.
 */
export function AppShell({ activeView, onNavigate, children }: AppShellProps): React.JSX.Element {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <div className={styles.shell} data-sidebar-collapsed={isSidebarCollapsed}>
      <aside className={styles.sidebar} aria-label="Primary navigation">
        <div className={styles.brandRow}>
          <div className={styles.brand}>
            <span className={styles.brandMark} aria-hidden="true">
              <Folder />
            </span>

            <span className={styles.brandText}>
              <span className={styles.brandName}>FilePilot</span>
              <span className={styles.brandTagline}>Private file intelligence</span>
            </span>
          </div>

          <span className={styles.collapseButton}>
            <IconButton
              size="small"
              variant="ghost"
              icon={isSidebarCollapsed ? <ChevronRight /> : <ChevronLeft />}
              aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!isSidebarCollapsed}
              onClick={() => {
                setIsSidebarCollapsed((current) => !current);
              }}
            />
          </span>
        </div>

        <nav className={styles.navigation} aria-label="FilePilot workspaces">
          <span className={styles.sectionLabel}>Workspace</span>

          {NAVIGATION_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.view;

            return (
              <button
                key={item.view}
                type="button"
                className={styles.navigationItem}
                aria-current={isActive ? 'page' : undefined}
                title={isSidebarCollapsed ? item.label : undefined}
                onClick={() => {
                  onNavigate(item.view);
                }}
              >
                <span className={styles.navigationIcon} aria-hidden="true">
                  <Icon />
                </span>

                <span className={styles.navigationLabel}>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.storageCard}>
            <span className={styles.storageIcon} aria-hidden="true">
              <HardDrive />
            </span>

            <span className={styles.storageContent}>
              <span className={styles.storageTitle}>Local storage</span>
              <span className={styles.storageDescription}>No folders indexed</span>
            </span>
          </div>

          <div className={styles.localBadge}>
            <span className={styles.localBadgeDot} aria-hidden="true" />
            Private and local-first
          </div>
        </div>
      </aside>

      <div className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.search}>
            <Search className={styles.searchIcon} aria-hidden="true" />

            <input
              className={styles.searchInput}
              type="search"
              placeholder="Search files, folders, or natural language..."
              aria-label="Search FilePilot"
            />

            <span className={styles.searchShortcut} aria-hidden="true">
              Ctrl K
            </span>
          </div>

          <div className={styles.topbarActions}>
            <ThemeSwitcher />

            <Button
              variant="primary"
              onClick={() => {
                onNavigate('library');
              }}
            >
              Add folder
            </Button>

            <IconButton
              variant="ghost"
              icon={<Shield />}
              aria-label="Open privacy settings"
              onClick={() => {
                onNavigate('settings');
              }}
            />
          </div>
        </header>

        <main className={clsx(styles.content)}>{children}</main>
      </div>
    </div>
  );
}
