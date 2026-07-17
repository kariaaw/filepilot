import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FilePilotDatabase } from '@/infrastructure/database/indexeddb/database';
import { IndexedDbFileEntryRepository } from '@/infrastructure/database/indexeddb/indexeddb-file-entry-repository';
import { createFileEntry } from '@/test/factories';

describe('IndexedDbFileEntryRepository', () => {
  let database: FilePilotDatabase;
  let repository: IndexedDbFileEntryRepository;

  beforeEach(() => {
    /*
     * A unique database prevents records and schema state from leaking
     * between tests that run in the same Vitest process.
     */
    database = new FilePilotDatabase(`filepilot-file-entry-test-${randomUUID()}`);

    repository = new IndexedDbFileEntryRepository(database);
  });

  afterEach(async () => {
    /*
     * Remove the complete temporary database after every test rather than
     * leaving unused IndexedDB instances in the test environment.
     */
    await database.delete();
  });

  it('saves and returns a file entry by ID', async () => {
    const entry = createFileEntry();

    await repository.save(entry);

    await expect(repository.getById(entry.id)).resolves.toEqual(entry);
  });

  it('returns null when an entry does not exist', async () => {
    await expect(repository.getById('missing-entry')).resolves.toBeNull();
  });

  it('replaces an existing entry with the same ID', async () => {
    const originalEntry = createFileEntry();

    await repository.save(originalEntry);

    const updatedEntry = createFileEntry({
      id: originalEntry.id,
      name: 'updated-document.pdf',
      relativePath: 'updated-document.pdf',
      sizeBytes: 4_096,
      tags: ['updated'],
    });

    await repository.save(updatedEntry);

    await expect(repository.getById(originalEntry.id)).resolves.toEqual(updatedEntry);

    await expect(repository.count()).resolves.toBe(1);
  });

  it('finds direct children of one directory inside a source', async () => {
    await repository.saveMany([
      createFileEntry({
        id: 'root-file',
        sourceId: 'source-1',
        parentId: null,
        name: 'root.txt',
        extension: 'txt',
        relativePath: 'root.txt',
        mimeType: 'text/plain',
        category: 'text',
      }),

      createFileEntry({
        id: 'projects-directory',
        sourceId: 'source-1',
        parentId: null,
        name: 'Projects',
        extension: null,
        relativePath: 'Projects',
        kind: 'directory',
        mimeType: null,
        category: 'other',
        sizeBytes: 0,
      }),

      createFileEntry({
        id: 'nested-file',
        sourceId: 'source-1',
        parentId: 'projects-directory',
        name: 'notes.txt',
        extension: 'txt',
        relativePath: 'Projects/notes.txt',
        mimeType: 'text/plain',
        category: 'text',
      }),

      createFileEntry({
        id: 'different-source-file',
        sourceId: 'source-2',
        parentId: null,
        name: 'other.txt',
        extension: 'txt',
        relativePath: 'other.txt',
        mimeType: 'text/plain',
        category: 'text',
      }),
    ]);

    const rootResult = await repository.find({
      sourceId: 'source-1',
      parentId: null,
    });

    const nestedResult = await repository.find({
      sourceId: 'source-1',
      parentId: 'projects-directory',
    });

    expect(rootResult.items.map((entry) => entry.id)).toEqual(['projects-directory', 'root-file']);

    expect(nestedResult.items.map((entry) => entry.id)).toEqual(['nested-file']);
  });

  it('combines text, extension, and tag filters case-insensitively', async () => {
    await repository.saveMany([
      createFileEntry({
        id: 'motor-document',
        name: 'Lens Motor Datasheet.pdf',
        relativePath: 'Documents/Lens Motor Datasheet.pdf',
        extension: 'pdf',
        tags: ['Hardware', 'Important'],
      }),

      createFileEntry({
        id: 'motor-image',
        name: 'Lens Motor.jpg',
        relativePath: 'Images/Lens Motor.jpg',
        extension: 'jpg',
        mimeType: 'image/jpeg',
        category: 'image',
        tags: ['Hardware'],
      }),

      createFileEntry({
        id: 'unrelated-document',
        name: 'Invoice.pdf',
        relativePath: 'Documents/Invoice.pdf',
        extension: 'pdf',
        tags: ['Finance', 'Important'],
      }),
    ]);

    const result = await repository.find({
      text: 'MOTOR',
      extensions: ['.PDF'],
      tags: ['important', 'HARDWARE'],
    });

    expect(result.total).toBe(1);
    expect(result.items.map((entry) => entry.id)).toEqual(['motor-document']);
  });

  it('filters by metadata, size, timestamps, and security level', async () => {
    await repository.saveMany([
      createFileEntry({
        id: 'private-video',
        category: 'video',
        extension: 'mp4',
        mimeType: 'video/mp4',
        sizeBytes: 10_000,
        createdAtMs: 2_000,
        modifiedAtMs: 5_000,
        indexedAtMs: 8_000,
        securityLevel: 'private',
      }),

      createFileEntry({
        id: 'small-video',
        category: 'video',
        extension: 'mp4',
        mimeType: 'video/mp4',
        sizeBytes: 500,
        createdAtMs: 2_000,
        modifiedAtMs: 5_000,
        indexedAtMs: 8_000,
        securityLevel: 'private',
      }),

      createFileEntry({
        id: 'standard-document',
        category: 'document',
        sizeBytes: 10_000,
        createdAtMs: 2_000,
        modifiedAtMs: 5_000,
        indexedAtMs: 8_000,
        securityLevel: 'standard',
      }),
    ]);

    const result = await repository.find({
      categories: ['video'],
      securityLevels: ['private'],
      minimumSizeBytes: 1_000,
      maximumSizeBytes: 20_000,
      createdAfterMs: 1_000,
      createdBeforeMs: 3_000,
      modifiedAfterMs: 4_000,
      modifiedBeforeMs: 6_000,
      indexedAfterMs: 7_000,
      indexedBeforeMs: 9_000,
    });

    expect(result.total).toBe(1);
    expect(result.items[0]?.id).toBe('private-video');
  });

  it('uses natural name sorting with deterministic pagination', async () => {
    await repository.saveMany([
      createFileEntry({
        id: 'file-10',
        name: 'File 10.txt',
        relativePath: 'File 10.txt',
        extension: 'txt',
        mimeType: 'text/plain',
        category: 'text',
      }),

      createFileEntry({
        id: 'file-2',
        name: 'File 2.txt',
        relativePath: 'File 2.txt',
        extension: 'txt',
        mimeType: 'text/plain',
        category: 'text',
      }),

      createFileEntry({
        id: 'file-1',
        name: 'File 1.txt',
        relativePath: 'File 1.txt',
        extension: 'txt',
        mimeType: 'text/plain',
        category: 'text',
      }),
    ]);

    const firstPage = await repository.find({
      sortBy: 'name',
      sortDirection: 'ascending',
      offset: 0,
      limit: 2,
    });

    const secondPage = await repository.find({
      sortBy: 'name',
      sortDirection: 'ascending',
      offset: 2,
      limit: 2,
    });

    expect(firstPage.total).toBe(3);
    expect(firstPage.items.map((entry) => entry.name)).toEqual(['File 1.txt', 'File 2.txt']);

    expect(secondPage.total).toBe(3);
    expect(secondPage.items.map((entry) => entry.name)).toEqual(['File 10.txt']);
  });

  it('counts matching entries and deletes only one source library', async () => {
    await repository.saveMany([
      createFileEntry({
        id: 'source-1-document',
        sourceId: 'source-1',
        category: 'document',
      }),

      createFileEntry({
        id: 'source-1-image',
        sourceId: 'source-1',
        name: 'image.jpg',
        relativePath: 'image.jpg',
        extension: 'jpg',
        mimeType: 'image/jpeg',
        category: 'image',
      }),

      createFileEntry({
        id: 'source-2-document',
        sourceId: 'source-2',
        category: 'document',
      }),
    ]);

    await expect(
      repository.count({
        sourceId: 'source-1',
        categories: ['document'],
      }),
    ).resolves.toBe(1);

    await repository.deleteBySourceId('source-1');

    await expect(
      repository.count({
        sourceId: 'source-1',
      }),
    ).resolves.toBe(0);

    await expect(repository.getById('source-2-document')).resolves.not.toBeNull();
  });
  it('atomically replaces every entry belonging to one source', async () => {
    await repository.saveMany([
      createFileEntry({
        id: 'stale-source-1-file',
        sourceId: 'source-1',
        name: 'stale.txt',
        relativePath: 'stale.txt',
        extension: 'txt',
        mimeType: 'text/plain',
        category: 'text',
      }),
      createFileEntry({
        id: 'preserved-source-2-file',
        sourceId: 'source-2',
        name: 'preserved.pdf',
        relativePath: 'preserved.pdf',
      }),
    ]);

    await repository.replaceForSource('source-1', [
      createFileEntry({
        id: 'replacement-directory',
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
        id: 'replacement-file',
        sourceId: 'source-1',
        parentId: 'replacement-directory',
        name: 'README.md',
        relativePath: 'Projects/README.md',
        extension: 'md',
        mimeType: 'text/markdown',
        category: 'text',
      }),
    ]);

    const sourceOneEntries = await repository.find({
      sourceId: 'source-1',
    });

    expect(sourceOneEntries.items.map((entry) => entry.id)).toEqual([
      'replacement-directory',
      'replacement-file',
    ]);

    await expect(repository.getById('stale-source-1-file')).resolves.toBeNull();

    await expect(repository.getById('preserved-source-2-file')).resolves.not.toBeNull();
  });

  it('clears a source index when the replacement collection is empty', async () => {
    await repository.saveMany([
      createFileEntry({
        id: 'source-1-file',
        sourceId: 'source-1',
      }),
      createFileEntry({
        id: 'source-2-file',
        sourceId: 'source-2',
      }),
    ]);

    await repository.replaceForSource('source-1', []);

    await expect(
      repository.count({
        sourceId: 'source-1',
      }),
    ).resolves.toBe(0);

    await expect(
      repository.count({
        sourceId: 'source-2',
      }),
    ).resolves.toBe(1);
  });

  it('rejects mismatched replacement entries without deleting existing data', async () => {
    const existingEntry = createFileEntry({
      id: 'existing-source-1-file',
      sourceId: 'source-1',
    });

    await repository.save(existingEntry);

    await expect(
      repository.replaceForSource('source-1', [
        createFileEntry({
          id: 'wrong-source-file',
          sourceId: 'source-2',
        }),
      ]),
    ).rejects.toThrow('Every replacement entry must belong to the requested library source.');

    await expect(repository.getById(existingEntry.id)).resolves.toEqual(existingEntry);
  });
});
