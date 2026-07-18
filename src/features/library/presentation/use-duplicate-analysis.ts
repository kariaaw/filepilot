import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  AnalyzeDuplicateFilesResult,
  DuplicateAnalysisProgress,
  LibraryWorkspace,
} from '@/features/library/application';

type DuplicateAnalysisWorkspace = Pick<LibraryWorkspace, 'analyzeDuplicates'>;

export interface DuplicateAnalysisViewState {
  result: AnalyzeDuplicateFilesResult | null;
  progress: DuplicateAnalysisProgress | null;

  isAnalyzing: boolean;
  hasCompletedAnalysis: boolean;
  error: string | null;

  analyzeDuplicates: () => Promise<void>;
  cancelAnalysis: () => void;
  clearAnalysis: () => void;
}

function resolveDuplicateAnalysisError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }

  return 'FilePilot could not complete the local duplicate-file analysis.';
}

function isCancellationError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/**
 * React presentation adapter for exact duplicate-file analysis.
 *
 * Only SHA-256 values and indexed metadata reach React. Native paths and file
 * content remain inside the infrastructure and Rust layers.
 */
export function useDuplicateAnalysis(
  workspace: DuplicateAnalysisWorkspace,
): DuplicateAnalysisViewState {
  const [result, setResult] = useState<AnalyzeDuplicateFilesResult | null>(null);

  const [progress, setProgress] = useState<DuplicateAnalysisProgress | null>(null);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
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

  const analyzeDuplicates = useCallback(async (): Promise<void> => {
    abortControllerRef.current?.abort();

    const controller = new AbortController();
    const requestId = requestIdRef.current + 1;

    abortControllerRef.current = controller;
    requestIdRef.current = requestId;

    setIsAnalyzing(true);
    setError(null);
    setProgress(null);

    try {
      const nextResult = await workspace.analyzeDuplicates({
        signal: controller.signal,

        onProgress: (nextProgress) => {
          if (
            !isMountedRef.current ||
            controller.signal.aborted ||
            requestId !== requestIdRef.current
          ) {
            return;
          }

          setProgress(nextProgress);
        },
      });

      if (
        !isMountedRef.current ||
        controller.signal.aborted ||
        requestId !== requestIdRef.current
      ) {
        return;
      }

      setResult(nextResult);
      setError(null);
    } catch (analysisError) {
      if (
        !isMountedRef.current ||
        requestId !== requestIdRef.current ||
        isCancellationError(analysisError)
      ) {
        return;
      }

      setResult(null);
      setError(resolveDuplicateAnalysisError(analysisError));
    } finally {
      if (isMountedRef.current && requestId === requestIdRef.current) {
        abortControllerRef.current = null;
        setIsAnalyzing(false);
      }
    }
  }, [workspace]);

  const cancelAnalysis = useCallback((): void => {
    if (abortControllerRef.current === null) {
      return;
    }

    abortControllerRef.current.abort();
    abortControllerRef.current = null;

    requestIdRef.current += 1;

    setIsAnalyzing(false);
    setError(null);
  }, []);

  const clearAnalysis = useCallback((): void => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    requestIdRef.current += 1;

    setResult(null);
    setProgress(null);
    setIsAnalyzing(false);
    setError(null);
  }, []);

  return {
    result,
    progress,

    isAnalyzing,
    hasCompletedAnalysis: result !== null,
    error,

    analyzeDuplicates,
    cancelAnalysis,
    clearAnalysis,
  };
}
