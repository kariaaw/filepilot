import { describe, expect, it } from 'vitest';

import { parseLibrarySource, type LibrarySource } from '@/core/entities/library-source';
import type {
  DirectorySelectionAdapter,
  SelectedDirectory,
} from '@/core/ports/file-system-adapter';
import {
  ConnectLibrarySource,
  type LibrarySourceConnectionRepository,
} from '@/features/library/application/connect-library-source';

const SELECTED_DIRECTORY: SelectedDirectory = {
  accessKey: 'tauri-directory:documents',
  name: 'Documents',
  displayPath: '/home/karya/Documents',
  platform: 'tauri',
  access: 'available',
};

function createDirectoryAdapter(
  selection: SelectedDirectory | null,
  platform: DirectorySelectionAdapter['platform'] = 'tauri',
): DirectorySelectionAdapter {
  return {
    platform,
    selectDirectory: () => Promise.resolve(selection),
  };
}

class MemoryLibrarySourceRepository implements LibrarySourceConnectionRepository {
  private readonly sources = new Map<string, LibrarySource>();

  saveCount = 0;

  constructor(initialSources: readonly LibrarySource[] = []) {
    for (const source of initialSources) {
      this.sources.set(source.id, source);
    }
  }

  get size(): number {
    return this.sources.size;
  }

  async getById(id: string): Promise<LibrarySource | null> {
    return this.sources.get(id) ?? null;
  }

  async save(source: LibrarySource): Promise<void> {
    this.sources.set(source.id, source);
    this.saveCount += 1;
  }
}

describe('ConnectLibrarySource', () => {
  it('returns cancelled without writing when the picker is closed', async () => {
    const repository = new MemoryLibrarySourceRepository();

    const useCase = new ConnectLibrarySource({
      directorySelectionAdapter: createDirectoryAdapter(null),
      librarySourceRepository: repository,
      now: () => 1_000,
    });

    await expect(useCase.execute()).resolves.toEqual({
      status: 'cancelled',
    });

    expect(repository.size).toBe(0);
    expect(repository.saveCount).toBe(0);
  });

  it('creates and persists a new library source', async () => {
    const repository = new MemoryLibrarySourceRepository();

    const useCase = new ConnectLibrarySource({
      directorySelectionAdapter: createDirectoryAdapter(SELECTED_DIRECTORY),
      librarySourceRepository: repository,
      now: () => 1_725_000_000_000,
    });

    const result = await useCase.execute();

    expect(result).toEqual({
      status: 'created',
      source: {
        id: 'tauri-directory:documents',
        name: 'Documents',
        platform: 'tauri',
        displayPath: '/home/karya/Documents',
        access: 'available',
        syncMode: 'manual',
        includeHiddenFiles: false,
        excludedPatterns: ['.git', 'node_modules', 'target', 'dist', 'build'],
        addedAtMs: 1_725_000_000_000,
        lastScannedAtMs: null,
        updatedAtMs: 1_725_000_000_000,
        statistics: {
          fileCount: 0,
          directoryCount: 0,
          totalSizeBytes: 0,
        },
      },
    });

    expect(await repository.getById('tauri-directory:documents')).toEqual(
      result.status === 'created' ? result.source : null,
    );

    expect(repository.saveCount).toBe(1);
  });

  it('reconnects an existing source while preserving user settings', async () => {
    const existingSource = parseLibrarySource({
      id: 'tauri-directory:documents',
      name: 'My private documents',
      platform: 'tauri',
      displayPath: '/old/documents/path',
      access: 'unavailable',
      syncMode: 'watch',
      includeHiddenFiles: true,
      excludedPatterns: ['cache'],
      addedAtMs: 500,
      lastScannedAtMs: 900,
      updatedAtMs: 950,
      statistics: {
        fileCount: 120,
        directoryCount: 14,
        totalSizeBytes: 98_000,
      },
    });

    const repository = new MemoryLibrarySourceRepository([existingSource]);

    const useCase = new ConnectLibrarySource({
      directorySelectionAdapter: createDirectoryAdapter(SELECTED_DIRECTORY),
      librarySourceRepository: repository,
      now: () => 2_000,
    });

    const result = await useCase.execute();

    expect(result.status).toBe('reconnected');

    if (result.status !== 'reconnected') {
      throw new Error('Expected the existing source to reconnect.');
    }

    expect(result.source).toEqual({
      ...existingSource,
      displayPath: '/home/karya/Documents',
      access: 'available',
      updatedAtMs: 2_000,
    });

    expect(result.source.name).toBe('My private documents');
    expect(result.source.syncMode).toBe('watch');
    expect(result.source.statistics.fileCount).toBe(120);
  });

  it('does not create duplicates when the same directory is selected repeatedly', async () => {
    const repository = new MemoryLibrarySourceRepository();

    let timestamp = 1_000;

    const useCase = new ConnectLibrarySource({
      directorySelectionAdapter: createDirectoryAdapter(SELECTED_DIRECTORY),
      librarySourceRepository: repository,
      now: () => timestamp++,
    });

    const firstResult = await useCase.execute();
    const secondResult = await useCase.execute();

    expect(firstResult.status).toBe('created');
    expect(secondResult.status).toBe('reconnected');
    expect(repository.size).toBe(1);
    expect(repository.saveCount).toBe(2);
  });

  it('rejects metadata returned for a different platform', async () => {
    const repository = new MemoryLibrarySourceRepository();

    const useCase = new ConnectLibrarySource({
      directorySelectionAdapter: createDirectoryAdapter(SELECTED_DIRECTORY, 'browser'),
      librarySourceRepository: repository,
      now: () => 1_000,
    });

    await expect(useCase.execute()).rejects.toThrow(
      'The selected directory platform does not match the active file-system adapter.',
    );

    expect(repository.saveCount).toBe(0);
  });

  it('rejects invalid timestamps before persisting a source', async () => {
    const repository = new MemoryLibrarySourceRepository();

    const useCase = new ConnectLibrarySource({
      directorySelectionAdapter: createDirectoryAdapter(SELECTED_DIRECTORY),
      librarySourceRepository: repository,
      now: () => Number.NaN,
    });

    await expect(useCase.execute()).rejects.toThrow(
      'The library connection clock must return a non-negative integer timestamp.',
    );

    expect(repository.saveCount).toBe(0);
  });
});
