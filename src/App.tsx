import {
  ArrowLeft,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  File as FileIcon,
  FileSearch,
  Folder,
  FolderOpen,
  FolderPlus,
  HardDrive,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { libraryWorkspace } from '@/app/application-services';
import { AppShell } from '@/app/layouts/app-shell';
import type { AppView } from '@/app/navigation/app-view';
import type { FileEntry } from '@/core/entities/file-entry';
import type { LibrarySource } from '@/core/entities/library-source';
import {
  useIndexedEntryOperations,
  useIndexedEntrySearch,
  useIndexedFileBrowser,
  useLibraryWorkspace,
  type IndexedEntryOperationViewState,
  type IndexedEntrySearchViewState,
  type IndexedFileBrowserViewState,
} from '@/features/library/presentation';
import { Button } from '@/shared/components/button';
import { IconButton } from '@/shared/components/icon-button';

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

  const [pendingRemovalSource, setPendingRemovalSource] = useState<LibrarySource | null>(null);

  const {
    sources,
    total,
    isLoading,
    isConnecting,
    indexingSourceIds,
    removingSourceIds,
    notice,
    error,
    connectDirectory,
    indexSource,
    removeSource,
  } = useLibraryWorkspace(libraryWorkspace);

  const fileBrowser = useIndexedFileBrowser(libraryWorkspace);

  const {
    closeBrowser: closeFileBrowser,
    loadingSourceId: loadingBrowserSourceId,
    selectedSourceId: selectedBrowserSourceId,
  } = fileBrowser;

  const entryOperations = useIndexedEntryOperations(libraryWorkspace);

  const indexedSearch = useIndexedEntrySearch(libraryWorkspace);

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

  const isPendingSourceRemovalRunning =
    pendingRemovalSource !== null && removingSourceIds.includes(pendingRemovalSource.id);

  const handleRemoveSource = useCallback((source: LibrarySource): void => {
    setPendingRemovalSource(source);
  }, []);

  const handleCancelSourceRemoval = useCallback((): void => {
    if (isPendingSourceRemovalRunning) {
      return;
    }

    setPendingRemovalSource(null);
  }, [isPendingSourceRemovalRunning]);

  const handleConfirmSourceRemoval = useCallback(async (): Promise<void> => {
    const source = pendingRemovalSource;

    if (!source) {
      return;
    }

    const wasRemoved = await removeSource(source.id);

    if (!wasRemoved) {
      setPendingRemovalSource(null);
      return;
    }

    const activeBrowserSourceId = selectedBrowserSourceId ?? loadingBrowserSourceId;

    if (activeBrowserSourceId === source.id) {
      closeFileBrowser();
    }

    setPendingRemovalSource(null);
  }, [
    closeFileBrowser,
    loadingBrowserSourceId,
    pendingRemovalSource,
    removeSource,
    selectedBrowserSourceId,
  ]);

  useEffect(() => {
    if (!pendingRemovalSource || isPendingSourceRemovalRunning) {
      return;
    }

    const handleEscapeKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setPendingRemovalSource(null);
      }
    };

    window.addEventListener('keydown', handleEscapeKey);

    return () => {
      window.removeEventListener('keydown', handleEscapeKey);
    };
  }, [isPendingSourceRemovalRunning, pendingRemovalSource]);

  return (
    <>
      <AppShell
        activeView={activeView}
        connectedFolderCount={total}
        isAddingFolder={isConnecting}
        searchText={indexedSearch.text}
        isSearching={indexedSearch.isSearching}
        onAddFolder={handleAddFolder}
        onNavigate={setActiveView}
        onSearchTextChange={indexedSearch.setText}
        onClearSearch={indexedSearch.clearSearch}
      >
        {indexedSearch.hasSearchText ? (
          <IndexedSearchResultsPage
            search={indexedSearch}
            sources={sources}
            operations={entryOperations}
          />
        ) : activeView === 'overview' ? (
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
            removingSourceIds={removingSourceIds}
            notice={notice}
            error={error}
            fileBrowser={fileBrowser}
            entryOperations={entryOperations}
            onAddFolder={handleAddFolder}
            onIndexSource={handleIndexSource}
            onRemoveSource={handleRemoveSource}
          />
        ) : (
          <EmptyWorkspacePage content={VIEW_CONTENT[activeView]} />
        )}
      </AppShell>

      <RemoveSourceDialog
        source={pendingRemovalSource}
        isRemoving={isPendingSourceRemovalRunning}
        onCancel={handleCancelSourceRemoval}
        onConfirm={handleConfirmSourceRemoval}
      />
    </>
  );
}

interface RemoveSourceDialogProps {
  source: LibrarySource | null;
  isRemoving: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}

function RemoveSourceDialog({
  source,
  isRemoving,
  onCancel,
  onConfirm,
}: RemoveSourceDialogProps): React.JSX.Element | null {
  if (!source) {
    return null;
  }

  return (
    <div
      className="remove-source-dialog__backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isRemoving) {
          onCancel();
        }
      }}
    >
      <section
        className="remove-source-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-source-dialog-title"
        aria-describedby="remove-source-dialog-description"
      >
        <span className="remove-source-dialog__icon" aria-hidden="true">
          <Trash2 />
        </span>

        <div className="remove-source-dialog__content">
          <span className="remove-source-dialog__eyebrow">Remove library source</span>

          <h2 id="remove-source-dialog-title">Remove “{source.name}” from FilePilot?</h2>

          <p id="remove-source-dialog-description">
            FilePilot will disconnect this folder and permanently delete its locally stored search
            index.
          </p>

          <p className="remove-source-dialog__path" title={source.displayPath}>
            {source.displayPath}
          </p>

          <div className="remove-source-dialog__safety-note">
            <ShieldCheck aria-hidden="true" />

            <p>The real folder and every file inside it will remain untouched on your disk.</p>
          </div>
        </div>

        <div className="remove-source-dialog__actions">
          <Button variant="secondary" disabled={isRemoving} autoFocus onClick={onCancel}>
            Cancel
          </Button>

          <Button
            variant="danger"
            isLoading={isRemoving}
            loadingLabel={`Removing ${source.name}`}
            onClick={() => {
              void onConfirm();
            }}
          >
            <Trash2 aria-hidden="true" />
            Remove from FilePilot
          </Button>
        </div>
      </section>
    </div>
  );
}

interface IndexedSearchResultsPageProps {
  search: IndexedEntrySearchViewState;
  sources: readonly LibrarySource[];
  operations: IndexedEntryOperationViewState;
}

function IndexedSearchResultsPage({
  search,
  sources,
  operations,
}: IndexedSearchResultsPageProps): React.JSX.Element {
  const sourceNames = useMemo(
    () => new Map(sources.map((source) => [source.id, source.name] as const)),
    [sources],
  );

  const isWaitingForResults = search.isSearching || !search.hasCompletedSearch;

  return (
    <div className="workspace indexed-search">
      <header className="workspace__header workspace__header--actions">
        <div>
          <span>Local metadata search</span>
          <h1>Search results</h1>
          <p>
            Results for <strong>“{search.normalizedText}”</strong> are read directly from your
            private local index.
          </p>
        </div>

        <div className="indexed-search__actions">
          <Button
            variant="secondary"
            disabled={search.isSearching}
            onClick={() => {
              void search.refreshSearch();
            }}
          >
            <RefreshCw aria-hidden="true" />
            Refresh
          </Button>

          <Button variant="ghost" onClick={search.clearSearch}>
            <X aria-hidden="true" />
            Clear
          </Button>
        </div>
      </header>

      <IndexedEntryOperationFeedback operations={operations} />

      {search.error ? (
        <p className="workspace__feedback workspace__feedback--error" role="alert">
          {search.error}
        </p>
      ) : null}

      {isWaitingForResults ? (
        <section className="workspace__empty indexed-search__state" aria-busy="true">
          <span className="workspace__loading-indicator" aria-hidden="true" />

          <h2>Searching your local index</h2>
          <p>FilePilot is matching indexed file and folder metadata.</p>
        </section>
      ) : search.error ? null : search.results.length === 0 ? (
        <section className="workspace__empty indexed-search__state">
          <span className="workspace__empty-icon" aria-hidden="true">
            <FileSearch />
          </span>

          <h2>No indexed entries found</h2>

          <p>Try another file name, folder name, extension, or part of an indexed path.</p>
        </section>
      ) : (
        <section
          className="indexed-search__panel"
          aria-label={`Search results for ${search.normalizedText}`}
        >
          <div className="indexed-search__summary">
            <span>
              <strong>{search.total.toLocaleString()}</strong>{' '}
              {search.total === 1 ? 'matching entry' : 'matching entries'}
            </span>

            <span>Names and indexed paths only</span>
          </div>

          <div className="indexed-search__table-wrapper">
            <table className="indexed-search__table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Source</th>
                  <th scope="col">Type</th>
                  <th scope="col">Size</th>
                  <th scope="col">Modified</th>
                  <th scope="col" className="indexed-entry-actions-column">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {search.results.map((entry) => {
                  const EntryIcon = entry.kind === 'directory' ? Folder : FileIcon;

                  return (
                    <tr key={entry.id}>
                      <td>
                        <div className="indexed-search__entry">
                          <span
                            className="indexed-search__entry-icon"
                            data-kind={entry.kind}
                            aria-hidden="true"
                          >
                            <EntryIcon />
                          </span>

                          <span className="indexed-search__entry-content">
                            <strong>{entry.name}</strong>
                            <small title={entry.relativePath}>{entry.relativePath}</small>
                          </span>
                        </div>
                      </td>

                      <td>{sourceNames.get(entry.sourceId) ?? 'Unknown source'}</td>

                      <td>{formatEntryType(entry)}</td>

                      <td>{formatStorageSize(entry.sizeBytes)}</td>

                      <td>
                        <time
                          dateTime={
                            entry.modifiedAtMs === null
                              ? undefined
                              : new Date(entry.modifiedAtMs).toISOString()
                          }
                        >
                          {formatEntryModifiedDate(entry.modifiedAtMs)}
                        </time>
                      </td>

                      <td className="indexed-entry-actions-column">
                        <div
                          className="indexed-entry-actions"
                          aria-busy={operations.isPending(entry.id)}
                        >
                          <IconButton
                            size="small"
                            variant="ghost"
                            icon={<ExternalLink />}
                            aria-label={`Open ${entry.name}`}
                            disabled={
                              entry.availability !== 'available' || operations.isPending(entry.id)
                            }
                            onClick={() => {
                              void operations.openEntry(entry);
                            }}
                          />

                          <IconButton
                            size="small"
                            variant="ghost"
                            icon={<Eye />}
                            aria-label={`Reveal ${entry.name} in file manager`}
                            disabled={
                              entry.availability !== 'available' || operations.isPending(entry.id)
                            }
                            onClick={() => {
                              void operations.revealEntry(entry);
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <footer className="indexed-search__footer">
            Showing {search.results.length.toLocaleString()} of {search.total.toLocaleString()}{' '}
            matching indexed entries
          </footer>
        </section>
      )}
    </div>
  );
}

interface IndexedEntryOperationFeedbackProps {
  operations: IndexedEntryOperationViewState;
  insideBrowser?: boolean;
}

function IndexedEntryOperationFeedback({
  operations,
  insideBrowser = false,
}: IndexedEntryOperationFeedbackProps): React.JSX.Element | null {
  if (!operations.notice && !operations.error) {
    return null;
  }

  return (
    <p
      className={[
        'indexed-entry-operation-feedback',
        operations.error ? 'indexed-entry-operation-feedback--error' : '',
        insideBrowser ? 'indexed-entry-operation-feedback--browser' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role={operations.error ? 'alert' : 'status'}
    >
      {operations.error ?? operations.notice}
    </p>
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
  removingSourceIds: readonly string[];
  notice: string | null;
  error: string | null;
  fileBrowser: IndexedFileBrowserViewState;
  entryOperations: IndexedEntryOperationViewState;
  onAddFolder: () => void;
  onIndexSource: (sourceId: string) => void;
  onRemoveSource: (source: LibrarySource) => void;
}

function LibraryPage({
  sources,
  isLoading,
  isConnecting,
  indexingSourceIds,
  removingSourceIds,
  notice,
  error,
  fileBrowser,
  entryOperations,
  onAddFolder,
  onIndexSource,
  onRemoveSource,
}: LibraryPageProps): React.JSX.Element {
  const activeBrowserSourceId = fileBrowser.selectedSourceId ?? fileBrowser.loadingSourceId;

  const selectedSource = sources.find((source) => source.id === activeBrowserSourceId) ?? null;

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
        <>
          <section className="library-source-grid" aria-label="Connected folders">
            {sources.map((source) => (
              <LibrarySourceCard
                key={source.id}
                source={source}
                isIndexing={indexingSourceIds.includes(source.id)}
                isRemoving={removingSourceIds.includes(source.id)}
                isBrowsing={fileBrowser.loadingSourceId === source.id}
                onBrowseSource={fileBrowser.openSource}
                onIndexSource={onIndexSource}
                onRemoveSource={onRemoveSource}
              />
            ))}
          </section>

          {fileBrowser.isOpen || fileBrowser.isLoading || fileBrowser.error ? (
            <IndexedFileBrowser
              source={selectedSource}
              browser={fileBrowser}
              operations={entryOperations}
            />
          ) : null}
        </>
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
  isRemoving: boolean;
  isBrowsing: boolean;
  onBrowseSource: (sourceId: string) => Promise<void>;
  onIndexSource: (sourceId: string) => void;
  onRemoveSource: (source: LibrarySource) => void;
}

function LibrarySourceCard({
  source,
  isIndexing,
  isRemoving,
  isBrowsing,
  onBrowseSource,
  onIndexSource,
  onRemoveSource,
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

        <div className="library-source__button-stack">
          <Button
            className="library-source__browse-button"
            size="medium"
            variant="secondary"
            fullWidth
            disabled={!hasBeenIndexed || source.access !== 'available' || isIndexing || isRemoving}
            isLoading={isBrowsing}
            loadingLabel={`Opening ${source.name}`}
            onClick={() => {
              void onBrowseSource(source.id);
            }}
          >
            <FolderOpen aria-hidden="true" />
            Browse files
          </Button>

          <Button
            className="library-source__index-button"
            size="medium"
            variant="primary"
            fullWidth
            disabled={source.access !== 'available' || isBrowsing || isRemoving}
            isLoading={isIndexing}
            loadingLabel={`Indexing ${source.name}`}
            onClick={() => {
              onIndexSource(source.id);
            }}
          >
            <RefreshCw aria-hidden="true" />
            {hasBeenIndexed ? 'Refresh index' : 'Index now'}
          </Button>

          <Button
            className="library-source__remove-button"
            size="medium"
            variant="danger"
            fullWidth
            disabled={isIndexing || isBrowsing}
            isLoading={isRemoving}
            loadingLabel={`Removing ${source.name}`}
            onClick={() => {
              onRemoveSource(source);
            }}
          >
            <Trash2 aria-hidden="true" />
            Remove folder
          </Button>
        </div>
      </div>
    </article>
  );
}

function formatEntryModifiedDate(timestampMs: number | null): string {
  if (timestampMs === null) {
    return 'Unknown';
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestampMs));
}

function formatEntryType(entry: FileEntry): string {
  if (entry.kind === 'directory') {
    return 'Folder';
  }

  return entry.extension ? `${entry.extension.toUpperCase()} file` : 'File';
}

interface IndexedFileBrowserProps {
  source: LibrarySource | null;
  browser: IndexedFileBrowserViewState;
  operations: IndexedEntryOperationViewState;
}

function IndexedFileBrowser({
  source,
  browser,
  operations,
}: IndexedFileBrowserProps): React.JSX.Element {
  const sourceName = source?.name ?? 'Indexed files';

  return (
    <section className="indexed-browser" aria-label={`Indexed files for ${sourceName}`}>
      <header className="indexed-browser__header">
        <div className="indexed-browser__heading">
          <span className="indexed-browser__eyebrow">
            <FolderOpen aria-hidden="true" />
            Indexed files
          </span>

          <h2>{sourceName}</h2>
          <p>Browse locally stored metadata without uploading file contents.</p>
        </div>

        <Button
          className="indexed-browser__close-button"
          size="small"
          variant="ghost"
          aria-label="Close indexed file browser"
          onClick={browser.closeBrowser}
        >
          <X aria-hidden="true" />
          Close
        </Button>
      </header>

      <div className="indexed-browser__toolbar">
        <div className="indexed-browser__navigation-actions">
          <Button
            className="indexed-browser__toolbar-button"
            size="small"
            variant="ghost"
            disabled={!browser.canNavigateBack || browser.isLoading}
            onClick={() => {
              void browser.navigateBack();
            }}
          >
            <ArrowLeft aria-hidden="true" />
            Back
          </Button>

          <Button
            className="indexed-browser__toolbar-button"
            size="small"
            variant="ghost"
            disabled={browser.selectedSourceId === null || browser.isLoading}
            onClick={() => {
              void browser.refreshDirectory();
            }}
          >
            <RefreshCw aria-hidden="true" />
            Refresh
          </Button>
        </div>

        <nav className="indexed-browser__breadcrumbs" aria-label="Current indexed directory">
          <span>{sourceName}</span>

          {browser.navigationPath.map((directory) => (
            <span key={directory.id}>
              <ChevronRight aria-hidden="true" />
              {directory.name}
            </span>
          ))}
        </nav>

        <span className="indexed-browser__count">
          {browser.total.toLocaleString()} {browser.total === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      <IndexedEntryOperationFeedback operations={operations} insideBrowser />

      {browser.error ? (
        <p className="indexed-browser__error" role="alert">
          {browser.error}
        </p>
      ) : null}

      {browser.isLoading ? (
        <div className="indexed-browser__loading" aria-busy="true">
          <span className="workspace__loading-indicator" aria-hidden="true" />
          <strong>Loading indexed files</strong>
          <p>FilePilot is reading metadata from the local index.</p>
        </div>
      ) : browser.entries.length === 0 ? (
        <div className="indexed-browser__empty">
          <FolderOpen aria-hidden="true" />
          <strong>This folder is empty</strong>
          <p>No indexed files or folders were found at this level.</p>
        </div>
      ) : (
        <div className="indexed-browser__table-wrapper">
          <table className="indexed-browser__table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Type</th>
                <th scope="col">Size</th>
                <th scope="col">Modified</th>
                <th scope="col" className="indexed-entry-actions-column">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
              {browser.entries.map((entry) => {
                const EntryIcon = entry.kind === 'directory' ? Folder : FileIcon;

                return (
                  <tr key={entry.id}>
                    <td>
                      {entry.kind === 'directory' ? (
                        <button
                          type="button"
                          className="indexed-browser__entry-button"
                          onClick={() => {
                            void browser.openDirectory(entry);
                          }}
                        >
                          <span
                            className="indexed-browser__entry-icon"
                            data-kind={entry.kind}
                            aria-hidden="true"
                          >
                            <EntryIcon />
                          </span>

                          <span>
                            <strong>{entry.name}</strong>
                            <small title={entry.relativePath}>{entry.relativePath}</small>
                          </span>
                        </button>
                      ) : (
                        <div className="indexed-browser__entry">
                          <span
                            className="indexed-browser__entry-icon"
                            data-kind={entry.kind}
                            aria-hidden="true"
                          >
                            <EntryIcon />
                          </span>

                          <span>
                            <strong>{entry.name}</strong>
                            <small title={entry.relativePath}>{entry.relativePath}</small>
                          </span>
                        </div>
                      )}
                    </td>

                    <td>{formatEntryType(entry)}</td>

                    <td>{formatStorageSize(entry.sizeBytes)}</td>

                    <td>
                      <time
                        dateTime={
                          entry.modifiedAtMs === null
                            ? undefined
                            : new Date(entry.modifiedAtMs).toISOString()
                        }
                      >
                        {formatEntryModifiedDate(entry.modifiedAtMs)}
                      </time>
                    </td>

                    <td className="indexed-entry-actions-column">
                      <div
                        className="indexed-entry-actions"
                        aria-busy={operations.isPending(entry.id)}
                      >
                        <IconButton
                          size="small"
                          variant="ghost"
                          icon={<ExternalLink />}
                          aria-label={`Open ${entry.name}`}
                          disabled={
                            entry.availability !== 'available' || operations.isPending(entry.id)
                          }
                          onClick={() => {
                            void operations.openEntry(entry);
                          }}
                        />

                        <IconButton
                          size="small"
                          variant="ghost"
                          icon={<Eye />}
                          aria-label={`Reveal ${entry.name} in file manager`}
                          disabled={
                            entry.availability !== 'available' || operations.isPending(entry.id)
                          }
                          onClick={() => {
                            void operations.revealEntry(entry);
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!browser.isLoading && browser.entries.length > 0 ? (
        <footer className="indexed-browser__footer">
          Showing {browser.entries.length.toLocaleString()} of {browser.total.toLocaleString()}{' '}
          indexed entries
        </footer>
      ) : null}
    </section>
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

      <div className="stat-card__content">
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
