import { useCallback, useEffect, useRef, useState } from 'react';

import type { FileEntry } from '@/core/entities/file-entry';
import type {
  LibraryWorkspace,
  PreviewIndexedTextEntryResult,
} from '@/features/library/application';

type IndexedTextPreviewWorkspace = Pick<LibraryWorkspace, 'previewTextEntry'>;

export interface IndexedTextPreviewViewState {
  preview: PreviewIndexedTextEntryResult | null;
  loadingEntryId: string | null;
  error: string | null;

  canPreview: (entry: FileEntry) => boolean;
  isPreviewing: (entryId: string) => boolean;
  previewEntry: (entry: FileEntry) => Promise<void>;
  clearPreview: () => void;
}

function supportsTextPreview(entry: FileEntry): boolean {
  return (
    entry.kind === 'file' &&
    entry.availability === 'available' &&
    (entry.category === 'text' || entry.category === 'code')
  );
}

function resolvePreviewErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }

  return 'FilePilot could not load the local text preview.';
}

function isCancellationError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/**
 * React presentation adapter for bounded local text previews.
 *
 * A new request cancels the previous native read. Request identifiers also
 * prevent slower stale results from replacing the currently selected entry.
 */
export function useIndexedTextPreview(
  workspace: IndexedTextPreviewWorkspace,
): IndexedTextPreviewViewState {
  const [preview, setPreview] = useState<PreviewIndexedTextEntryResult | null>(null);

  const [loadingEntryId, setLoadingEntryId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef(false);
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      requestIdRef.current += 1;

      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, []);

  const clearPreview = useCallback((): void => {
    requestIdRef.current += 1;

    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    if (!isMountedRef.current) {
      return;
    }

    setPreview(null);
    setLoadingEntryId(null);
    setError(null);
  }, []);

  const previewEntry = useCallback(
    async (entry: FileEntry): Promise<void> => {
      if (!supportsTextPreview(entry)) {
        clearPreview();

        if (isMountedRef.current) {
          setError('Only available indexed text and code files can be previewed.');
        }

        return;
      }

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      abortControllerRef.current?.abort();

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setPreview(null);
      setLoadingEntryId(entry.id);
      setError(null);

      try {
        const result = await workspace.previewTextEntry({
          entryId: entry.id,
          signal: controller.signal,
        });

        if (!isMountedRef.current || requestId !== requestIdRef.current) {
          return;
        }

        setPreview(result);
        setError(null);
      } catch (previewError) {
        if (
          !isMountedRef.current ||
          requestId !== requestIdRef.current ||
          isCancellationError(previewError)
        ) {
          return;
        }

        setPreview(null);
        setError(resolvePreviewErrorMessage(previewError));
      } finally {
        if (isMountedRef.current && requestId === requestIdRef.current) {
          setLoadingEntryId(null);

          if (abortControllerRef.current === controller) {
            abortControllerRef.current = null;
          }
        }
      }
    },
    [clearPreview, workspace],
  );

  const canPreview = useCallback((entry: FileEntry): boolean => supportsTextPreview(entry), []);

  const isPreviewing = useCallback(
    (entryId: string): boolean => loadingEntryId === entryId,
    [loadingEntryId],
  );

  return {
    preview,
    loadingEntryId,
    error,

    canPreview,
    isPreviewing,
    previewEntry,
    clearPreview,
  };
}
