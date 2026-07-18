// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  AnalyzeDuplicateFilesOptions,
  AnalyzeDuplicateFilesResult,
  DuplicateAnalysisProgress,
  LibraryWorkspace,
} from '@/features/library/application';
import { useDuplicateAnalysis } from '@/features/library/presentation/use-duplicate-analysis';

type DuplicateAnalysisWorkspace = Pick<LibraryWorkspace, 'analyzeDuplicates'>;

const COMPLETE_PROGRESS: DuplicateAnalysisProgress = {
  phase: 'complete',
  candidateFileCount: 4,
  processedFileCount: 4,
  hashedFileCount: 3,
  reusedHashCount: 1,
  currentEntryId: null,
};

const ANALYSIS_RESULT: AnalyzeDuplicateFilesResult = {
  groups: [],
  candidateFileCount: 4,
  hashedFileCount: 3,
  reusedHashCount: 1,
  duplicateGroupCount: 0,
  duplicateFileCount: 0,
  totalDuplicateBytes: 0,
  reclaimableBytes: 0,
};

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return {
    promise,
    resolve,
    reject,
  };
}

afterEach(() => {
  cleanup();
});

describe('useDuplicateAnalysis', () => {
  it('reports progress and stores a completed duplicate analysis', async () => {
    const analyzeDuplicates = vi.fn(
      async (options: AnalyzeDuplicateFilesOptions = {}): Promise<AnalyzeDuplicateFilesResult> => {
        options.onProgress?.(COMPLETE_PROGRESS);

        return ANALYSIS_RESULT;
      },
    );

    const workspace: DuplicateAnalysisWorkspace = {
      analyzeDuplicates,
    };

    const { result } = renderHook(() => useDuplicateAnalysis(workspace));

    await act(async () => {
      await result.current.analyzeDuplicates();
    });

    expect(analyzeDuplicates).toHaveBeenCalledTimes(1);

    expect(analyzeDuplicates).toHaveBeenCalledWith({
      signal: expect.any(AbortSignal),
      onProgress: expect.any(Function),
    });

    expect(result.current.progress).toEqual(COMPLETE_PROGRESS);
    expect(result.current.result).toEqual(ANALYSIS_RESULT);
    expect(result.current.hasCompletedAnalysis).toBe(true);
    expect(result.current.isAnalyzing).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('exposes a readable error when analysis fails', async () => {
    const workspace: DuplicateAnalysisWorkspace = {
      analyzeDuplicates: vi.fn(async () => {
        throw new Error('The selected file changed during hashing.');
      }),
    };

    const { result } = renderHook(() => useDuplicateAnalysis(workspace));

    await act(async () => {
      await result.current.analyzeDuplicates();
    });

    expect(result.current.result).toBeNull();
    expect(result.current.hasCompletedAnalysis).toBe(false);
    expect(result.current.isAnalyzing).toBe(false);
    expect(result.current.error).toBe('The selected file changed during hashing.');
  });

  it('aborts an active analysis and discards its eventual result', async () => {
    const deferred = createDeferred<AnalyzeDuplicateFilesResult>();

    let receivedSignal: AbortSignal | undefined;

    const workspace: DuplicateAnalysisWorkspace = {
      analyzeDuplicates: vi.fn((options: AnalyzeDuplicateFilesOptions = {}) => {
        receivedSignal = options.signal;

        return deferred.promise;
      }),
    };

    const { result } = renderHook(() => useDuplicateAnalysis(workspace));

    let analysisPromise = Promise.resolve();

    act(() => {
      analysisPromise = result.current.analyzeDuplicates();
    });

    await waitFor(() => {
      expect(result.current.isAnalyzing).toBe(true);
    });

    act(() => {
      result.current.cancelAnalysis();
    });

    expect(receivedSignal?.aborted).toBe(true);
    expect(result.current.isAnalyzing).toBe(false);
    expect(result.current.error).toBeNull();

    await act(async () => {
      deferred.resolve(ANALYSIS_RESULT);
      await analysisPromise;
    });

    expect(result.current.result).toBeNull();
    expect(result.current.hasCompletedAnalysis).toBe(false);
  });

  it('prevents an older request from replacing a newer result', async () => {
    const firstDeferred = createDeferred<AnalyzeDuplicateFilesResult>();
    const secondDeferred = createDeferred<AnalyzeDuplicateFilesResult>();

    const receivedSignals: AbortSignal[] = [];

    const newerResult: AnalyzeDuplicateFilesResult = {
      ...ANALYSIS_RESULT,
      duplicateGroupCount: 2,
      duplicateFileCount: 5,
      totalDuplicateBytes: 5_000,
      reclaimableBytes: 3_000,
    };

    let executionCount = 0;

    const workspace: DuplicateAnalysisWorkspace = {
      analyzeDuplicates: vi.fn((options: AnalyzeDuplicateFilesOptions = {}) => {
        if (options.signal) {
          receivedSignals.push(options.signal);
        }

        executionCount += 1;

        return executionCount === 1 ? firstDeferred.promise : secondDeferred.promise;
      }),
    };

    const { result } = renderHook(() => useDuplicateAnalysis(workspace));

    let firstAnalysisPromise = Promise.resolve();
    let secondAnalysisPromise = Promise.resolve();

    act(() => {
      firstAnalysisPromise = result.current.analyzeDuplicates();
    });

    await waitFor(() => {
      expect(result.current.isAnalyzing).toBe(true);
    });

    act(() => {
      secondAnalysisPromise = result.current.analyzeDuplicates();
    });

    expect(receivedSignals[0]?.aborted).toBe(true);
    expect(receivedSignals[1]?.aborted).toBe(false);

    await act(async () => {
      firstDeferred.resolve(ANALYSIS_RESULT);
      await firstAnalysisPromise;
    });

    expect(result.current.result).toBeNull();

    await act(async () => {
      secondDeferred.resolve(newerResult);
      await secondAnalysisPromise;
    });

    expect(result.current.result).toEqual(newerResult);
    expect(result.current.hasCompletedAnalysis).toBe(true);
    expect(result.current.isAnalyzing).toBe(false);
  });

  it('clears completed results, progress, and errors', async () => {
    const workspace: DuplicateAnalysisWorkspace = {
      analyzeDuplicates: vi.fn(
        async (
          options: AnalyzeDuplicateFilesOptions = {},
        ): Promise<AnalyzeDuplicateFilesResult> => {
          options.onProgress?.(COMPLETE_PROGRESS);

          return ANALYSIS_RESULT;
        },
      ),
    };

    const { result } = renderHook(() => useDuplicateAnalysis(workspace));

    await act(async () => {
      await result.current.analyzeDuplicates();
    });

    expect(result.current.result).toEqual(ANALYSIS_RESULT);
    expect(result.current.progress).toEqual(COMPLETE_PROGRESS);

    act(() => {
      result.current.clearAnalysis();
    });

    expect(result.current.result).toBeNull();
    expect(result.current.progress).toBeNull();
    expect(result.current.hasCompletedAnalysis).toBe(false);
    expect(result.current.isAnalyzing).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('aborts native work when the consuming component unmounts', async () => {
    const deferred = createDeferred<AnalyzeDuplicateFilesResult>();

    let receivedSignal: AbortSignal | undefined;

    const workspace: DuplicateAnalysisWorkspace = {
      analyzeDuplicates: vi.fn((options: AnalyzeDuplicateFilesOptions = {}) => {
        receivedSignal = options.signal;

        return deferred.promise;
      }),
    };

    const { result, unmount } = renderHook(() => useDuplicateAnalysis(workspace));

    let analysisPromise = Promise.resolve();

    act(() => {
      analysisPromise = result.current.analyzeDuplicates();
    });

    await waitFor(() => {
      expect(receivedSignal).toBeDefined();
    });

    unmount();

    expect(receivedSignal?.aborted).toBe(true);

    deferred.resolve(ANALYSIS_RESULT);
    await analysisPromise;
  });
});
