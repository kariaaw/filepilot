import { useCallback, useEffect, useRef, useState } from 'react';

import type { FileEntry } from '@/core/entities/file-entry';
import type { LibraryWorkspace } from '@/features/library/application';

const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_RESULT_LIMIT = 100;

type IndexedEntrySearchWorkspace = Pick<LibraryWorkspace, 'searchEntries'>;

export interface IndexedEntrySearchViewState {
  text: string;
  normalizedText: string;
  results: readonly FileEntry[];
  total: number;

  hasSearchText: boolean;
  hasCompletedSearch: boolean;
  isSearching: boolean;
  error: string | null;

  setText: (text: string) => void;
  refreshSearch: () => Promise<void>;
  clearSearch: () => void;
}

function normalizeSearchText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

function resolveSearchErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }

  return 'FilePilot could not search the local file index.';
}

/**
 * React presentation adapter for searching locally indexed metadata.
 *
 * Searches are debounced while typing, and request identifiers prevent slower
 * previous queries from replacing newer results.
 */
export function useIndexedEntrySearch(
  workspace: IndexedEntrySearchWorkspace,
): IndexedEntrySearchViewState {
  const [text, setTextState] = useState('');
  const [completedText, setCompletedText] = useState('');
  const [results, setResults] = useState<readonly FileEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef(false);
  const requestIdRef = useRef(0);
  const textRef = useRef('');

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  const performSearch = useCallback(
    async (normalizedText: string, requestId: number): Promise<void> => {
      try {
        const result = await workspace.searchEntries({
          text: normalizedText,
          offset: 0,
          limit: SEARCH_RESULT_LIMIT,
        });

        if (!isMountedRef.current || requestId !== requestIdRef.current) {
          return;
        }

        setCompletedText(result.text);
        setResults(result.items);
        setTotal(result.total);
        setError(null);
      } catch (searchError) {
        if (!isMountedRef.current || requestId !== requestIdRef.current) {
          return;
        }

        setCompletedText(normalizedText);
        setResults([]);
        setTotal(0);
        setError(resolveSearchErrorMessage(searchError));
      } finally {
        if (isMountedRef.current && requestId === requestIdRef.current) {
          setIsSearching(false);
        }
      }
    },
    [workspace],
  );

  useEffect(() => {
    const normalizedText = normalizeSearchText(text);

    if (!normalizedText) {
      requestIdRef.current += 1;

      setCompletedText('');
      setResults([]);
      setTotal(0);
      setIsSearching(false);
      setError(null);

      return;
    }

    const requestId = requestIdRef.current + 1;

    requestIdRef.current = requestId;

    setIsSearching(true);
    setError(null);

    const timeoutId = window.setTimeout(() => {
      void performSearch(normalizedText, requestId);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [performSearch, text]);

  const setText = useCallback((nextText: string): void => {
    textRef.current = nextText;
    setTextState(nextText);
  }, []);

  const refreshSearch = useCallback(async (): Promise<void> => {
    const normalizedText = normalizeSearchText(textRef.current);

    if (!normalizedText) {
      return;
    }

    const requestId = requestIdRef.current + 1;

    requestIdRef.current = requestId;

    setIsSearching(true);
    setError(null);

    await performSearch(normalizedText, requestId);
  }, [performSearch]);

  const clearSearch = useCallback((): void => {
    requestIdRef.current += 1;
    textRef.current = '';

    setTextState('');
    setCompletedText('');
    setResults([]);
    setTotal(0);
    setIsSearching(false);
    setError(null);
  }, []);

  const normalizedText = normalizeSearchText(text);

  return {
    text,
    normalizedText,
    results,
    total,

    hasSearchText: normalizedText.length > 0,
    hasCompletedSearch:
      normalizedText.length > 0 && normalizedText === completedText && !isSearching,
    isSearching,
    error,

    setText,
    refreshSearch,
    clearSearch,
  };
}
