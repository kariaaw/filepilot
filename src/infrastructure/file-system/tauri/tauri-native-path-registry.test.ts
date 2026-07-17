import { describe, expect, it } from 'vitest';

import { TauriNativePathRegistry } from '@/infrastructure/file-system/tauri/tauri-native-path-registry';

describe('TauriNativePathRegistry', () => {
  it('registers and resolves a native directory path', () => {
    const registry = new TauriNativePathRegistry();

    registry.register('tauri-directory:documents', '/home/karya/Documents');

    expect(registry.resolve('tauri-directory:documents')).toBe('/home/karya/Documents');
  });

  it('replaces the path associated with an existing access key', () => {
    const registry = new TauriNativePathRegistry();

    registry.register('tauri-directory:documents', '/old/Documents');

    registry.register('tauri-directory:documents', '/home/karya/Documents');

    expect(registry.resolve('tauri-directory:documents')).toBe('/home/karya/Documents');
  });

  it('forgets one registered directory without affecting others', () => {
    const registry = new TauriNativePathRegistry();

    registry.register('tauri-directory:documents', '/home/karya/Documents');
    registry.register('tauri-directory:pictures', '/home/karya/Pictures');

    registry.forget('tauri-directory:documents');

    expect(registry.resolve('tauri-directory:documents')).toBeNull();
    expect(registry.resolve('tauri-directory:pictures')).toBe('/home/karya/Pictures');
  });

  it('clears every registered directory', () => {
    const registry = new TauriNativePathRegistry();

    registry.register('tauri-directory:documents', '/home/karya/Documents');
    registry.register('tauri-directory:pictures', '/home/karya/Pictures');

    registry.clear();

    expect(registry.resolve('tauri-directory:documents')).toBeNull();
    expect(registry.resolve('tauri-directory:pictures')).toBeNull();
  });

  it('rejects empty access keys and native paths', () => {
    const registry = new TauriNativePathRegistry();

    expect(() => registry.register('   ', '/home/karya/Documents')).toThrow(
      'A native directory access key must not be empty.',
    );

    expect(() => registry.register('tauri-directory:documents', '   ')).toThrow(
      'A native directory path must not be empty.',
    );
  });
});
