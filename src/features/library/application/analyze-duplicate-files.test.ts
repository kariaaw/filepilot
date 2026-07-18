import { describe, expect, it, vi } from 'vitest';

import type { FileEntry } from '@/core/entities/file-entry';
import type { LibrarySource } from '@/core/entities/library-source';
import {
  AnalyzeDuplicateFiles,
  type AnalyzeDuplicateFilesDependencies,
  type DuplicateAnalysisProgress,
} from '@/features/library/application/analyze-duplicate-files';
import { createFileEntry, createLibrarySource } from '@/test/factories';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function createFixture(
  initialEntries: readonly FileEntry[],
  initialSources: readonly LibrarySource[] = [
    createLibrarySource({
      id: 'source-1',
      platform: 'tauri',
    }),
  ],
  overrides: Partial<AnalyzeDuplicateFilesDependencies> = {},
) {
  const entriesById = new Map(initialEntries.map((entry) => [entry.id, entry] as const));

  const fileEntryRepository = {
    find: vi.fn(async (query = {}) => {
      const requestedKinds = query.kinds;
      const requestedAvailability = query.availability;

      let entries = [...entriesById.values()];

      if (requestedKinds?.length) {
        entries = entries.filter((entry) => requestedKinds.includes(entry.kind));
      }

      if (requestedAvailability?.length) {
        entries = entries.filter((entry) => requestedAvailability.includes(entry.availability));
      }

      entries.sort((left, right) => {
        const sizeComparison = left.sizeBytes - right.sizeBytes;

        return sizeComparison !== 0 ? sizeComparison : left.id.localeCompare(right.id);
      });

      const offset = query.offset ?? 0;
      const limit = query.limit ?? 100;

      return {
        items: entries.slice(offset, offset + limit),
        total: entries.length,
        offset,
        limit,
      };
    }),

    saveMany: vi.fn(async (entries: readonly FileEntry[]) => {
      for (const entry of entries) {
        entriesById.set(entry.id, entry);
      }
    }),
  };

  const librarySourceRepository = {
    find: vi.fn(async (query = {}) => {
      const sources = [...initialSources].sort((left, right) =>
        left.name.localeCompare(right.name),
      );

      const offset = query.offset ?? 0;
      const limit = query.limit ?? 100;

      return {
        items: sources.slice(offset, offset + limit),
        total: sources.length,
        offset,
        limit,
      };
    }),
  };

  const sourceAccessPreparer = {
    platform: 'tauri' as const,
    prepareSource: vi.fn(async () => undefined),
  };

  const indexedEntryHashAdapter = {
    platform: 'tauri' as const,
    hashEntry: vi.fn(async () => ({
      algorithm: 'sha256' as const,
      value: HASH_A,
      sizeBytes: 100,
    })),
  };

  const dependencies: AnalyzeDuplicateFilesDependencies = {
    fileEntryRepository,
    librarySourceRepository,
    sourceAccessPreparer,
    indexedEntryHashAdapter,
    ...overrides,
  };

  return {
    entriesById,
    fileEntryRepository,
    librarySourceRepository,
    sourceAccessPreparer,
    indexedEntryHashAdapter,
    analyzer: new AnalyzeDuplicateFiles(dependencies),
  };
}

describe('AnalyzeDuplicateFiles', () => {
  it('skips files whose sizes are unique', async () => {
    const fixture = createFixture([
      createFileEntry({
        id: 'file-a',
        relativePath: 'file-a.txt',
        name: 'file-a.txt',
        sizeBytes: 100,
      }),
      createFileEntry({
        id: 'file-b',
        relativePath: 'file-b.txt',
        name: 'file-b.txt',
        sizeBytes: 200,
      }),
    ]);

    const result = await fixture.analyzer.execute();

    expect(result).toEqual({
      groups: [],
      candidateFileCount: 0,
      hashedFileCount: 0,
      reusedHashCount: 0,
      duplicateGroupCount: 0,
      duplicateFileCount: 0,
      totalDuplicateBytes: 0,
      reclaimableBytes: 0,
    });

    expect(fixture.indexedEntryHashAdapter.hashEntry).not.toHaveBeenCalled();

    expect(fixture.fileEntryRepository.saveMany).not.toHaveBeenCalled();
  });

  it('detects exact duplicates across different library sources', async () => {
    const fixture = createFixture(
      [
        createFileEntry({
          id: 'source-1-copy',
          sourceId: 'source-1',
          relativePath: 'copy-a.bin',
          name: 'copy-a.bin',
          sizeBytes: 100,
        }),
        createFileEntry({
          id: 'source-2-copy',
          sourceId: 'source-2',
          relativePath: 'backup/copy-b.bin',
          name: 'copy-b.bin',
          sizeBytes: 100,
        }),
      ],
      [
        createLibrarySource({
          id: 'source-1',
          platform: 'tauri',
          name: 'Documents',
        }),
        createLibrarySource({
          id: 'source-2',
          platform: 'tauri',
          name: 'Backup',
        }),
      ],
    );

    fixture.indexedEntryHashAdapter.hashEntry.mockImplementation(async () => ({
      algorithm: 'sha256' as const,
      value: HASH_A,
      sizeBytes: 100,
    }));

    const result = await fixture.analyzer.execute();

    expect(result.duplicateGroupCount).toBe(1);
    expect(result.duplicateFileCount).toBe(2);
    expect(result.totalDuplicateBytes).toBe(200);
    expect(result.reclaimableBytes).toBe(100);
    expect(result.hashedFileCount).toBe(2);
    expect(result.reusedHashCount).toBe(0);

    expect(result.groups[0]?.entries.map((entry) => entry.id)).toEqual([
      'source-1-copy',
      'source-2-copy',
    ]);

    expect(fixture.sourceAccessPreparer.prepareSource).toHaveBeenCalledTimes(2);

    expect(fixture.fileEntryRepository.saveMany).toHaveBeenCalledTimes(1);
  });

  it('reuses an existing hash and calculates only the missing peer', async () => {
    const fixture = createFixture([
      createFileEntry({
        id: 'already-hashed',
        relativePath: 'already-hashed.bin',
        name: 'already-hashed.bin',
        sizeBytes: 100,
        contentHash: {
          algorithm: 'sha256',
          value: HASH_A,
        },
      }),
      createFileEntry({
        id: 'missing-hash',
        relativePath: 'missing-hash.bin',
        name: 'missing-hash.bin',
        sizeBytes: 100,
      }),
    ]);

    const result = await fixture.analyzer.execute();

    expect(result.duplicateGroupCount).toBe(1);
    expect(result.hashedFileCount).toBe(1);
    expect(result.reusedHashCount).toBe(1);

    expect(fixture.indexedEntryHashAdapter.hashEntry).toHaveBeenCalledTimes(1);

    expect(fixture.sourceAccessPreparer.prepareSource).toHaveBeenCalledTimes(1);
  });

  it('does not group equal-sized files when their hashes differ', async () => {
    const fixture = createFixture([
      createFileEntry({
        id: 'file-a',
        relativePath: 'file-a.bin',
        name: 'file-a.bin',
        sizeBytes: 100,
      }),
      createFileEntry({
        id: 'file-b',
        relativePath: 'file-b.bin',
        name: 'file-b.bin',
        sizeBytes: 100,
      }),
    ]);

    fixture.indexedEntryHashAdapter.hashEntry
      .mockResolvedValueOnce({
        algorithm: 'sha256',
        value: HASH_A,
        sizeBytes: 100,
      })
      .mockResolvedValueOnce({
        algorithm: 'sha256',
        value: HASH_B,
        sizeBytes: 100,
      });

    const result = await fixture.analyzer.execute();

    expect(result.groups).toEqual([]);
    expect(result.candidateFileCount).toBe(2);
    expect(result.hashedFileCount).toBe(2);
  });

  it('detects duplicate empty files', async () => {
    const emptyHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

    const fixture = createFixture([
      createFileEntry({
        id: 'empty-a',
        relativePath: 'empty-a.txt',
        name: 'empty-a.txt',
        sizeBytes: 0,
      }),
      createFileEntry({
        id: 'empty-b',
        relativePath: 'empty-b.txt',
        name: 'empty-b.txt',
        sizeBytes: 0,
      }),
    ]);

    fixture.indexedEntryHashAdapter.hashEntry.mockResolvedValue({
      algorithm: 'sha256',
      value: emptyHash,
      sizeBytes: 0,
    });

    const result = await fixture.analyzer.execute();

    expect(result.duplicateGroupCount).toBe(1);
    expect(result.duplicateFileCount).toBe(2);
    expect(result.reclaimableBytes).toBe(0);
  });

  it('rejects a hash when the native file size differs from the index', async () => {
    const fixture = createFixture([
      createFileEntry({
        id: 'file-a',
        relativePath: 'file-a.bin',
        name: 'file-a.bin',
        sizeBytes: 100,
      }),
      createFileEntry({
        id: 'file-b',
        relativePath: 'file-b.bin',
        name: 'file-b.bin',
        sizeBytes: 100,
      }),
    ]);

    fixture.indexedEntryHashAdapter.hashEntry.mockResolvedValue({
      algorithm: 'sha256',
      value: HASH_A,
      sizeBytes: 101,
    });

    await expect(fixture.analyzer.execute()).rejects.toThrow(
      'Indexed file "file-a.bin" changed size before duplicate analysis completed.',
    );

    expect(fixture.fileEntryRepository.saveMany).not.toHaveBeenCalled();
  });

  it('persists calculated hashes in bounded batches and reports progress', async () => {
    const progress: DuplicateAnalysisProgress[] = [];

    const fixture = createFixture(
      [
        createFileEntry({
          id: 'file-a',
          relativePath: 'file-a.bin',
          name: 'file-a.bin',
          sizeBytes: 100,
        }),
        createFileEntry({
          id: 'file-b',
          relativePath: 'file-b.bin',
          name: 'file-b.bin',
          sizeBytes: 100,
        }),
        createFileEntry({
          id: 'file-c',
          relativePath: 'file-c.bin',
          name: 'file-c.bin',
          sizeBytes: 100,
        }),
      ],
      undefined,
      {
        saveBatchSize: 2,
      },
    );

    await fixture.analyzer.execute({
      onProgress: (nextProgress) => {
        progress.push(nextProgress);
      },
    });

    expect(fixture.fileEntryRepository.saveMany).toHaveBeenCalledTimes(2);

    expect(progress[0]?.phase).toBe('loading');
    expect(progress[progress.length - 1]).toMatchObject({
      phase: 'complete',
      candidateFileCount: 3,
      processedFileCount: 3,
      hashedFileCount: 3,
      reusedHashCount: 0,
      currentEntryId: null,
    });
  });

  it('stops before repository access when already cancelled', async () => {
    const fixture = createFixture([]);
    const controller = new AbortController();

    controller.abort();

    await expect(
      fixture.analyzer.execute({
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({
      name: 'AbortError',
    });

    expect(fixture.fileEntryRepository.find).not.toHaveBeenCalled();
    expect(fixture.librarySourceRepository.find).not.toHaveBeenCalled();
  });
});
