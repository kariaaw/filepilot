import {
  Clock,
  Copy,
  FileSearch,
  Folder,
  FolderPlus,
  HardDrive,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';

import { AppShell } from '@/app/layouts/app-shell';
import type { AppView } from '@/app/navigation/app-view';
import { Button } from '@/shared/components/button';

import './App.css';

interface ViewContent {
  eyebrow: string;
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  icon: LucideIcon;
}

const VIEW_CONTENT: Record<Exclude<AppView, 'overview'>, ViewContent> = {
  library: {
    eyebrow: 'File sources',
    title: 'Your library',
    description: 'Connect local folders and removable drives without uploading their contents.',
    emptyTitle: 'Add your first folder',
    emptyDescription:
      'FilePilot will index metadata locally so you can search and organize files privately.',
    icon: Folder,
  },
  duplicates: {
    eyebrow: 'Storage cleanup',
    title: 'Duplicate files',
    description: 'Detect identical and visually similar files across connected sources.',
    emptyTitle: 'No files available to compare',
    emptyDescription: 'Add at least one folder before running a duplicate-file analysis.',
    icon: Copy,
  },
  timeline: {
    eyebrow: 'File activity',
    title: 'Timeline',
    description: 'Explore files by creation date, modification time, and local activity.',
    emptyTitle: 'Your timeline is empty',
    emptyDescription:
      'Recent file activity will appear after FilePilot indexes a connected folder.',
    icon: Clock,
  },
  settings: {
    eyebrow: 'Preferences',
    title: 'Settings',
    description: 'Control privacy, indexing behavior, appearance, and local storage.',
    emptyTitle: 'Configuration is ready',
    emptyDescription:
      'Additional privacy and indexing controls will be added as FilePilot features are connected.',
    icon: Settings,
  },
};

/**
 * Root application composition.
 *
 * Feature pages currently display honest empty states while the underlying
 * indexing and native file-system workflows are developed incrementally.
 */
function App(): React.JSX.Element {
  const [activeView, setActiveView] = useState<AppView>('overview');

  return (
    <AppShell activeView={activeView} onNavigate={setActiveView}>
      {activeView === 'overview' ? (
        <OverviewPage onOpenLibrary={() => setActiveView('library')} />
      ) : (
        <EmptyWorkspacePage content={VIEW_CONTENT[activeView]} />
      )}
    </AppShell>
  );
}

interface OverviewPageProps {
  onOpenLibrary: () => void;
}

function OverviewPage({ onOpenLibrary }: OverviewPageProps): React.JSX.Element {
  return (
    <div className="overview">
      <section className="overview__hero">
        <div className="overview__hero-content">
          <span className="overview__eyebrow">
            <Sparkles aria-hidden="true" />
            Private file intelligence
          </span>

          <h1>Find anything without giving up your privacy.</h1>

          <p>
            FilePilot organizes and searches files directly on your device. Your documents remain
            local and under your control.
          </p>

          <div className="overview__hero-actions">
            <Button size="large" variant="primary" onClick={onOpenLibrary}>
              <FolderPlus aria-hidden="true" />
              Add your first folder
            </Button>

            <span className="overview__privacy-note">
              <ShieldCheck aria-hidden="true" />
              Nothing is uploaded
            </span>
          </div>
        </div>

        <div className="overview__hero-visual" aria-hidden="true">
          <div className="overview__orb overview__orb--primary">
            <Search />
          </div>
          <div className="overview__orb overview__orb--secondary">
            <Folder />
          </div>
          <div className="overview__orb overview__orb--tertiary">
            <FileSearch />
          </div>
        </div>
      </section>

      <section className="overview__stats" aria-label="Library statistics">
        <StatCard label="Indexed files" value="0" icon={FileSearch} />
        <StatCard label="Connected folders" value="0" icon={Folder} />
        <StatCard label="Duplicate groups" value="0" icon={Copy} />
        <StatCard label="Indexed storage" value="0 B" icon={HardDrive} />
      </section>

      <section className="overview__grid">
        <article className="overview__panel overview__panel--wide">
          <div className="overview__panel-header">
            <div>
              <span className="overview__panel-eyebrow">Library sources</span>
              <h2>Connected folders</h2>
            </div>

            <Button size="small" variant="secondary" onClick={onOpenLibrary}>
              Manage library
            </Button>
          </div>

          <div className="overview__empty-list">
            <span className="overview__empty-icon">
              <FolderPlus aria-hidden="true" />
            </span>
            <div>
              <h3>No folders connected</h3>
              <p>Add a local folder to begin private indexing and search.</p>
            </div>
          </div>
        </article>

        <article className="overview__panel">
          <div className="overview__panel-header">
            <div>
              <span className="overview__panel-eyebrow">Privacy status</span>
              <h2>Local-first</h2>
            </div>
          </div>

          <div className="overview__privacy-card">
            <span className="overview__privacy-icon">
              <ShieldCheck aria-hidden="true" />
            </span>

            <div>
              <strong>Your files stay on this device</strong>
              <p>FilePilot stores only local metadata required for indexing and organization.</p>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
}

function StatCard({ label, value, icon: Icon }: StatCardProps): React.JSX.Element {
  return (
    <article className="stat-card">
      <span className="stat-card__icon" aria-hidden="true">
        <Icon />
      </span>

      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

interface EmptyWorkspacePageProps {
  content: ViewContent;
}

function EmptyWorkspacePage({ content }: EmptyWorkspacePageProps): React.JSX.Element {
  const Icon = content.icon;

  return (
    <div className="workspace">
      <header className="workspace__header">
        <span>{content.eyebrow}</span>
        <h1>{content.title}</h1>
        <p>{content.description}</p>
      </header>

      <section className="workspace__empty">
        <span className="workspace__empty-icon" aria-hidden="true">
          <Icon />
        </span>

        <h2>{content.emptyTitle}</h2>
        <p>{content.emptyDescription}</p>
      </section>
    </div>
  );
}

export default App;
