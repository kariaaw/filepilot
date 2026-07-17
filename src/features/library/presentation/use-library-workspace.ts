import { useCallback, useEffect, useRef, useState } from 'react';

import type { LibrarySource } from '@/core/entities/library-source';
import type { LibraryWorkspace } from '@/features/library/application';

export interface LibraryWorkspaceViewState {
  sources: readonly LibrarySource[];
  total: number;
  isLoading: boolean;
  isConnecting: boolean;
  notice: string | null;
  error: string | null;
  connectDirectory: () => Promise<void>;
}

function resolveErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return 'FilePilot could not connect the selected folder.';
}

/**
 * React presentation adapter for the Library workspace facade.
 *
 * Components receive stable UI state without importing persistence or native
 * platform infrastructure directly.
 */
export function useLibraryWorkspace(
  workspace: Pick<LibraryWorkspace, 'loadSources' | 'connectDirectory'>,
): LibraryWorkspaceViewState {
  const [sources, setSources] = useState<readonly LibrarySource[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef(false);
  const isConnectingRef = useRef(false);

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
          setError(resolveErrorMessage(loadError));
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
        setError(resolveErrorMessage(connectionError));
      }
    } finally {
      isConnectingRef.current = false;

      if (isMountedRef.current) {
        setIsConnecting(false);
      }
    }
  }, [workspace]);

  return {
    sources,
    total,
    isLoading,
    isConnecting,
    notice,
    error,
    connectDirectory,
  };
}
