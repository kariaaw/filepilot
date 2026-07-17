import { describe, expect, it } from 'vitest';

import { parseLibrarySource, type LibrarySource } from '@/core/entities/library-source';
import type { LibrarySourcePage, LibrarySourceQuery } from '@/core/ports/library-source-repository';
import type { ConnectLibrarySourceResult } from '@/features/library/application/connect-library-source';
import {
  LibraryWorkspace,
  type LibrarySourceConnectionWorkflow,
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

describe('LibraryWorkspace', () => {
  it('loads all sources through bounded repository pages', async () => {
    const repository = new MemoryListingRepository([
      createSource('source-c', 'Videos'),
      createSource('source-a', 'Documents'),
      createSource('source-b', 'Pictures'),
    ]);

    const workflow = new StubConnectionWorkflow({
      status: 'cancelled',
    });

    const workspace = new LibraryWorkspace({
      librarySourceRepository: repository,
      connectLibrarySource: workflow,
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
    });

    const snapshot = await workspace.connectDirectory();

    expect(snapshot.connection).toEqual({
      status: 'cancelled',
    });
    expect(snapshot.sources).toEqual([existingSource]);
    expect(snapshot.total).toBe(1);
  });

  it('rejects invalid repository page sizes', () => {
    const repository = new MemoryListingRepository();
    const workflow = new StubConnectionWorkflow({
      status: 'cancelled',
    });

    expect(
      () =>
        new LibraryWorkspace({
          librarySourceRepository: repository,
          connectLibrarySource: workflow,
          pageSize: 0,
        }),
    ).toThrow('Library workspace page size must be an integer between 1 and 500.');

    expect(
      () =>
        new LibraryWorkspace({
          librarySourceRepository: repository,
          connectLibrarySource: workflow,
          pageSize: 501,
        }),
    ).toThrow('Library workspace page size must be an integer between 1 and 500.');
  });
});
