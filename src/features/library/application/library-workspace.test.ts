import { describe, expect, it } from 'vitest';

import { parseLibrarySource, type LibrarySource } from '@/core/entities/library-source';
import type { LibrarySourcePage, LibrarySourceQuery } from '@/core/ports/library-source-repository';
import type {
  BrowseLibraryDirectoryInput,
  BrowseLibraryDirectoryResult,
} from '@/features/library/application/browse-library-directory';
import type { ConnectLibrarySourceResult } from '@/features/library/application/connect-library-source';
import type {
  IndexLibrarySourceOptions,
  IndexLibrarySourceResult,
} from '@/features/library/application/index-library-source';
import {
  LibraryWorkspace,
  type LibraryDirectoryBrowsingWorkflow,
  type LibrarySourceConnectionWorkflow,
  type LibrarySourceIndexingWorkflow,
  type LibrarySourceListingRepository,
} from '@/features/library/application/library-workspace';

function createSource(id: string, name: string): LibrarySource {
  return parseLibrarySource({
    id,
    name,
    platform: 'tauri',
    displayPath: `/home/karya/${name}`,
    access: 'available',
    syncMode: 'manual',
    includeHiddenFiles: false,
    excludedPatterns: [],
    addedAtMs: 1_000,
    lastScannedAtMs: null,
    updatedAtMs: 1_000,
    statistics: {
      fileCount: 0,
      directoryCount: 0,
      totalSizeBytes: 0,
    },
  });
}

function createIndexingResult(source: LibrarySource): IndexLibrarySourceResult {
  return {
    source,
    entryCount: source.statistics.fileCount + source.statistics.directoryCount,
    scanStartedAtMs: 1_500,
    scanCompletedAtMs: source.lastScannedAtMs ?? 2_000,
  };
}

class MemoryListingRepository implements LibrarySourceListingRepository {
  readonly queries: LibrarySourceQuery[] = [];

  constructor(readonly sources: LibrarySource[] = []) {}

  async find(query: LibrarySourceQuery = {}): Promise<LibrarySourcePage> {
    this.queries.push(query);

    const sortedSources = [...this.sources].sort((left, right) =>
      left.name.localeCompare(right.name),
    );

    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;

    return {
      items: sortedSources.slice(offset, offset + limit),
      total: sortedSources.length,
      offset,
      limit,
    };
  }
}

class StubConnectionWorkflow implements LibrarySourceConnectionWorkflow {
  executionCount = 0;

  constructor(
    private readonly result: ConnectLibrarySourceResult,
    private readonly onExecute?: () => void,
  ) {}

  async execute(): Promise<ConnectLibrarySourceResult> {
    this.executionCount += 1;
    this.onExecute?.();

    return this.result;
  }
}

class StubIndexingWorkflow implements LibrarySourceIndexingWorkflow {
  readonly calls: Array<{
    sourceId: string;
    options: IndexLibrarySourceOptions;
  }> = [];

  constructor(
    private readonly result: IndexLibrarySourceResult,
    private readonly onExecute?: () => void,
  ) {}

  async execute(
    sourceId: string,
    options: IndexLibrarySourceOptions = {},
  ): Promise<IndexLibrarySourceResult> {
    this.calls.push({
      sourceId,
      options,
    });

    this.onExecute?.();

    return this.result;
  }
}

class StubDirectoryBrowsingWorkflow implements LibraryDirectoryBrowsingWorkflow {
  readonly calls: BrowseLibraryDirectoryInput[] = [];

  constructor(private readonly result: BrowseLibraryDirectoryResult) {}

  async execute(input: BrowseLibraryDirectoryInput): Promise<BrowseLibraryDirectoryResult> {
    this.calls.push(input);

    return this.result;
  }
}

function createUnusedDirectoryBrowsingWorkflow(): StubDirectoryBrowsingWorkflow {
  return new StubDirectoryBrowsingWorkflow({
    sourceId: 'unused-source',
    currentDirectory: null,
    items: [],
    total: 0,
    offset: 0,
    limit: 100,
  });
}

function createUnusedIndexingWorkflow(): StubIndexingWorkflow {
  const source = createSource('unused-source', 'Unused');

  return new StubIndexingWorkflow(createIndexingResult(source));
}

describe('LibraryWorkspace', () => {
  it('loads all sources through bounded repository pages', async () => {
    const repository = new MemoryListingRepository([
      createSource('source-c', 'Videos'),
      createSource('source-a', 'Documents'),
      createSource('source-b', 'Pictures'),
    ]);

    const workspace = new LibraryWorkspace({
      librarySourceRepository: repository,
      connectLibrarySource: new StubConnectionWorkflow({
        status: 'cancelled',
      }),
      browseLibraryDirectory: createUnusedDirectoryBrowsingWorkflow(),
      indexLibrarySource: createUnusedIndexingWorkflow(),
      pageSize: 2,
    });

    const snapshot = await workspace.loadSources();

    expect(snapshot.total).toBe(3);

    expect(snapshot.sources.map((source) => source.name)).toEqual([
      'Documents',
      'Pictures',
      'Videos',
    ]);

    expect(repository.queries).toEqual([
      {
        sortBy: 'name',
        sortDirection: 'ascending',
        offset: 0,
        limit: 2,
      },
      {
        sortBy: 'name',
        sortDirection: 'ascending',
        offset: 2,
        limit: 2,
      },
    ]);
  });

  it('returns an empty snapshot when no sources exist', async () => {
    const repository = new MemoryListingRepository();

    const workspace = new LibraryWorkspace({
      librarySourceRepository: repository,
      connectLibrarySource: new StubConnectionWorkflow({
        status: 'cancelled',
      }),
      browseLibraryDirectory: createUnusedDirectoryBrowsingWorkflow(),
      indexLibrarySource: createUnusedIndexingWorkflow(),
    });

    await expect(workspace.loadSources()).resolves.toEqual({
      sources: [],
      total: 0,
    });
  });

  it('connects a directory and returns the refreshed source list', async () => {
    const repository = new MemoryListingRepository();

    const createdSource = createSource('source-documents', 'Documents');

    const workflow = new StubConnectionWorkflow(
      {
        status: 'created',
        source: createdSource,
      },
      () => {
        repository.sources.push(createdSource);
      },
    );

    const workspace = new LibraryWorkspace({
      librarySourceRepository: repository,
      connectLibrarySource: workflow,
      browseLibraryDirectory: createUnusedDirectoryBrowsingWorkflow(),
      indexLibrarySource: createUnusedIndexingWorkflow(),
    });

    const snapshot = await workspace.connectDirectory();

    expect(workflow.executionCount).toBe(1);

    expect(snapshot.connection).toEqual({
      status: 'created',
      source: createdSource,
    });

    expect(snapshot.sources).toEqual([createdSource]);

    expect(snapshot.total).toBe(1);
  });

  it('refreshes existing sources after a cancelled selection', async () => {
    const existingSource = createSource('source-pictures', 'Pictures');

    const repository = new MemoryListingRepository([existingSource]);

    const workspace = new LibraryWorkspace({
      librarySourceRepository: repository,
      connectLibrarySource: new StubConnectionWorkflow({
        status: 'cancelled',
      }),
      browseLibraryDirectory: createUnusedDirectoryBrowsingWorkflow(),
      indexLibrarySource: createUnusedIndexingWorkflow(),
    });

    const snapshot = await workspace.connectDirectory();

    expect(snapshot.connection).toEqual({
      status: 'cancelled',
    });

    expect(snapshot.sources).toEqual([existingSource]);

    expect(snapshot.total).toBe(1);
  });

  it('indexes a source and returns the refreshed source list', async () => {
    const originalSource = createSource('source-documents', 'Documents');

    const indexedSource = parseLibrarySource({
      ...originalSource,
      lastScannedAtMs: 2_000,
      updatedAtMs: 2_000,
      statistics: {
        fileCount: 24,
        directoryCount: 6,
        totalSizeBytes: 65_536,
      },
    });

    const repository = new MemoryListingRepository([originalSource]);

    const indexingWorkflow = new StubIndexingWorkflow(createIndexingResult(indexedSource), () => {
      repository.sources.splice(0, repository.sources.length, indexedSource);
    });

    const workspace = new LibraryWorkspace({
      librarySourceRepository: repository,
      connectLibrarySource: new StubConnectionWorkflow({
        status: 'cancelled',
      }),
      browseLibraryDirectory: createUnusedDirectoryBrowsingWorkflow(),
      indexLibrarySource: indexingWorkflow,
    });

    const snapshot = await workspace.indexSource(originalSource.id, {
      maximumDepth: 12,
    });

    expect(indexingWorkflow.calls).toEqual([
      {
        sourceId: originalSource.id,
        options: {
          maximumDepth: 12,
        },
      },
    ]);

    expect(snapshot.indexing).toEqual(createIndexingResult(indexedSource));

    expect(snapshot.sources).toEqual([indexedSource]);

    expect(snapshot.total).toBe(1);
  });

  it('browses an indexed directory through the workspace facade', async () => {
    const browsingResult: BrowseLibraryDirectoryResult = {
      sourceId: 'source-documents',
      currentDirectory: null,
      items: [],
      total: 0,
      offset: 20,
      limit: 25,
    };

    const browsingWorkflow = new StubDirectoryBrowsingWorkflow(browsingResult);

    const workspace = new LibraryWorkspace({
      librarySourceRepository: new MemoryListingRepository(),
      connectLibrarySource: new StubConnectionWorkflow({
        status: 'cancelled',
      }),
      browseLibraryDirectory: browsingWorkflow,
      indexLibrarySource: createUnusedIndexingWorkflow(),
    });

    const input: BrowseLibraryDirectoryInput = {
      sourceId: 'source-documents',
      parentId: null,
      offset: 20,
      limit: 25,
    };

    await expect(workspace.browseDirectory(input)).resolves.toEqual(browsingResult);

    expect(browsingWorkflow.calls).toEqual([input]);
  });

  it('rejects invalid repository page sizes', () => {
    const repository = new MemoryListingRepository();

    const connectionWorkflow = new StubConnectionWorkflow({
      status: 'cancelled',
    });

    expect(
      () =>
        new LibraryWorkspace({
          librarySourceRepository: repository,
          connectLibrarySource: connectionWorkflow,
          browseLibraryDirectory: createUnusedDirectoryBrowsingWorkflow(),
          indexLibrarySource: createUnusedIndexingWorkflow(),
          pageSize: 0,
        }),
    ).toThrow('Library workspace page size must be an integer between 1 and 500.');

    expect(
      () =>
        new LibraryWorkspace({
          librarySourceRepository: repository,
          connectLibrarySource: connectionWorkflow,
          browseLibraryDirectory: createUnusedDirectoryBrowsingWorkflow(),
          indexLibrarySource: createUnusedIndexingWorkflow(),
          pageSize: 501,
        }),
    ).toThrow('Library workspace page size must be an integer between 1 and 500.');
  });
});
