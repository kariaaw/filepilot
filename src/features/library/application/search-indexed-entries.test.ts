import { describe, expect, it } from 'vitest';

import type { FileEntryPage, FileEntryQuery } from '@/core/ports/file-entry-repository';
import {
  SearchIndexedEntries,
  type IndexedEntrySearchRepository,
} from '@/features/library/application/search-indexed-entries';
import { createFileEntry } from '@/test/factories';

class StubSearchRepository implements IndexedEntrySearchRepository {
  readonly queries: FileEntryQuery[] = [];

  constructor(
    private readonly page: FileEntryPage = {
      items: [],
      total: 0,
      offset: 0,
      limit: 50,
    },
  ) {}

  async find(query: FileEntryQuery = {}): Promise<FileEntryPage> {
    this.queries.push(query);

    return this.page;
  }
}

describe('SearchIndexedEntries', () => {
  it('normalizes text and searches indexed entries with safe defaults', async () => {
    const matchingDirectory = createFileEntry({
      id: 'projects-directory',
      name: 'Projects',
      relativePath: 'Projects',
      kind: 'directory',
      extension: null,
      mimeType: null,
      category: 'other',
      sizeBytes: 1_024,
    });

    const matchingFile = createFileEntry({
      id: 'readme-file',
      name: 'README.md',
      relativePath: 'Projects/FilePilot/README.md',
      extension: 'md',
      mimeType: 'text/markdown',
      category: 'text',
    });

    const repository = new StubSearchRepository({
      items: [matchingDirectory, matchingFile],
      total: 2,
      offset: 0,
      limit: 50,
    });

    const search = new SearchIndexedEntries({
      fileEntryRepository: repository,
    });

    await expect(
      search.execute({
        text: '   FilePilot    README   ',
      }),
    ).resolves.toEqual({
      text: 'FilePilot README',
      sourceId: null,
      items: [matchingDirectory, matchingFile],
      total: 2,
      offset: 0,
      limit: 50,
    });

    expect(repository.queries).toEqual([
      {
        text: 'FilePilot README',
        sourceId: undefined,
        kinds: undefined,
        sortBy: 'kind',
        sortDirection: 'ascending',
        offset: 0,
        limit: 50,
      },
    ]);
  });

  it('supports source, kind, and pagination filters', async () => {
    const repository = new StubSearchRepository({
      items: [],
      total: 24,
      offset: 10,
      limit: 20,
    });

    const search = new SearchIndexedEntries({
      fileEntryRepository: repository,
    });

    const result = await search.execute({
      text: 'photo',
      sourceId: '  source-pictures  ',
      kinds: ['file'],
      offset: 10,
      limit: 20,
    });

    expect(result).toEqual({
      text: 'photo',
      sourceId: 'source-pictures',
      items: [],
      total: 24,
      offset: 10,
      limit: 20,
    });

    expect(repository.queries).toEqual([
      {
        text: 'photo',
        sourceId: 'source-pictures',
        kinds: ['file'],
        sortBy: 'kind',
        sortDirection: 'ascending',
        offset: 10,
        limit: 20,
      },
    ]);
  });

  it('rejects empty and oversized search text before reading the repository', async () => {
    const repository = new StubSearchRepository();

    const search = new SearchIndexedEntries({
      fileEntryRepository: repository,
    });

    await expect(
      search.execute({
        text: '   ',
      }),
    ).rejects.toThrow('Search text must not be empty.');

    await expect(
      search.execute({
        text: 'a'.repeat(257),
      }),
    ).rejects.toThrow('Search text must not exceed 256 characters.');

    expect(repository.queries).toEqual([]);
  });

  it('rejects an empty source identifier', async () => {
    const repository = new StubSearchRepository();

    const search = new SearchIndexedEntries({
      fileEntryRepository: repository,
    });

    await expect(
      search.execute({
        text: 'report',
        sourceId: '   ',
      }),
    ).rejects.toThrow('Search source identifier must not be empty.');

    expect(repository.queries).toEqual([]);
  });

  it('rejects invalid pagination values', async () => {
    const repository = new StubSearchRepository();

    const search = new SearchIndexedEntries({
      fileEntryRepository: repository,
    });

    await expect(
      search.execute({
        text: 'report',
        offset: -1,
      }),
    ).rejects.toThrow('Search offset must be a non-negative integer.');

    await expect(
      search.execute({
        text: 'report',
        limit: 201,
      }),
    ).rejects.toThrow('Search limit must be an integer between 1 and 200.');

    expect(repository.queries).toEqual([]);
  });
});
