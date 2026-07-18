import { useCallback, useEffect, useRef, useState } from 'react';

import type { FileEntry } from '@/core/entities/file-entry';
import type { IndexedEntryOpenOperation, LibraryWorkspace } from '@/features/library/application';

type IndexedEntryOperationWorkspace = Pick<LibraryWorkspace, 'openEntry'>;

export interface IndexedEntryOperationViewState {
  pendingEntryIds: readonly string[];
  notice: string | null;
  error: string | null;

  isPending: (entryId: string) => boolean;
  openEntry: (entry: FileEntry) => Promise<void>;
  revealEntry: (entry: FileEntry) => Promise<void>;
}

function resolveOperationErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }

  return 'FilePilot could not complete the selected file operation.';
}

/**
 * React presentation adapter for native indexed-entry operations.
 *
 * Components receive entry-level actions and feedback state while native
 * paths, Tauri permissions, and operating-system APIs remain behind the
 * LibraryWorkspace application facade.
 */
export function useIndexedEntryOperations(
  workspace: IndexedEntryOperationWorkspace,
): IndexedEntryOperationViewState {
  const [pendingEntryIds, setPendingEntryIds] = useState<readonly string[]>([]);

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef(false);
  const pendingEntryIdsRef = useRef(new Set<string>());

  useEffect(() => {
    const pendingEntryIds = pendingEntryIdsRef.current;

    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      pendingEntryIds.clear();
    };
  }, []);

  const executeOperation = useCallback(
    async (entry: FileEntry, operation: IndexedEntryOpenOperation): Promise<void> => {
      if (pendingEntryIdsRef.current.has(entry.id)) {
        return;
      }

      pendingEntryIdsRef.current.add(entry.id);

      setPendingEntryIds(Array.from(pendingEntryIdsRef.current));

      setNotice(null);
      setError(null);

      try {
        await workspace.openEntry({
          entryId: entry.id,
          operation,
        });

        if (!isMountedRef.current) {
          return;
        }

        setNotice(
          operation === 'open'
            ? `Opened “${entry.name}” with the operating system.`
            : `Revealed “${entry.name}” in the file manager.`,
        );
      } catch (operationError) {
        if (isMountedRef.current) {
          setError(resolveOperationErrorMessage(operationError));
        }
      } finally {
        pendingEntryIdsRef.current.delete(entry.id);

        if (isMountedRef.current) {
          setPendingEntryIds(Array.from(pendingEntryIdsRef.current));
        }
      }
    },
    [workspace],
  );

  const openEntry = useCallback(
    async (entry: FileEntry): Promise<void> => {
      await executeOperation(entry, 'open');
    },
    [executeOperation],
  );

  const revealEntry = useCallback(
    async (entry: FileEntry): Promise<void> => {
      await executeOperation(entry, 'reveal');
    },
    [executeOperation],
  );

  const isPending = useCallback(
    (entryId: string): boolean => pendingEntryIds.includes(entryId),
    [pendingEntryIds],
  );

  return {
    pendingEntryIds,
    notice,
    error,

    isPending,
    openEntry,
    revealEntry,
  };
}
