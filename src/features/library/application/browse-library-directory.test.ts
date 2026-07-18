import { describe, expect, it } from 'vitest';

import type { FileEntry } from '@/core/entities/file-entry';
import type { FileEntryPage, FileEntryQuery } from '@/core/ports/file-entry-repository';
import {
  BrowseLibraryDirectory,
  type LibraryDirectoryBrowsingRepository,
} from '@/features/library/application/browse-library-directory';
import { createFileEntry } from '@/test/factories';

function createPage(items: readonly FileEntry[] = []): FileEntryPage {
  return {
    items,
    total: items.length,
    offset: 0,
    limit: 100,
  };
}

class StubDirectoryBrowsingRepository implements LibraryDirectoryBrowsingRepository {
  readonly getByIdCalls: string[] = [];
  readonly findQueries: FileEntryQuery[] = [];

  constructor(
    private readonly entriesById: ReadonlyMap<string, FileEntry> = new Map(),
    private readonly page: FileEntryPage = createPage(),
  ) {}

  async getById(id: string): Promise<FileEntry | null> {
    this.getByIdCalls.push(id);

    return this.entriesById.get(id) ?? null;
  }

  async find(query: FileEntryQuery = {}): Promise<FileEntryPage> {
    this.findQueries.push(query);

    return this.page;
  }
}

describe('BrowseLibraryDirectory', () => {
  it('loads the root of a source using bounded folder-first pagination', async () => {
    const rootDirectory = createFileEntry({
      id: 'documents-directory',
      parentId: null,
      name: 'Documents',
      relativePath: 'Documents',
      kind: 'directory',
      extension: null,
      mimeType: null,
      category: 'other',
      sizeBytes: 0,
    });

    const rootFile = createFileEntry({
      id: 'readme-file',
      parentId: null,
      name: 'README.md',
      relativePath: 'README.md',
      extension: 'md',
      mimeType: 'text/markdown',
      category: 'text',
    });

    const page: FileEntryPage = {
      items: [rootDirectory, rootFile],
      total: 2,
      offset: 20,
      limit: 25,
    };

    const repository = new StubDirectoryBrowsingRepository(new Map(), page);

    const browser = new BrowseLibraryDirectory({
      fileEntryRepository: repository,
    });

    await expect(
      browser.execute({
        sourceId: ' source-1 ',
        offset: 20,
        limit: 25,
      }),
    ).resolves.toEqual({
      sourceId: 'source-1',
      currentDirectory: null,
      ...page,
    });

    expect(repository.getByIdCalls).toEqual([]);

    expect(repository.findQueries).toEqual([
      {
        sourceId: 'source-1',
        parentId: null,
        sortBy: 'kind',
        sortDirection: 'ascending',
        offset: 20,
        limit: 25,
      },
    ]);
  });

  it('loads the direct children of a validated directory', async () => {
    const directory = createFileEntry({
      id: 'projects-directory',
      sourceId: 'source-1',
      parentId: null,
      name: 'Projects',
      relativePath: 'Projects',
      kind: 'directory',
      extension: null,
      mimeType: null,
      category: 'other',
      sizeBytes: 0,
    });

    const repository = new StubDirectoryBrowsingRepository(
      new Map([[directory.id, directory]]),
      createPage(),
    );

    const browser = new BrowseLibraryDirectory({
      fileEntryRepository: repository,
    });

    const result = await browser.execute({
      sourceId: 'source-1',
      parentId: directory.id,
    });

    expect(result.currentDirectory).toEqual(directory);
    expect(repository.getByIdCalls).toEqual([directory.id]);

    expect(repository.findQueries).toEqual([
      {
        sourceId: 'source-1',
        parentId: directory.id,
        sortBy: 'kind',
        sortDirection: 'ascending',
        offset: 0,
        limit: 100,
      },
    ]);
  });

  it('rejects a directory that no longer exists', async () => {
    const repository = new StubDirectoryBrowsingRepository();

    const browser = new BrowseLibraryDirectory({
      fileEntryRepository: repository,
    });

    await expect(
      browser.execute({
        sourceId: 'source-1',
        parentId: 'missing-directory',
      }),
    ).rejects.toThrow('The selected indexed directory no longer exists.');

    expect(repository.findQueries).toEqual([]);
  });

  it('rejects a directory belonging to a different source', async () => {
    const directory = createFileEntry({
      id: 'foreign-directory',
      sourceId: 'source-2',
      kind: 'directory',
      extension: null,
      mimeType: null,
      category: 'other',
      sizeBytes: 0,
    });

    const repository = new StubDirectoryBrowsingRepository(new Map([[directory.id, directory]]));

    const browser = new BrowseLibraryDirectory({
      fileEntryRepository: repository,
    });

    await expect(
      browser.execute({
        sourceId: 'source-1',
        parentId: directory.id,
      }),
    ).rejects.toThrow('The selected directory does not belong to the requested library source.');

    expect(repository.findQueries).toEqual([]);
  });

  it('rejects a regular file as the current directory', async () => {
    const file = createFileEntry({
      id: 'readme-file',
      sourceId: 'source-1',
    });

    const repository = new StubDirectoryBrowsingRepository(new Map([[file.id, file]]));

    const browser = new BrowseLibraryDirectory({
      fileEntryRepository: repository,
    });

    await expect(
      browser.execute({
        sourceId: 'source-1',
        parentId: file.id,
      }),
    ).rejects.toThrow('The selected indexed entry is not a directory.');

    expect(repository.findQueries).toEqual([]);
  });

  it.each([
    {
      input: { sourceId: '   ' },
      message: 'A library source identifier is required.',
    },
    {
      input: { sourceId: 'source-1', parentId: '   ' },
      message: 'A parent directory identifier cannot be empty.',
    },
    {
      input: { sourceId: 'source-1', offset: -1 },
      message: 'Directory browsing offset must be a non-negative integer.',
    },
    {
      input: { sourceId: 'source-1', offset: 1.5 },
      message: 'Directory browsing offset must be a non-negative integer.',
    },
    {
      input: { sourceId: 'source-1', limit: 0 },
      message: 'Directory browsing limit must be an integer between 1 and 500.',
    },
    {
      input: { sourceId: 'source-1', limit: 501 },
      message: 'Directory browsing limit must be an integer between 1 and 500.',
    },
  ])('rejects invalid browsing input: $message', async ({ input, message }) => {
    const repository = new StubDirectoryBrowsingRepository();

    const browser = new BrowseLibraryDirectory({
      fileEntryRepository: repository,
    });

    await expect(browser.execute(input)).rejects.toThrow(message);

    expect(repository.getByIdCalls).toEqual([]);
    expect(repository.findQueries).toEqual([]);
  });
});
