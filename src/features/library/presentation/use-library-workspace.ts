import { useCallback, useEffect, useRef, useState } from 'react';

import type { LibrarySource } from '@/core/entities/library-source';
import type { LibraryWorkspace } from '@/features/library/application';

export interface LibraryWorkspaceViewState {
  sources: readonly LibrarySource[];
  total: number;
  isLoading: boolean;
  isConnecting: boolean;

  /**
   * Contains the IDs of sources currently being indexed.
   *
   * An array keeps the presentation contract serializable and simple for
   * React components, while the hook internally uses a Set for fast checks.
   */
  indexingSourceIds: readonly string[];

  /**
   * Contains the IDs of sources currently being removed.
   */
  removingSourceIds: readonly string[];

  notice: string | null;
  error: string | null;

  connectDirectory: () => Promise<void>;
  indexSource: (sourceId: string) => Promise<void>;
  removeSource: (sourceId: string) => Promise<boolean>;
}

function resolveErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }

  if (typeof error === 'object' && error !== null) {
    const errorRecord = error as Record<string, unknown>;

    for (const key of ['message', 'error', 'cause', 'code']) {
      const value = errorRecord[key];

      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    try {
      const serializedError = JSON.stringify(error);

      if (serializedError && serializedError !== '{}') {
        return serializedError;
      }
    } catch {
      // Continue to the generic string conversion.
    }
  }

  try {
    const convertedError = String(error).trim();

    if (
      convertedError &&
      convertedError !== '[object Object]' &&
      convertedError !== 'undefined' &&
      convertedError !== 'null'
    ) {
      return convertedError;
    }
  } catch {
    return fallbackMessage;
  }

  return fallbackMessage;
}

function createIndexingNotice(source: LibrarySource): string {
  const fileLabel = source.statistics.fileCount === 1 ? 'file' : 'files';

  const directoryLabel = source.statistics.directoryCount === 1 ? 'folder' : 'folders';

  return [
    `Folder "${source.name}" was indexed successfully.`,
    `${source.statistics.fileCount.toLocaleString()} ${fileLabel}`,
    `and ${source.statistics.directoryCount.toLocaleString()} ${directoryLabel}`,
    'are ready.',
  ].join(' ');
}

function createRemovalNotice(source: LibrarySource): string {
  return [
    `Folder "${source.name}" was removed from FilePilot.`,
    'Its local index was deleted, but files and folders on disk were not changed.',
  ].join(' ');
}

/**
 * React presentation adapter for the Library workspace facade.
 *
 * Components receive stable UI state without importing persistence or native
 * platform infrastructure directly.
 */
export function useLibraryWorkspace(
  workspace: Pick<
    LibraryWorkspace,
    'loadSources' | 'connectDirectory' | 'indexSource' | 'removeSource'
  >,
): LibraryWorkspaceViewState {
  const [sources, setSources] = useState<readonly LibrarySource[]>([]);

  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const [isConnecting, setIsConnecting] = useState(false);

  const [indexingSourceIds, setIndexingSourceIds] = useState<readonly string[]>([]);

  const [removingSourceIds, setRemovingSourceIds] = useState<readonly string[]>([]);

  const [notice, setNotice] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef(false);
  const isConnectingRef = useRef(false);

  const indexingSourceIdsRef = useRef(new Set<string>());

  const removingSourceIdsRef = useRef(new Set<string>());

  useEffect(() => {
    isMountedRef.current = true;

    async function loadInitialSources(): Promise<void> {
      setIsLoading(true);
      setError(null);

      try {
        const snapshot = await workspace.loadSources();

        if (!isMountedRef.current) {
          return;
        }

        setSources(snapshot.sources);
        setTotal(snapshot.total);
      } catch (loadError) {
        if (isMountedRef.current) {
          setError(
            resolveErrorMessage(loadError, 'FilePilot could not load the connected folders.'),
          );
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    }

    void loadInitialSources();

    return () => {
      isMountedRef.current = false;
    };
  }, [workspace]);

  const connectDirectory = useCallback(async (): Promise<void> => {
    if (isConnectingRef.current) {
      return;
    }

    isConnectingRef.current = true;
    setIsConnecting(true);
    setNotice(null);
    setError(null);

    try {
      const snapshot = await workspace.connectDirectory();

      if (!isMountedRef.current) {
        return;
      }

      setSources(snapshot.sources);
      setTotal(snapshot.total);

      switch (snapshot.connection.status) {
        case 'created':
          setNotice(`Folder "${snapshot.connection.source.name}" was connected successfully.`);
          break;

        case 'reconnected':
          setNotice(`Folder "${snapshot.connection.source.name}" was reconnected successfully.`);
          break;

        case 'cancelled':
          break;
      }
    } catch (connectionError) {
      if (isMountedRef.current) {
        setError(
          resolveErrorMessage(connectionError, 'FilePilot could not connect the selected folder.'),
        );
      }
    } finally {
      isConnectingRef.current = false;

      if (isMountedRef.current) {
        setIsConnecting(false);
      }
    }
  }, [workspace]);

  const indexSource = useCallback(
    async (sourceId: string): Promise<void> => {
      const normalizedSourceId = sourceId.trim();

      if (!normalizedSourceId || indexingSourceIdsRef.current.has(normalizedSourceId)) {
        return;
      }

      indexingSourceIdsRef.current.add(normalizedSourceId);

      setIndexingSourceIds([...indexingSourceIdsRef.current]);

      setNotice(null);
      setError(null);

      try {
        const snapshot = await workspace.indexSource(normalizedSourceId);

        if (!isMountedRef.current) {
          return;
        }

        setSources(snapshot.sources);
        setTotal(snapshot.total);

        setNotice(createIndexingNotice(snapshot.indexing.source));
      } catch (indexingError) {
        if (isMountedRef.current) {
          setError(
            resolveErrorMessage(indexingError, 'FilePilot could not index the selected folder.'),
          );
        }
      } finally {
        indexingSourceIdsRef.current.delete(normalizedSourceId);

        if (isMountedRef.current) {
          setIndexingSourceIds([...indexingSourceIdsRef.current]);
        }
      }
    },
    [workspace],
  );

  const removeSource = useCallback(
    async (sourceId: string): Promise<boolean> => {
      const normalizedSourceId = sourceId.trim();

      if (!normalizedSourceId || removingSourceIdsRef.current.has(normalizedSourceId)) {
        return false;
      }

      if (indexingSourceIdsRef.current.has(normalizedSourceId)) {
        setNotice(null);
        setError('Wait for the active indexing operation to finish before removing this folder.');

        return false;
      }

      removingSourceIdsRef.current.add(normalizedSourceId);
      setRemovingSourceIds([...removingSourceIdsRef.current]);

      setNotice(null);
      setError(null);

      try {
        const snapshot = await workspace.removeSource(normalizedSourceId);

        if (!isMountedRef.current) {
          return false;
        }

        setSources(snapshot.sources);
        setTotal(snapshot.total);
        setNotice(createRemovalNotice(snapshot.removal.source));

        return true;
      } catch (removalError) {
        if (isMountedRef.current) {
          setError(
            resolveErrorMessage(
              removalError,
              'FilePilot could not remove the selected folder from the Library.',
            ),
          );
        }

        return false;
      } finally {
        removingSourceIdsRef.current.delete(normalizedSourceId);

        if (isMountedRef.current) {
          setRemovingSourceIds([...removingSourceIdsRef.current]);
        }
      }
    },
    [workspace],
  );

  return {
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
  };
}
