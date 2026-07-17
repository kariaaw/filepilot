import { describe, expect, it } from 'vitest';

import {
  createTauriDirectoryAccessKey,
  TauriDirectorySelectionAdapter,
  type TauriDirectorySelectionDependencies,
} from '@/infrastructure/file-system/tauri/tauri-directory-selection-adapter';

function createDependencies(
  overrides: Partial<TauriDirectorySelectionDependencies> = {},
): TauriDirectorySelectionDependencies {
  return {
    isTauriEnvironment: () => true,
    openDirectory: () => Promise.resolve(null),
    getBasename: () => Promise.resolve('Documents'),
    createAccessKey: () => Promise.resolve('tauri-directory:test-access-key'),
    ...overrides,
  };
}

describe('TauriDirectorySelectionAdapter', () => {
  it('identifies itself as the Tauri platform adapter', () => {
    const adapter = new TauriDirectorySelectionAdapter(createDependencies());

    expect(adapter.platform).toBe('tauri');
  });

  it('returns null when the user cancels the native dialog', async () => {
    const adapter = new TauriDirectorySelectionAdapter(
      createDependencies({
        openDirectory: () => Promise.resolve(null),
      }),
    );

    await expect(adapter.selectDirectory()).resolves.toBeNull();
  });

  it('returns portable metadata and registers the native path', async () => {
    const nativePath = '/home/karya/Documents';

    const adapter = new TauriDirectorySelectionAdapter(
      createDependencies({
        openDirectory: () => Promise.resolve(nativePath),
        getBasename: () => Promise.resolve('Documents'),
        createAccessKey: () => Promise.resolve('tauri-directory:documents'),
      }),
    );

    const selectedDirectory = await adapter.selectDirectory();

    expect(selectedDirectory).toEqual({
      accessKey: 'tauri-directory:documents',
      name: 'Documents',
      displayPath: nativePath,
      platform: 'tauri',
      access: 'available',
    });

    expect(adapter.resolveNativePath('tauri-directory:documents')).toBe(nativePath);

    expect(adapter.resolveNativePath('missing-access-key')).toBeNull();
  });

  it('rejects native selection outside the Tauri environment', async () => {
    const adapter = new TauriDirectorySelectionAdapter(
      createDependencies({
        isTauriEnvironment: () => false,
      }),
    );

    await expect(adapter.selectDirectory()).rejects.toThrow(
      'Native directory selection is available only inside the Tauri application.',
    );
  });

  it('rejects an unexpected multiple-directory result', async () => {
    const adapter = new TauriDirectorySelectionAdapter(
      createDependencies({
        openDirectory: () => Promise.resolve(['/home/karya/Documents', '/tmp']),
      }),
    );

    await expect(adapter.selectDirectory()).rejects.toThrow(
      'The native directory dialog unexpectedly returned multiple paths.',
    );
  });

  it('uses a readable fallback name for a root directory', async () => {
    const adapter = new TauriDirectorySelectionAdapter(
      createDependencies({
        openDirectory: () => Promise.resolve('/'),
        getBasename: () => Promise.resolve(''),
      }),
    );

    const selectedDirectory = await adapter.selectDirectory();

    expect(selectedDirectory?.name).toBe('Root directory');
  });

  it('creates deterministic opaque access keys from native paths', async () => {
    const firstKey = await createTauriDirectoryAccessKey('/home/karya/Documents');

    const repeatedKey = await createTauriDirectoryAccessKey('/home/karya/Documents');

    const differentKey = await createTauriDirectoryAccessKey('/home/karya/Downloads');

    expect(firstKey).toBe(repeatedKey);
    expect(firstKey).not.toBe(differentKey);
    expect(firstKey).toMatch(/^tauri-directory:[a-f0-9]{64}$/);
    expect(firstKey).not.toContain('/home/karya/Documents');
  });
});
