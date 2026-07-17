import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FilePilotDatabase } from '@/infrastructure/database/indexeddb/database';
import { IndexedDbFileEntryRepository } from '@/infrastructure/database/indexeddb/indexeddb-file-entry-repository';
import { IndexedDbLibraryIndexRepository } from '@/infrastructure/database/indexeddb/indexeddb-library-index-repository';
import { IndexedDbLibrarySourceRepository } from '@/infrastructure/database/indexeddb/indexeddb-library-source-repository';
import { createFileEntry, createLibrarySource } from '@/test/factories';

describe('IndexedDbLibraryIndexRepository', () => {
  let database: FilePilotDatabase;
  let indexRepository: IndexedDbLibraryIndexRepository;
  let fileEntryRepository: IndexedDbFileEntryRepository;
  let sourceRepository: IndexedDbLibrarySourceRepository;

  beforeEach(() => {
    database = new FilePilotDatabase(`filepilot-library-index-test-${randomUUID()}`);

    indexRepository = new IndexedDbLibraryIndexRepository(database);

    fileEntryRepository = new IndexedDbFileEntryRepository(database);

    sourceRepository = new IndexedDbLibrarySourceRepository(database);
  });

  afterEach(async () => {
    await database.delete();
  });

  it('atomically replaces source entries and cached statistics', async () => {
    const originalSource = createLibrarySource({
      id: 'source-1',
      lastScannedAtMs: null,
      statistics: {
        fileCount: 1,
        directoryCount: 0,
        totalSizeBytes: 100,
      },
    });

    const otherSource = createLibrarySource({
      id: 'source-2',
      name: 'Pictures',
      displayPath: '/home/karya/Pictures',
    });

    await sourceRepository.saveMany([originalSource, otherSource]);

    await fileEntryRepository.saveMany([
      createFileEntry({
        id: 'stale-entry',
        sourceId: 'source-1',
        name: 'stale.txt',
        relativePath: 'stale.txt',
        extension: 'txt',
        mimeType: 'text/plain',
        category: 'text',
      }),

      createFileEntry({
        id: 'preserved-entry',
        sourceId: 'source-2',
        name: 'photo.jpg',
        relativePath: 'photo.jpg',
        extension: 'jpg',
        mimeType: 'image/jpeg',
        category: 'image',
      }),
    ]);

    const scannedSource = createLibrarySource({
      ...originalSource,
      lastScannedAtMs: 2_000,
      updatedAtMs: 2_000,
      statistics: {
        fileCount: 1,
        directoryCount: 1,
        totalSizeBytes: 4_096,
      },
    });

    await indexRepository.replaceSourceIndex(scannedSource, [
      createFileEntry({
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
      }),

      createFileEntry({
        id: 'readme-file',
        sourceId: 'source-1',
        parentId: 'projects-directory',
        name: 'README.md',
        relativePath: 'Projects/README.md',
        extension: 'md',
        mimeType: 'text/markdown',
        category: 'text',
        sizeBytes: 4_096,
      }),
    ]);

    await expect(sourceRepository.getById('source-1')).resolves.toEqual(scannedSource);

    const sourceOneEntries = await fileEntryRepository.find({
      sourceId: 'source-1',
    });

    expect(sourceOneEntries.items.map((entry) => entry.id).sort()).toEqual([
      'projects-directory',
      'readme-file',
    ]);

    await expect(fileEntryRepository.getById('stale-entry')).resolves.toBeNull();

    await expect(sourceRepository.getById('source-2')).resolves.toEqual(otherSource);

    await expect(fileEntryRepository.getById('preserved-entry')).resolves.not.toBeNull();
  });

  it('commits an empty source index with zero statistics', async () => {
    const originalSource = createLibrarySource({
      id: 'source-1',
    });

    await sourceRepository.save(originalSource);

    await fileEntryRepository.save(
      createFileEntry({
        id: 'existing-entry',
        sourceId: 'source-1',
      }),
    );

    const emptySource = createLibrarySource({
      ...originalSource,
      lastScannedAtMs: 3_000,
      updatedAtMs: 3_000,
      statistics: {
        fileCount: 0,
        directoryCount: 0,
        totalSizeBytes: 0,
      },
    });

    await indexRepository.replaceSourceIndex(emptySource, []);

    await expect(
      fileEntryRepository.count({
        sourceId: 'source-1',
      }),
    ).resolves.toBe(0);

    await expect(sourceRepository.getById('source-1')).resolves.toEqual(emptySource);
  });

  it('rejects mismatched entries before changing stored data', async () => {
    const originalSource = createLibrarySource({
      id: 'source-1',
    });

    const existingEntry = createFileEntry({
      id: 'existing-entry',
      sourceId: 'source-1',
    });

    await sourceRepository.save(originalSource);
    await fileEntryRepository.save(existingEntry);

    await expect(
      indexRepository.replaceSourceIndex(
        createLibrarySource({
          ...originalSource,
          lastScannedAtMs: 4_000,
          updatedAtMs: 4_000,
        }),
        [
          createFileEntry({
            id: 'wrong-source-entry',
            sourceId: 'source-2',
          }),
        ],
      ),
    ).rejects.toThrow('Every indexed entry must belong to the committed library source.');

    await expect(sourceRepository.getById('source-1')).resolves.toEqual(originalSource);

    await expect(fileEntryRepository.getById(existingEntry.id)).resolves.toEqual(existingEntry);
  });
});
