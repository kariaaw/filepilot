import { describe, expect, it } from 'vitest';

import { parseLibrarySource, type LibrarySource } from '@/core/entities/library-source';
import { createFileEntry } from '@/test/factories';
import type {
  AnalyzeDuplicateFilesOptions,
  AnalyzeDuplicateFilesResult,
} from '@/features/library/application/analyze-duplicate-files';
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
import type {
  OpenIndexedEntryInput,
  OpenIndexedEntryResult,
} from '@/features/library/application/open-indexed-entry';
import {
  DEFAULT_TEXT_PREVIEW_BYTES,
  type PreviewIndexedTextEntryInput,
  type PreviewIndexedTextEntryResult,
} from '@/features/library/application/preview-indexed-text-entry';
import type { RemoveLibrarySourceResult } from '@/features/library/application/remove-library-source';
import type {
  SearchIndexedEntriesInput,
  SearchIndexedEntriesResult,
} from '@/features/library/application/search-indexed-entries';
import {
  LibraryWorkspace,
  type LibraryDirectoryBrowsingWorkflow,
  type LibraryDuplicateAnalysisWorkflow,
  type LibraryIndexedEntryOpeningWorkflow,
  type LibraryIndexedEntrySearchWorkflow,
  type LibraryIndexedTextPreviewWorkflow,
  type LibrarySourceConnectionWorkflow,
  type LibrarySourceIndexingWorkflow,
  type LibrarySourceListingRepository,
  type LibrarySourceRemovalWorkflow,
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

class StubIndexedEntrySearchWorkflow implements LibraryIndexedEntrySearchWorkflow {
  readonly calls: SearchIndexedEntriesInput[] = [];

  constructor(private readonly result: SearchIndexedEntriesResult) {}

  async execute(input: SearchIndexedEntriesInput): Promise<SearchIndexedEntriesResult> {
    this.calls.push(input);

    return this.result;
  }
}

class StubIndexedEntryOpeningWorkflow implements LibraryIndexedEntryOpeningWorkflow {
  readonly calls: OpenIndexedEntryInput[] = [];

  constructor(private readonly result: OpenIndexedEntryResult) {}

  async execute(input: OpenIndexedEntryInput): Promise<OpenIndexedEntryResult> {
    this.calls.push(input);

    return this.result;
  }
}

class StubIndexedTextPreviewWorkflow implements LibraryIndexedTextPreviewWorkflow {
  readonly calls: PreviewIndexedTextEntryInput[] = [];

  constructor(private readonly result: PreviewIndexedTextEntryResult) {}

  async execute(input: PreviewIndexedTextEntryInput): Promise<PreviewIndexedTextEntryResult> {
    this.calls.push(input);

    return this.result;
  }
}

class StubDuplicateAnalysisWorkflow implements LibraryDuplicateAnalysisWorkflow {
  readonly calls: AnalyzeDuplicateFilesOptions[] = [];

  constructor(private readonly result: AnalyzeDuplicateFilesResult) {}

  async execute(options: AnalyzeDuplicateFilesOptions = {}): Promise<AnalyzeDuplicateFilesResult> {
    this.calls.push(options);

    return this.result;
  }
}

class StubRemovalWorkflow implements LibrarySourceRemovalWorkflow {
  readonly calls: string[] = [];

  constructor(
    private readonly result: RemoveLibrarySourceResult,
    private readonly onExecute?: () => void,
  ) {}

  async execute(sourceId: string): Promise<RemoveLibrarySourceResult> {
    this.calls.push(sourceId);
    this.onExecute?.();

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

function createUnusedSearchWorkflow(): StubIndexedEntrySearchWorkflow {
  return new StubIndexedEntrySearchWorkflow({
    text: 'unused',
    sourceId: null,
    items: [],
    total: 0,
    offset: 0,
    limit: 50,
  });
}

function createUnusedOpeningWorkflow(): StubIndexedEntryOpeningWorkflow {
  const source = createSource('unused-open-source', 'Unused open source');

  const entry = createFileEntry({
    id: 'unused-open-entry',
    sourceId: source.id,
  });

  return new StubIndexedEntryOpeningWorkflow({
    operation: 'open',
    entry,
    source,
  });
}

function createUnusedPreviewWorkflow(): StubIndexedTextPreviewWorkflow {
  const source = createSource('unused-preview-source', 'Unused preview source');

  const entry = createFileEntry({
    id: 'unused-preview-entry',
    sourceId: source.id,
    name: 'unused.txt',
    relativePath: 'unused.txt',
    extension: 'txt',
    mimeType: 'text/plain',
    category: 'text',
    kind: 'file',
  });

  return new StubIndexedTextPreviewWorkflow({
    entry,
    source,
    text: '',
    bytesRead: 0,
    maximumBytes: DEFAULT_TEXT_PREVIEW_BYTES,
    truncated: false,
  });
}

function createUnusedDuplicateAnalysisWorkflow(): StubDuplicateAnalysisWorkflow {
  return new StubDuplicateAnalysisWorkflow({
    groups: [],
    candidateFileCount: 0,
    hashedFileCount: 0,
    reusedHashCount: 0,
    duplicateGroupCount: 0,
    duplicateFileCount: 0,
    totalDuplicateBytes: 0,
    reclaimableBytes: 0,
  });
}

function createUnusedRemovalWorkflow(): StubRemovalWorkflow {
  const source = createSource('unused-removal-source', 'Unused removal source');

  return new StubRemovalWorkflow({
    source,
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
      searchIndexedEntries: createUnusedSearchWorkflow(),
      openIndexedEntry: createUnusedOpeningWorkflow(),
      previewIndexedTextEntry: createUnusedPreviewWorkflow(),
      analyzeDuplicateFiles: createUnusedDuplicateAnalysisWorkflow(),
      removeLibrarySource: createUnusedRemovalWorkflow(),
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
      searchIndexedEntries: createUnusedSearchWorkflow(),
      openIndexedEntry: createUnusedOpeningWorkflow(),
      previewIndexedTextEntry: createUnusedPreviewWorkflow(),
      analyzeDuplicateFiles: createUnusedDuplicateAnalysisWorkflow(),
      removeLibrarySource: createUnusedRemovalWorkflow(),
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
      searchIndexedEntries: createUnusedSearchWorkflow(),
      openIndexedEntry: createUnusedOpeningWorkflow(),
      previewIndexedTextEntry: createUnusedPreviewWorkflow(),
      analyzeDuplicateFiles: createUnusedDuplicateAnalysisWorkflow(),
      removeLibrarySource: createUnusedRemovalWorkflow(),
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
      searchIndexedEntries: createUnusedSearchWorkflow(),
      openIndexedEntry: createUnusedOpeningWorkflow(),
      previewIndexedTextEntry: createUnusedPreviewWorkflow(),
      analyzeDuplicateFiles: createUnusedDuplicateAnalysisWorkflow(),
      removeLibrarySource: createUnusedRemovalWorkflow(),
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
      searchIndexedEntries: createUnusedSearchWorkflow(),
      openIndexedEntry: createUnusedOpeningWorkflow(),
      previewIndexedTextEntry: createUnusedPreviewWorkflow(),
      analyzeDuplicateFiles: createUnusedDuplicateAnalysisWorkflow(),
      removeLibrarySource: createUnusedRemovalWorkflow(),
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

  it('removes a source and returns the refreshed source list', async () => {
    const removedSource = createSource('source-temporary', 'Temporary');
    const preservedSource = createSource('source-documents', 'Documents');

    const repository = new MemoryListingRepository([removedSource, preservedSource]);

    const removalWorkflow = new StubRemovalWorkflow(
      {
        source: removedSource,
      },
      () => {
        const sourceIndex = repository.sources.findIndex(
          (source) => source.id === removedSource.id,
        );

        if (sourceIndex >= 0) {
          repository.sources.splice(sourceIndex, 1);
        }
      },
    );

    const workspace = new LibraryWorkspace({
      librarySourceRepository: repository,
      connectLibrarySource: new StubConnectionWorkflow({
        status: 'cancelled',
      }),
      browseLibraryDirectory: createUnusedDirectoryBrowsingWorkflow(),
      searchIndexedEntries: createUnusedSearchWorkflow(),
      openIndexedEntry: createUnusedOpeningWorkflow(),
      previewIndexedTextEntry: createUnusedPreviewWorkflow(),
      analyzeDuplicateFiles: createUnusedDuplicateAnalysisWorkflow(),
      removeLibrarySource: removalWorkflow,
      indexLibrarySource: createUnusedIndexingWorkflow(),
    });

    const snapshot = await workspace.removeSource(removedSource.id);

    expect(removalWorkflow.calls).toEqual([removedSource.id]);

    expect(snapshot.removal).toEqual({
      source: removedSource,
    });

    expect(snapshot.sources).toEqual([preservedSource]);
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
      searchIndexedEntries: createUnusedSearchWorkflow(),
      openIndexedEntry: createUnusedOpeningWorkflow(),
      previewIndexedTextEntry: createUnusedPreviewWorkflow(),
      analyzeDuplicateFiles: createUnusedDuplicateAnalysisWorkflow(),
      removeLibrarySource: createUnusedRemovalWorkflow(),
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

  it('searches indexed entries through the workspace facade', async () => {
    const matchingEntry = createFileEntry({
      id: 'report-entry',
      sourceId: 'source-documents',
      name: 'report.pdf',
      relativePath: 'Documents/report.pdf',
    });

    const result: SearchIndexedEntriesResult = {
      text: 'report',
      sourceId: 'source-documents',
      items: [matchingEntry],
      total: 1,
      offset: 0,
      limit: 25,
    };

    const searchWorkflow = new StubIndexedEntrySearchWorkflow(result);

    const workspace = new LibraryWorkspace({
      librarySourceRepository: new MemoryListingRepository(),
      connectLibrarySource: new StubConnectionWorkflow({
        status: 'cancelled',
      }),
      browseLibraryDirectory: createUnusedDirectoryBrowsingWorkflow(),
      searchIndexedEntries: searchWorkflow,
      openIndexedEntry: createUnusedOpeningWorkflow(),
      previewIndexedTextEntry: createUnusedPreviewWorkflow(),
      analyzeDuplicateFiles: createUnusedDuplicateAnalysisWorkflow(),
      removeLibrarySource: createUnusedRemovalWorkflow(),
      indexLibrarySource: createUnusedIndexingWorkflow(),
    });

    const input: SearchIndexedEntriesInput = {
      text: 'report',
      sourceId: 'source-documents',
      offset: 0,
      limit: 25,
    };

    await expect(workspace.searchEntries(input)).resolves.toEqual(result);

    expect(searchWorkflow.calls).toEqual([input]);
  });

  it('opens indexed entries through the workspace facade', async () => {
    const source = createSource('tauri-directory:documents', 'Documents');

    const entry = createFileEntry({
      id: 'entry-report',
      sourceId: source.id,
      name: 'report.pdf',
      relativePath: 'Reports/report.pdf',
    });

    const result: OpenIndexedEntryResult = {
      operation: 'reveal',
      entry,
      source,
    };

    const openingWorkflow = new StubIndexedEntryOpeningWorkflow(result);

    const workspace = new LibraryWorkspace({
      librarySourceRepository: new MemoryListingRepository(),
      connectLibrarySource: new StubConnectionWorkflow({
        status: 'cancelled',
      }),
      browseLibraryDirectory: createUnusedDirectoryBrowsingWorkflow(),
      searchIndexedEntries: createUnusedSearchWorkflow(),
      openIndexedEntry: openingWorkflow,
      previewIndexedTextEntry: createUnusedPreviewWorkflow(),
      analyzeDuplicateFiles: createUnusedDuplicateAnalysisWorkflow(),
      removeLibrarySource: createUnusedRemovalWorkflow(),
      indexLibrarySource: createUnusedIndexingWorkflow(),
    });

    const input: OpenIndexedEntryInput = {
      entryId: entry.id,
      operation: 'reveal',
    };

    await expect(workspace.openEntry(input)).resolves.toEqual(result);

    expect(openingWorkflow.calls).toEqual([input]);
  });

  it('previews indexed text entries through the workspace facade', async () => {
    const source = createSource('tauri-directory:documents', 'Documents');

    const entry = createFileEntry({
      id: 'entry-notes',
      sourceId: source.id,
      name: 'notes.txt',
      relativePath: 'Notes/notes.txt',
      extension: 'txt',
      mimeType: 'text/plain',
      category: 'text',
      kind: 'file',
    });

    const result: PreviewIndexedTextEntryResult = {
      entry,
      source,
      text: 'FilePilot local preview',
      bytesRead: 23,
      maximumBytes: 4_096,
      truncated: false,
    };

    const previewWorkflow = new StubIndexedTextPreviewWorkflow(result);

    const workspace = new LibraryWorkspace({
      librarySourceRepository: new MemoryListingRepository(),
      connectLibrarySource: new StubConnectionWorkflow({
        status: 'cancelled',
      }),
      browseLibraryDirectory: createUnusedDirectoryBrowsingWorkflow(),
      searchIndexedEntries: createUnusedSearchWorkflow(),
      openIndexedEntry: createUnusedOpeningWorkflow(),
      previewIndexedTextEntry: previewWorkflow,
      analyzeDuplicateFiles: createUnusedDuplicateAnalysisWorkflow(),
      removeLibrarySource: createUnusedRemovalWorkflow(),
      indexLibrarySource: createUnusedIndexingWorkflow(),
    });

    const input: PreviewIndexedTextEntryInput = {
      entryId: entry.id,
      maximumBytes: 4_096,
    };

    await expect(workspace.previewTextEntry(input)).resolves.toEqual(result);

    expect(previewWorkflow.calls).toEqual([input]);
  });

  it('analyzes duplicate files through the workspace facade', async () => {
    const result: AnalyzeDuplicateFilesResult = {
      groups: [],
      candidateFileCount: 4,
      hashedFileCount: 3,
      reusedHashCount: 1,
      duplicateGroupCount: 0,
      duplicateFileCount: 0,
      totalDuplicateBytes: 0,
      reclaimableBytes: 0,
    };

    const workflow = new StubDuplicateAnalysisWorkflow(result);

    const workspace = new LibraryWorkspace({
      librarySourceRepository: new MemoryListingRepository(),
      connectLibrarySource: new StubConnectionWorkflow({
        status: 'cancelled',
      }),
      browseLibraryDirectory: createUnusedDirectoryBrowsingWorkflow(),
      searchIndexedEntries: createUnusedSearchWorkflow(),
      openIndexedEntry: createUnusedOpeningWorkflow(),
      previewIndexedTextEntry: createUnusedPreviewWorkflow(),
      analyzeDuplicateFiles: workflow,
      removeLibrarySource: createUnusedRemovalWorkflow(),
      indexLibrarySource: createUnusedIndexingWorkflow(),
    });

    const controller = new AbortController();

    const options: AnalyzeDuplicateFilesOptions = {
      signal: controller.signal,
    };

    await expect(workspace.analyzeDuplicates(options)).resolves.toEqual(result);

    expect(workflow.calls).toEqual([options]);
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
          searchIndexedEntries: createUnusedSearchWorkflow(),
          openIndexedEntry: createUnusedOpeningWorkflow(),
          previewIndexedTextEntry: createUnusedPreviewWorkflow(),
          analyzeDuplicateFiles: createUnusedDuplicateAnalysisWorkflow(),
          removeLibrarySource: createUnusedRemovalWorkflow(),
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
          searchIndexedEntries: createUnusedSearchWorkflow(),
          openIndexedEntry: createUnusedOpeningWorkflow(),
          previewIndexedTextEntry: createUnusedPreviewWorkflow(),
          analyzeDuplicateFiles: createUnusedDuplicateAnalysisWorkflow(),
          removeLibrarySource: createUnusedRemovalWorkflow(),
          indexLibrarySource: createUnusedIndexingWorkflow(),
          pageSize: 501,
        }),
    ).toThrow('Library workspace page size must be an integer between 1 and 500.');
  });
});
