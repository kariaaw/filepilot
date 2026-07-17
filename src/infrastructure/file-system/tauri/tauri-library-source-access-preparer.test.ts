import { describe, expect, it } from 'vitest';

import { parseLibrarySource, type LibrarySource } from '@/core/entities/library-source';
import { TauriLibrarySourceAccessPreparer } from '@/infrastructure/file-system/tauri/tauri-library-source-access-preparer';
import { TauriNativePathRegistry } from '@/infrastructure/file-system/tauri/tauri-native-path-registry';

function createLibrarySource(overrides: Partial<LibrarySource> = {}): LibrarySource {
  return parseLibrarySource({
    id: 'tauri-directory:documents',
    name: 'Documents',
    platform: 'tauri',
    displayPath: '/home/karya/Documents',
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
    ...overrides,
  });
}

describe('TauriLibrarySourceAccessPreparer', () => {
  it('identifies itself as a Tauri access preparer', () => {
    const preparer = new TauriLibrarySourceAccessPreparer(new TauriNativePathRegistry(), {
      restoreRecursiveScope: async () => undefined,
    });

    expect(preparer.platform).toBe('tauri');
  });

  it('restores recursive scope and the persisted native path', async () => {
    const restoredPaths: string[] = [];
    const registry = new TauriNativePathRegistry();

    const source = createLibrarySource();

    const preparer = new TauriLibrarySourceAccessPreparer(registry, {
      restoreRecursiveScope: async (nativePath) => {
        restoredPaths.push(nativePath);
      },
    });

    await preparer.prepareSource(source);

    expect(restoredPaths).toEqual([source.displayPath]);

    expect(registry.resolve(source.id)).toBe(source.displayPath);
  });

  it('replaces a stale native path after restoring scope', async () => {
    const registry = new TauriNativePathRegistry();

    const source = createLibrarySource();

    registry.register(source.id, '/stale/path');

    const preparer = new TauriLibrarySourceAccessPreparer(registry, {
      restoreRecursiveScope: async () => undefined,
    });

    await preparer.prepareSource(source);

    expect(registry.resolve(source.id)).toBe(source.displayPath);
  });

  it('rejects sources owned by another platform', async () => {
    const restoredPaths: string[] = [];

    const source = createLibrarySource({
      id: 'browser-source',
      platform: 'browser',
    });

    const preparer = new TauriLibrarySourceAccessPreparer(new TauriNativePathRegistry(), {
      restoreRecursiveScope: async (nativePath) => {
        restoredPaths.push(nativePath);
      },
    });

    await expect(preparer.prepareSource(source)).rejects.toThrow(
      'Only Tauri library sources can be prepared by the Tauri access preparer.',
    );

    expect(restoredPaths).toEqual([]);
  });

  it('does not restore access when preparation is already cancelled', async () => {
    const controller = new AbortController();

    controller.abort();

    const restoredPaths: string[] = [];
    const registry = new TauriNativePathRegistry();

    const source = createLibrarySource();

    const preparer = new TauriLibrarySourceAccessPreparer(registry, {
      restoreRecursiveScope: async (nativePath) => {
        restoredPaths.push(nativePath);
      },
    });

    await expect(preparer.prepareSource(source, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });

    expect(restoredPaths).toEqual([]);
    expect(registry.resolve(source.id)).toBeNull();
  });

  it('does not register a path when recursive scope restoration fails', async () => {
    const registry = new TauriNativePathRegistry();

    const source = createLibrarySource();

    const preparer = new TauriLibrarySourceAccessPreparer(registry, {
      restoreRecursiveScope: async () => {
        throw new Error('Scope restoration failed.');
      },
    });

    await expect(preparer.prepareSource(source)).rejects.toThrow('Scope restoration failed.');

    expect(registry.resolve(source.id)).toBeNull();
  });

  it('does not register the path when cancellation occurs during restoration', async () => {
    const controller = new AbortController();

    const registry = new TauriNativePathRegistry();

    const source = createLibrarySource();

    const preparer = new TauriLibrarySourceAccessPreparer(registry, {
      restoreRecursiveScope: async () => {
        controller.abort();
      },
    });

    await expect(preparer.prepareSource(source, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });

    expect(registry.resolve(source.id)).toBeNull();
  });
});
