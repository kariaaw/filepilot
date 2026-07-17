import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FilePilotDatabase } from '@/infrastructure/database/indexeddb/database';
import { IndexedDbLibrarySourceRepository } from '@/infrastructure/database/indexeddb/indexeddb-library-source-repository';
import { createLibrarySource } from '@/test/factories';

describe('IndexedDbLibrarySourceRepository', () => {
  let database: FilePilotDatabase;
  let repository: IndexedDbLibrarySourceRepository;

  beforeEach(() => {
    /*
     * Every test receives a unique database name so records and schema
     * state can never leak between independent test cases.
     */
    database = new FilePilotDatabase(`filepilot-library-source-test-${randomUUID()}`);

    repository = new IndexedDbLibrarySourceRepository(database);
  });

  afterEach(async () => {
    /*
     * Delete the temporary database rather than only closing it.
     * This keeps the test environment deterministic and memory-efficient.
     */
    await database.delete();
  });

  it('saves and returns a library source by ID', async () => {
    const source = createLibrarySource();

    await repository.save(source);

    await expect(repository.getById(source.id)).resolves.toEqual(source);
  });

  it('returns null when a source does not exist', async () => {
    await expect(repository.getById('missing-source')).resolves.toBeNull();
  });

  it('replaces an existing source with the same ID', async () => {
    const source = createLibrarySource();

    await repository.save(source);

    const updatedSource = createLibrarySource({
      id: source.id,
      name: 'Private Documents',
      access: 'permission-required',
      updatedAtMs: source.updatedAtMs + 1_000,
    });

    await repository.save(updatedSource);

    await expect(repository.getById(source.id)).resolves.toEqual(updatedSource);

    await expect(repository.count()).resolves.toBe(1);
  });

  it('filters sources by platform, access state, and hidden-file setting', async () => {
    await repository.saveMany([
      createLibrarySource({
        id: 'browser-source',
        name: 'Browser Documents',
        platform: 'browser',
        access: 'available',
        includeHiddenFiles: false,
      }),

      createLibrarySource({
        id: 'tauri-source',
        name: 'Desktop Projects',
        platform: 'tauri',
        access: 'available',
        includeHiddenFiles: true,
      }),

      createLibrarySource({
        id: 'unavailable-source',
        name: 'Disconnected Drive',
        platform: 'tauri',
        access: 'unavailable',
        includeHiddenFiles: true,
      }),
    ]);

    const result = await repository.find({
      platforms: ['tauri'],
      accessStates: ['available'],
      includeHiddenFiles: true,
    });

    expect(result.total).toBe(1);
    expect(result.items.map((source) => source.id)).toEqual(['tauri-source']);
  });

  it('searches source names and display paths case-insensitively', async () => {
    await repository.saveMany([
      createLibrarySource({
        id: 'documents',
        name: 'Important Documents',
        displayPath: '/home/karya/Documents',
      }),

      createLibrarySource({
        id: 'projects',
        name: 'Development',
        displayPath: '/home/karya/GitHub Projects',
      }),
    ]);

    const nameResult = await repository.find({
      text: 'IMPORTANT',
    });

    const pathResult = await repository.find({
      text: 'github projects',
    });

    expect(nameResult.items.map((source) => source.id)).toEqual(['documents']);

    expect(pathResult.items.map((source) => source.id)).toEqual(['projects']);
  });

  it('uses natural name sorting and returns deterministic pagination', async () => {
    await repository.saveMany([
      createLibrarySource({
        id: 'drive-10',
        name: 'Drive 10',
      }),

      createLibrarySource({
        id: 'drive-2',
        name: 'Drive 2',
      }),

      createLibrarySource({
        id: 'drive-1',
        name: 'Drive 1',
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
    expect(firstPage.items.map((source) => source.name)).toEqual(['Drive 1', 'Drive 2']);

    expect(secondPage.total).toBe(3);
    expect(secondPage.items.map((source) => source.name)).toEqual(['Drive 10']);
  });

  it('counts matching sources without loading a result page', async () => {
    await repository.saveMany([
      createLibrarySource({
        id: 'manual-source',
        syncMode: 'manual',
      }),

      createLibrarySource({
        id: 'scheduled-source',
        syncMode: 'scheduled',
      }),

      createLibrarySource({
        id: 'watch-source',
        syncMode: 'watch',
      }),
    ]);

    await expect(
      repository.count({
        syncModes: ['scheduled', 'watch'],
      }),
    ).resolves.toBe(2);
  });

  it('deletes a source without affecting other sources', async () => {
    await repository.saveMany([
      createLibrarySource({
        id: 'source-to-delete',
        name: 'Temporary',
      }),

      createLibrarySource({
        id: 'source-to-keep',
        name: 'Permanent',
      }),
    ]);

    await repository.deleteById('source-to-delete');

    await expect(repository.getById('source-to-delete')).resolves.toBeNull();

    await expect(repository.getById('source-to-keep')).resolves.not.toBeNull();

    await expect(repository.count()).resolves.toBe(1);
  });
});
