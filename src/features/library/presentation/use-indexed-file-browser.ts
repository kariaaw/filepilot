import { useCallback, useEffect, useRef, useState } from 'react';

import type { FileEntry } from '@/core/entities/file-entry';
import type { LibraryWorkspace } from '@/features/library/application';

const DIRECTORY_PAGE_LIMIT = 200;

export interface IndexedFileBrowserViewState {
  selectedSourceId: string | null;
  currentDirectory: FileEntry | null;
  navigationPath: readonly FileEntry[];
  entries: readonly FileEntry[];
  total: number;

  isOpen: boolean;
  isLoading: boolean;
  loadingSourceId: string | null;
  canNavigateBack: boolean;

  error: string | null;

  openSource: (sourceId: string) => Promise<void>;
  openDirectory: (directory: FileEntry) => Promise<void>;
  navigateBack: () => Promise<void>;
  refreshDirectory: () => Promise<void>;
  closeBrowser: () => void;
}

type IndexedFileBrowserWorkspace = Pick<LibraryWorkspace, 'browseDirectory'>;

function resolveBrowserErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }

  return 'FilePilot could not load the selected indexed directory.';
}

/**
 * React presentation adapter for navigating indexed FileEntry records.
 *
 * The hook owns only UI navigation state. IndexedDB access remains isolated
 * behind the LibraryWorkspace application facade.
 */
export function useIndexedFileBrowser(
  workspace: IndexedFileBrowserWorkspace,
): IndexedFileBrowserViewState {
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);

  const [currentDirectory, setCurrentDirectory] = useState<FileEntry | null>(null);

  const [navigationPath, setNavigationPath] = useState<readonly FileEntry[]>([]);

  const [entries, setEntries] = useState<readonly FileEntry[]>([]);

  const [total, setTotal] = useState(0);

  const [isLoading, setIsLoading] = useState(false);

  const [loadingSourceId, setLoadingSourceId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef(false);

  const requestIdRef = useRef(0);

  const selectedSourceIdRef = useRef<string | null>(null);

  const navigationPathRef = useRef<readonly FileEntry[]>([]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  const loadDirectory = useCallback(
    async (
      sourceId: string,
      parentId: string | null,
      nextNavigationPath: readonly FileEntry[],
    ): Promise<void> => {
      const requestId = requestIdRef.current + 1;

      requestIdRef.current = requestId;

      setIsLoading(true);
      setLoadingSourceId(sourceId);
      setError(null);

      try {
        const result = await workspace.browseDirectory({
          sourceId,
          parentId,
          offset: 0,
          limit: DIRECTORY_PAGE_LIMIT,
        });

        if (!isMountedRef.current || requestId !== requestIdRef.current) {
          return;
        }

        selectedSourceIdRef.current = result.sourceId;
        navigationPathRef.current = nextNavigationPath;

        setSelectedSourceId(result.sourceId);
        setCurrentDirectory(result.currentDirectory);
        setNavigationPath(nextNavigationPath);
        setEntries(result.items);
        setTotal(result.total);
      } catch (loadError) {
        if (isMountedRef.current && requestId === requestIdRef.current) {
          setError(resolveBrowserErrorMessage(loadError));
        }
      } finally {
        if (isMountedRef.current && requestId === requestIdRef.current) {
          setIsLoading(false);
          setLoadingSourceId(null);
        }
      }
    },
    [workspace],
  );

  const openSource = useCallback(
    async (sourceId: string): Promise<void> => {
      const normalizedSourceId = sourceId.trim();

      if (!normalizedSourceId) {
        setError('A library source identifier is required.');
        return;
      }

      await loadDirectory(normalizedSourceId, null, []);
    },
    [loadDirectory],
  );

  const openDirectory = useCallback(
    async (directory: FileEntry): Promise<void> => {
      const sourceId = selectedSourceIdRef.current;

      if (!sourceId) {
        setError('Open a library source before selecting a directory.');
        return;
      }

      if (directory.kind !== 'directory') {
        setError('Only indexed directories can be opened in the file browser.');
        return;
      }

      if (directory.sourceId !== sourceId) {
        setError('The selected directory belongs to a different library source.');
        return;
      }

      await loadDirectory(sourceId, directory.id, [...navigationPathRef.current, directory]);
    },
    [loadDirectory],
  );

  const navigateBack = useCallback(async (): Promise<void> => {
    const sourceId = selectedSourceIdRef.current;
    const currentPath = navigationPathRef.current;

    if (!sourceId || currentPath.length === 0) {
      return;
    }

    const nextNavigationPath = currentPath.slice(0, -1);

    const parentId = nextNavigationPath[nextNavigationPath.length - 1]?.id ?? null;

    await loadDirectory(sourceId, parentId, nextNavigationPath);
  }, [loadDirectory]);

  const refreshDirectory = useCallback(async (): Promise<void> => {
    const sourceId = selectedSourceIdRef.current;

    if (!sourceId) {
      return;
    }

    const currentPath = navigationPathRef.current;

    const parentId = currentPath[currentPath.length - 1]?.id ?? null;

    await loadDirectory(sourceId, parentId, currentPath);
  }, [loadDirectory]);

  const closeBrowser = useCallback((): void => {
    requestIdRef.current += 1;

    selectedSourceIdRef.current = null;
    navigationPathRef.current = [];

    setSelectedSourceId(null);
    setCurrentDirectory(null);
    setNavigationPath([]);
    setEntries([]);
    setTotal(0);
    setIsLoading(false);
    setLoadingSourceId(null);
    setError(null);
  }, []);

  return {
    selectedSourceId,
    currentDirectory,
    navigationPath,
    entries,
    total,

    isOpen: selectedSourceId !== null,
    isLoading,
    loadingSourceId,
    canNavigateBack: navigationPath.length > 0,

    error,

    openSource,
    openDirectory,
    navigateBack,
    refreshDirectory,
    closeBrowser,
  };
}
