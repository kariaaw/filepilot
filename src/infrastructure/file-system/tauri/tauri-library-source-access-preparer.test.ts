import { describe, expect, it } from 'vitest';

import { TauriLibrarySourceAccessPreparer } from '@/infrastructure/file-system/tauri/tauri-library-source-access-preparer';
import { TauriNativePathRegistry } from '@/infrastructure/file-system/tauri/tauri-native-path-registry';
import { createLibrarySource } from '@/test/factories';

describe('TauriLibrarySourceAccessPreparer', () => {
  it('identifies itself as a Tauri access preparer', () => {
    const preparer = new TauriLibrarySourceAccessPreparer(new TauriNativePathRegistry());

    expect(preparer.platform).toBe('tauri');
  });

  it('restores a persisted source path into the native registry', async () => {
    const registry = new TauriNativePathRegistry();

    const preparer = new TauriLibrarySourceAccessPreparer(registry);

    const source = createLibrarySource({
      id: 'tauri-directory:documents',
      platform: 'tauri',
      displayPath: '/home/karya/Documents',
    });

    await preparer.prepareSource(source);

    expect(registry.resolve(source.id)).toBe('/home/karya/Documents');
  });

  it('replaces a stale native path with the persisted source path', async () => {
    const registry = new TauriNativePathRegistry();

    registry.register('tauri-directory:documents', '/old/Documents');

    const preparer = new TauriLibrarySourceAccessPreparer(registry);

    const source = createLibrarySource({
      id: 'tauri-directory:documents',
      platform: 'tauri',
      displayPath: '/home/karya/Documents',
    });

    await preparer.prepareSource(source);

    expect(registry.resolve(source.id)).toBe('/home/karya/Documents');
  });

  it('rejects sources owned by another platform', async () => {
    const registry = new TauriNativePathRegistry();

    const preparer = new TauriLibrarySourceAccessPreparer(registry);

    const source = createLibrarySource({
      id: 'browser-directory:documents',
      platform: 'browser',
      displayPath: 'Documents',
    });

    await expect(preparer.prepareSource(source)).rejects.toThrow(
      'Only Tauri library sources can be prepared by the Tauri access preparer.',
    );

    expect(registry.resolve(source.id)).toBeNull();
  });

  it('does not restore a source when preparation is cancelled', async () => {
    const registry = new TauriNativePathRegistry();

    const preparer = new TauriLibrarySourceAccessPreparer(registry);

    const source = createLibrarySource({
      id: 'tauri-directory:documents',
      platform: 'tauri',
      displayPath: '/home/karya/Documents',
    });

    const controller = new AbortController();
    controller.abort();

    await expect(preparer.prepareSource(source, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
      message: 'Library source access preparation was cancelled.',
    });

    expect(registry.resolve(source.id)).toBeNull();
  });
});
