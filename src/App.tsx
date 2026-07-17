import {
  Clock,
  Copy,
  FileSearch,
  Folder,
  FolderPlus,
  HardDrive,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { libraryWorkspace } from '@/app/application-services';
import { AppShell } from '@/app/layouts/app-shell';
import type { AppView } from '@/app/navigation/app-view';
import type { LibrarySource } from '@/core/entities/library-source';
import { useLibraryWorkspace } from '@/features/library/presentation';
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

const VIEW_CONTENT: Record<Exclude<AppView, 'overview' | 'library'>, ViewContent> = {
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

function formatStorageSize(sizeBytes: number): string {
  if (sizeBytes === 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
  const unitIndex = Math.min(Math.floor(Math.log(sizeBytes) / Math.log(1024)), units.length - 1);
  const value = sizeBytes / 1024 ** unitIndex;

  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${
    units[unitIndex]
  }`;
}

/**
 * Root application composition.
 *
 * The application shell consumes presentation state while native platform and
 * IndexedDB details remain isolated behind the Library workspace facade.
 */
function App(): React.JSX.Element {
  const [activeView, setActiveView] = useState<AppView>('overview');

  const {
    sources,
    total,
    isLoading,
    isConnecting,
    indexingSourceIds,
    notice,
    error,
    connectDirectory,
    indexSource,
  } = useLibraryWorkspace(libraryWorkspace);

  const libraryStatistics = useMemo(
    () =>
      sources.reduce(
        (statistics, source) => ({
          fileCount: statistics.fileCount + source.statistics.fileCount,
          totalSizeBytes: statistics.totalSizeBytes + source.statistics.totalSizeBytes,
        }),
        {
          fileCount: 0,
          totalSizeBytes: 0,
        },
      ),
    [sources],
  );

  const handleAddFolder = useCallback(() => {
    setActiveView('library');
    void connectDirectory();
  }, [connectDirectory]);

  const handleIndexSource = useCallback(
    (sourceId: string) => {
      void indexSource(sourceId);
    },
    [indexSource],
  );

  return (
    <AppShell
      activeView={activeView}
      connectedFolderCount={total}
      isAddingFolder={isConnecting}
      onAddFolder={handleAddFolder}
      onNavigate={setActiveView}
    >
      {activeView === 'overview' ? (
        <OverviewPage
          sources={sources}
          connectedFolderCount={total}
          indexedFileCount={libraryStatistics.fileCount}
          indexedStorageBytes={libraryStatistics.totalSizeBytes}
          isAddingFolder={isConnecting}
          onAddFolder={handleAddFolder}
          onOpenLibrary={() => {
            setActiveView('library');
          }}
        />
      ) : activeView === 'library' ? (
        <LibraryPage
          sources={sources}
          isLoading={isLoading}
          isConnecting={isConnecting}
          indexingSourceIds={indexingSourceIds}
          notice={notice}
          error={error}
          onAddFolder={handleAddFolder}
          onIndexSource={handleIndexSource}
        />
      ) : (
        <EmptyWorkspacePage content={VIEW_CONTENT[activeView]} />
      )}
    </AppShell>
  );
}

interface OverviewPageProps {
  sources: readonly LibrarySource[];
  connectedFolderCount: number;
  indexedFileCount: number;
  indexedStorageBytes: number;
  isAddingFolder: boolean;
  onAddFolder: () => void;
  onOpenLibrary: () => void;
}

function OverviewPage({
  sources,
  connectedFolderCount,
  indexedFileCount,
  indexedStorageBytes,
  isAddingFolder,
  onAddFolder,
  onOpenLibrary,
}: OverviewPageProps): React.JSX.Element {
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
            <Button
              size="large"
              variant="primary"
              isLoading={isAddingFolder}
              loadingLabel="Selecting folder"
              onClick={onAddFolder}
            >
              <FolderPlus aria-hidden="true" />
              {connectedFolderCount === 0 ? 'Add your first folder' : 'Add another folder'}
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
        <StatCard
          label="Indexed files"
          value={indexedFileCount.toLocaleString()}
          icon={FileSearch}
        />
        <StatCard
          label="Connected folders"
          value={connectedFolderCount.toLocaleString()}
          icon={Folder}
        />
        <StatCard label="Duplicate groups" value="0" icon={Copy} />
        <StatCard
          label="Indexed storage"
          value={formatStorageSize(indexedStorageBytes)}
          icon={HardDrive}
        />
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

          {sources.length === 0 ? (
            <div className="overview__empty-list">
              <span className="overview__empty-icon">
                <FolderPlus aria-hidden="true" />
              </span>
              <div>
                <h3>No folders connected</h3>
                <p>Add a local folder to begin private indexing and search.</p>
              </div>
            </div>
          ) : (
            <div className="overview__source-list">
              {sources.slice(0, 4).map((source) => (
                <SourceSummaryRow key={source.id} source={source} />
              ))}
            </div>
          )}
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

interface LibraryPageProps {
  sources: readonly LibrarySource[];
  isLoading: boolean;
  isConnecting: boolean;
  indexingSourceIds: readonly string[];
  notice: string | null;
  error: string | null;
  onAddFolder: () => void;
  onIndexSource: (sourceId: string) => void;
}

function LibraryPage({
  sources,
  isLoading,
  isConnecting,
  indexingSourceIds,
  notice,
  error,
  onAddFolder,
  onIndexSource,
}: LibraryPageProps): React.JSX.Element {
  return (
    <div className="workspace">
      <header className="workspace__header workspace__header--actions">
        <div>
          <span>File sources</span>
          <h1>Your library</h1>
          <p>Connect local folders and removable drives without uploading their contents.</p>
        </div>

        <Button
          variant="primary"
          isLoading={isConnecting}
          loadingLabel="Selecting folder"
          onClick={onAddFolder}
        >
          <FolderPlus aria-hidden="true" />
          Add folder
        </Button>
      </header>

      {notice ? (
        <p className="workspace__feedback" role="status">
          {notice}
        </p>
      ) : null}

      {error ? (
        <p className="workspace__feedback workspace__feedback--error" role="alert">
          {error}
        </p>
      ) : null}

      {isLoading ? (
        <section className="workspace__empty" aria-busy="true">
          <span className="workspace__loading-indicator" aria-hidden="true" />
          <h2>Loading your library</h2>
          <p>FilePilot is reading locally stored folder metadata.</p>
        </section>
      ) : sources.length === 0 ? (
        <section className="workspace__empty">
          <span className="workspace__empty-icon" aria-hidden="true">
            <Folder />
          </span>

          <h2>Add your first folder</h2>
          <p>
            FilePilot will index metadata locally so you can search and organize files privately.
          </p>

          <Button
            variant="primary"
            isLoading={isConnecting}
            loadingLabel="Selecting folder"
            onClick={onAddFolder}
          >
            <FolderPlus aria-hidden="true" />
            Select a local folder
          </Button>
        </section>
      ) : (
        <section className="library-source-grid" aria-label="Connected folders">
          {sources.map((source) => (
            <LibrarySourceCard
              key={source.id}
              source={source}
              isIndexing={indexingSourceIds.includes(source.id)}
              onIndexSource={onIndexSource}
            />
          ))}
        </section>
      )}
    </div>
  );
}

interface LibrarySourceProps {
  source: LibrarySource;
}

function SourceSummaryRow({ source }: LibrarySourceProps): React.JSX.Element {
  return (
    <div className="overview__source-row">
      <span className="overview__source-icon" aria-hidden="true">
        <Folder />
      </span>

      <div className="overview__source-content">
        <strong>{source.name}</strong>
        <span title={source.displayPath}>{source.displayPath}</span>
      </div>

      <span className="library-source__status" data-access={source.access}>
        {source.access}
      </span>
    </div>
  );
}

function formatLastIndexed(lastScannedAtMs: number | null): string {
  if (lastScannedAtMs === null) {
    return 'Not indexed yet';
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'long',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(lastScannedAtMs));
}

interface LibrarySourceCardProps extends LibrarySourceProps {
  isIndexing: boolean;
  onIndexSource: (sourceId: string) => void;
}

function LibrarySourceCard({
  source,
  isIndexing,
  onIndexSource,
}: LibrarySourceCardProps): React.JSX.Element {
  const hasBeenIndexed = source.lastScannedAtMs !== null;

  return (
    <article className="library-source">
      <div className="library-source__header">
        <span className="library-source__icon" aria-hidden="true">
          <Folder />
        </span>

        <span className="library-source__status" data-access={source.access}>
          {source.access}
        </span>
      </div>

      <h2>{source.name}</h2>
      <p className="library-source__path" title={source.displayPath}>
        {source.displayPath}
      </p>

      <dl className="library-source__metadata">
        <div>
          <dt>Files</dt>
          <dd>{source.statistics.fileCount.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Folders</dt>
          <dd>{source.statistics.directoryCount.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Storage</dt>
          <dd>{formatStorageSize(source.statistics.totalSizeBytes)}</dd>
        </div>
        <div>
          <dt>Sync</dt>
          <dd>{source.syncMode}</dd>
        </div>
      </dl>

      <div className="library-source__actions">
        <div className="library-source__last-indexed">
          <span>Last indexed</span>

          {source.lastScannedAtMs === null ? (
            <strong>Not indexed yet</strong>
          ) : (
            <time dateTime={new Date(source.lastScannedAtMs).toISOString()}>
              {formatLastIndexed(source.lastScannedAtMs)}
            </time>
          )}
        </div>

        <Button
          className="library-source__index-button"
          size="medium"
          variant="primary"
          fullWidth
          disabled={source.access !== 'available'}
          isLoading={isIndexing}
          loadingLabel={`Indexing ${source.name}`}
          onClick={() => {
            onIndexSource(source.id);
          }}
        >
          <RefreshCw aria-hidden="true" />
          {hasBeenIndexed ? 'Refresh index' : 'Index now'}
        </Button>
      </div>
    </article>
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
