import { describe, expect, it } from 'vitest';

import type { FileEntry } from '@/core/entities/file-entry';
import type { LibrarySource } from '@/core/entities/library-source';
import type { FileEntryPage, FileEntryQuery } from '@/core/ports/file-entry-repository';
import type {
  DirectoryScanAdapter,
  DirectoryScanOptions,
  DiscoveredFileSystemEntry,
} from '@/core/ports/file-system-adapter';
import {
  BuildIndexedFileEntry,
  type FileEntryIdFactory,
} from '@/features/library/application/build-indexed-file-entry';
import {
  IndexLibrarySource,
  type ExistingFileEntryRepository,
  type LibraryIndexCommitRepository,
  type LibrarySourceAccessPreparer,
  type LibrarySourceIndexingRepository,
} from '@/features/library/application/index-library-source';
import { createFileEntry, createLibrarySource } from '@/test/factories';

const createReadableEntryId: FileEntryIdFactory = async (sourceId, relativePath) =>
  `entry:${sourceId}:${relativePath}`;

const DIRECTORY_ENTRY: DiscoveredFileSystemEntry = {
  name: 'Projects',
  relativePath: 'Projects',
  kind: 'directory',
  extension: null,
  mimeType: null,
  category: 'other',
  sizeBytes: 0,
  createdAtMs: 100,
  modifiedAtMs: 200,
};

const REPORT_ENTRY: DiscoveredFileSystemEntry = {
  name: 'report.pdf',
  relativePath: 'report.pdf',
  kind: 'file',
  extension: 'pdf',
  mimeType: 'application/pdf',
  category: 'document',
  sizeBytes: 4_096,
  createdAtMs: 300,
  modifiedAtMs: 400,
};

class MemorySourceRepository implements LibrarySourceIndexingRepository {
  constructor(private readonly source: LibrarySource | null) {}

  async getById(id: string): Promise<LibrarySource | null> {
    if (this.source?.id !== id) {
      return null;
    }

    return this.source;
  }
}

class MemoryExistingEntryRepository implements ExistingFileEntryRepository {
  readonly queries: FileEntryQuery[] = [];

  constructor(private readonly entries: readonly FileEntry[] = []) {}

  async find(query: FileEntryQuery = {}): Promise<FileEntryPage> {
    this.queries.push(query);

    const matchingEntries = this.entries.filter(
      (entry) => query.sourceId === undefined || entry.sourceId === query.sourceId,
    );

    const offset = query.offset ?? 0;
    const limit = query.limit ?? 100;

    return {
      items: matchingEntries.slice(offset, offset + limit),
      total: matchingEntries.length,
      offset,
      limit,
    };
  }
}

class MemoryIndexRepository implements LibraryIndexCommitRepository {
  readonly commits: Array<{
    source: LibrarySource;
    entries: readonly FileEntry[];
  }> = [];

  async replaceSourceIndex(source: LibrarySource, entries: readonly FileEntry[]): Promise<void> {
    this.commits.push({
      source,
      entries: [...entries],
    });
  }
}

class StubAccessPreparer implements LibrarySourceAccessPreparer {
  readonly preparedSources: LibrarySource[] = [];

  constructor(readonly platform: LibrarySourceAccessPreparer['platform'] = 'tauri') {}

  async prepareSource(source: LibrarySource): Promise<void> {
    this.preparedSources.push(source);
  }
}

class StubDirectoryScanner implements DirectoryScanAdapter {
  readonly calls: Array<{
    accessKey: string;
    options: DirectoryScanOptions;
  }> = [];

  constructor(
    private readonly entries: readonly DiscoveredFileSystemEntry[] = [],
    private readonly scanError?: Error,
    readonly platform: DirectoryScanAdapter['platform'] = 'tauri',
  ) {}

  async *scanDirectory(
    accessKey: string,
    options: DirectoryScanOptions,
  ): AsyncIterable<DiscoveredFileSystemEntry> {
    this.calls.push({
      accessKey,
      options,
    });

    if (this.scanError) {
      throw this.scanError;
    }

    for (const entry of this.entries) {
      yield entry;
    }
  }
}

function createTauriSource(overrides: Partial<LibrarySource> = {}): LibrarySource {
  return createLibrarySource({
    id: 'source-documents',
    name: 'Documents',
    platform: 'tauri',
    displayPath: '/home/karya/Documents',
    access: 'available',
    includeHiddenFiles: true,
    excludedPatterns: ['.git', 'node_modules'],
    lastScannedAtMs: null,
    statistics: {
      fileCount: 0,
      directoryCount: 0,
      totalSizeBytes: 0,
    },
    ...overrides,
  });
}

function createBuilder(): BuildIndexedFileEntry {
  return new BuildIndexedFileEntry({
    createEntryId: createReadableEntryId,
  });
}

describe('IndexLibrarySource', () => {
  it('indexes a source and atomically commits entries with statistics', async () => {
    const source = createTauriSource();

    const existingReport = createFileEntry({
      id: 'entry:source-documents:report.pdf',
      sourceId: source.id,
      name: 'report.pdf',
      relativePath: 'report.pdf',
      sizeBytes: 4_096,
      modifiedAtMs: 400,
      indexedAtMs: 500,
      lastSeenAtMs: 700,
      securityLevel: 'private',
      tags: ['finance'],
      contentHash: {
        algorithm: 'sha256',
        value: 'a'.repeat(64),
      },
    });

    const staleEntry = createFileEntry({
      id: 'entry:source-documents:stale.txt',
      sourceId: source.id,
      name: 'stale.txt',
      relativePath: 'stale.txt',
      extension: 'txt',
      mimeType: 'text/plain',
      category: 'text',
    });

    const existingRepository = new MemoryExistingEntryRepository([existingReport, staleEntry]);

    const indexRepository = new MemoryIndexRepository();

    const accessPreparer = new StubAccessPreparer();

    const scanner = new StubDirectoryScanner([DIRECTORY_ENTRY, REPORT_ENTRY]);

    const timestamps = [1_000, 2_000];
    let timestampIndex = 0;

    const useCase = new IndexLibrarySource({
      librarySourceRepository: new MemorySourceRepository(source),
      existingFileEntryRepository: existingRepository,
      libraryIndexRepository: indexRepository,
      directoryScanAdapter: scanner,
      sourceAccessPreparer: accessPreparer,
      buildIndexedFileEntry: createBuilder(),
      existingEntryPageSize: 1,
      now: () => timestamps[timestampIndex++] ?? 2_000,
    });

    const result = await useCase.execute(source.id, {
      maximumDepth: 12,
    });

    expect(result).toEqual({
      source: {
        ...source,
        lastScannedAtMs: 2_000,
        updatedAtMs: 2_000,
        statistics: {
          fileCount: 1,
          directoryCount: 1,
          totalSizeBytes: 4_096,
        },
      },
      entryCount: 2,
      scanStartedAtMs: 1_000,
      scanCompletedAtMs: 2_000,
    });

    expect(accessPreparer.preparedSources).toEqual([source]);

    expect(scanner.calls).toEqual([
      {
        accessKey: source.id,
        options: {
          includeHiddenFiles: true,
          excludedPatterns: ['.git', 'node_modules'],
          maximumDepth: 12,
          signal: undefined,
        },
      },
    ]);

    expect(existingRepository.queries).toHaveLength(2);

    expect(indexRepository.commits).toHaveLength(1);

    const committedEntries = indexRepository.commits[0]?.entries ?? [];

    expect(committedEntries.map((entry) => entry.id)).toEqual([
      'entry:source-documents:Projects',
      'entry:source-documents:report.pdf',
    ]);

    const committedReport = committedEntries.find((entry) => entry.relativePath === 'report.pdf');

    expect(committedReport).toMatchObject({
      indexedAtMs: 500,
      lastSeenAtMs: 1_000,
      securityLevel: 'private',
      tags: ['finance'],
      contentHash: existingReport.contentHash,
    });

    expect(committedEntries.some((entry) => entry.relativePath === 'stale.txt')).toBe(false);
  });

  it('commits an empty index with zero statistics', async () => {
    const source = createTauriSource({
      statistics: {
        fileCount: 10,
        directoryCount: 2,
        totalSizeBytes: 8_192,
      },
    });

    const indexRepository = new MemoryIndexRepository();

    const useCase = new IndexLibrarySource({
      librarySourceRepository: new MemorySourceRepository(source),
      existingFileEntryRepository: new MemoryExistingEntryRepository([
        createFileEntry({
          sourceId: source.id,
        }),
      ]),
      libraryIndexRepository: indexRepository,
      directoryScanAdapter: new StubDirectoryScanner(),
      sourceAccessPreparer: new StubAccessPreparer(),
      buildIndexedFileEntry: createBuilder(),
      now: (() => {
        const timestamps = [3_000, 4_000];
        let index = 0;

        return () => timestamps[index++] ?? 4_000;
      })(),
    });

    const result = await useCase.execute(source.id);

    expect(result.entryCount).toBe(0);

    expect(result.source.statistics).toEqual({
      fileCount: 0,
      directoryCount: 0,
      totalSizeBytes: 0,
    });

    expect(indexRepository.commits[0]?.entries).toEqual([]);
  });

  it('rejects an unknown source before preparing access', async () => {
    const accessPreparer = new StubAccessPreparer();

    const scanner = new StubDirectoryScanner();

    const indexRepository = new MemoryIndexRepository();

    const useCase = new IndexLibrarySource({
      librarySourceRepository: new MemorySourceRepository(null),
      existingFileEntryRepository: new MemoryExistingEntryRepository(),
      libraryIndexRepository: indexRepository,
      directoryScanAdapter: scanner,
      sourceAccessPreparer: accessPreparer,
      buildIndexedFileEntry: createBuilder(),
    });

    await expect(useCase.execute('missing-source')).rejects.toThrow(
      'Library source "missing-source" was not found.',
    );

    expect(accessPreparer.preparedSources).toEqual([]);
    expect(scanner.calls).toEqual([]);
    expect(indexRepository.commits).toEqual([]);
  });

  it('rejects a source that is not currently accessible', async () => {
    const source = createTauriSource({
      access: 'unavailable',
    });

    const scanner = new StubDirectoryScanner();
    const indexRepository = new MemoryIndexRepository();

    const useCase = new IndexLibrarySource({
      librarySourceRepository: new MemorySourceRepository(source),
      existingFileEntryRepository: new MemoryExistingEntryRepository(),
      libraryIndexRepository: indexRepository,
      directoryScanAdapter: scanner,
      sourceAccessPreparer: new StubAccessPreparer(),
      buildIndexedFileEntry: createBuilder(),
    });

    await expect(useCase.execute(source.id)).rejects.toThrow(
      `Library source "${source.id}" is not currently accessible.`,
    );

    expect(scanner.calls).toEqual([]);
    expect(indexRepository.commits).toEqual([]);
  });

  it('rejects a source whose platform does not match the scanner', async () => {
    const source = createTauriSource();

    const useCase = new IndexLibrarySource({
      librarySourceRepository: new MemorySourceRepository(source),
      existingFileEntryRepository: new MemoryExistingEntryRepository(),
      libraryIndexRepository: new MemoryIndexRepository(),
      directoryScanAdapter: new StubDirectoryScanner([], undefined, 'browser'),
      sourceAccessPreparer: new StubAccessPreparer(),
      buildIndexedFileEntry: createBuilder(),
    });

    await expect(useCase.execute(source.id)).rejects.toThrow(
      'The library source platform does not match the active directory scanner.',
    );
  });

  it('keeps the previous index untouched when scanning fails', async () => {
    const source = createTauriSource();

    const indexRepository = new MemoryIndexRepository();

    const useCase = new IndexLibrarySource({
      librarySourceRepository: new MemorySourceRepository(source),
      existingFileEntryRepository: new MemoryExistingEntryRepository(),
      libraryIndexRepository: indexRepository,
      directoryScanAdapter: new StubDirectoryScanner([], new Error('Native read failed.')),
      sourceAccessPreparer: new StubAccessPreparer(),
      buildIndexedFileEntry: createBuilder(),
      now: () => 1_000,
    });

    await expect(useCase.execute(source.id)).rejects.toThrow('Native read failed.');

    expect(indexRepository.commits).toEqual([]);
  });

  it('rejects duplicate scanner paths without committing partial data', async () => {
    const source = createTauriSource();

    const indexRepository = new MemoryIndexRepository();

    const useCase = new IndexLibrarySource({
      librarySourceRepository: new MemorySourceRepository(source),
      existingFileEntryRepository: new MemoryExistingEntryRepository(),
      libraryIndexRepository: indexRepository,
      directoryScanAdapter: new StubDirectoryScanner([
        REPORT_ENTRY,
        {
          ...REPORT_ENTRY,
        },
      ]),
      sourceAccessPreparer: new StubAccessPreparer(),
      buildIndexedFileEntry: createBuilder(),
      now: () => 1_000,
    });

    await expect(useCase.execute(source.id)).rejects.toThrow(
      'The directory scanner returned duplicate relative path "report.pdf".',
    );

    expect(indexRepository.commits).toEqual([]);
  });

  it('rejects invalid completion timestamps before committing', async () => {
    const source = createTauriSource();

    const indexRepository = new MemoryIndexRepository();

    const timestamps = [1_000, Number.NaN];
    let timestampIndex = 0;

    const useCase = new IndexLibrarySource({
      librarySourceRepository: new MemorySourceRepository(source),
      existingFileEntryRepository: new MemoryExistingEntryRepository(),
      libraryIndexRepository: indexRepository,
      directoryScanAdapter: new StubDirectoryScanner([REPORT_ENTRY]),
      sourceAccessPreparer: new StubAccessPreparer(),
      buildIndexedFileEntry: createBuilder(),
      now: () => timestamps[timestampIndex++],
    });

    await expect(useCase.execute(source.id)).rejects.toThrow(
      'The library scan clock must return a non-negative integer timestamp.',
    );

    expect(indexRepository.commits).toEqual([]);
  });
});
