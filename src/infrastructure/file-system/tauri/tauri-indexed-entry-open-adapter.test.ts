import { describe, expect, it, vi } from 'vitest';

import { TauriIndexedEntryOpenAdapter } from '@/infrastructure/file-system/tauri/tauri-indexed-entry-open-adapter';
import { TauriNativePathRegistry } from '@/infrastructure/file-system/tauri/tauri-native-path-registry';

function createFixture(): {
  registry: TauriNativePathRegistry;
  joinPath: ReturnType<typeof vi.fn>;
  openNativePath: ReturnType<typeof vi.fn>;
  revealNativeItem: ReturnType<typeof vi.fn>;
  adapter: TauriIndexedEntryOpenAdapter;
} {
  const registry = new TauriNativePathRegistry();

  const joinPath = vi.fn(async (...segments: string[]) => segments.join('/'));

  const openNativePath = vi.fn(async () => undefined);
  const revealNativeItem = vi.fn(async () => undefined);

  const adapter = new TauriIndexedEntryOpenAdapter(registry, {
    joinPath,
    openNativePath,
    revealNativeItem,
  });

  return {
    registry,
    joinPath,
    openNativePath,
    revealNativeItem,
    adapter,
  };
}

describe('TauriIndexedEntryOpenAdapter', () => {
  it('opens an indexed entry with the operating-system default application', async () => {
    const fixture = createFixture();

    fixture.registry.register('source-documents', '/home/karya/Documents');

    await fixture.adapter.openEntry('source-documents', 'Projects/FilePilot/README.md');

    expect(fixture.joinPath).toHaveBeenCalledWith(
      '/home/karya/Documents',
      'Projects',
      'FilePilot',
      'README.md',
    );

    expect(fixture.openNativePath).toHaveBeenCalledWith(
      '/home/karya/Documents/Projects/FilePilot/README.md',
    );

    expect(fixture.revealNativeItem).not.toHaveBeenCalled();
  });

  it('reveals an indexed entry in the operating-system file manager', async () => {
    const fixture = createFixture();

    fixture.registry.register('source-pictures', '/home/karya/Pictures');

    await fixture.adapter.revealEntry('source-pictures', 'Exports/photo.jpg');

    expect(fixture.revealNativeItem).toHaveBeenCalledWith('/home/karya/Pictures/Exports/photo.jpg');

    expect(fixture.openNativePath).not.toHaveBeenCalled();
  });

  it('normalizes portable backslash separators before joining paths', async () => {
    const fixture = createFixture();

    fixture.registry.register('source-documents', '/home/karya/Documents');

    await fixture.adapter.openEntry('source-documents', String.raw`Projects\FilePilot\README.md`);

    expect(fixture.joinPath).toHaveBeenCalledWith(
      '/home/karya/Documents',
      'Projects',
      'FilePilot',
      'README.md',
    );
  });

  it('rejects an unregistered source before invoking native APIs', async () => {
    const fixture = createFixture();

    await expect(fixture.adapter.openEntry('missing-source', 'report.pdf')).rejects.toThrow(
      'No native path is registered for library source "missing-source".',
    );

    expect(fixture.joinPath).not.toHaveBeenCalled();
    expect(fixture.openNativePath).not.toHaveBeenCalled();
  });

  it('rejects unsafe relative paths before invoking native APIs', async () => {
    const fixture = createFixture();

    fixture.registry.register('source-documents', '/home/karya/Documents');

    await expect(fixture.adapter.openEntry('source-documents', '../private.txt')).rejects.toThrow(
      'An indexed entry path contains an unsafe path segment.',
    );

    await expect(fixture.adapter.revealEntry('source-documents', '/etc/passwd')).rejects.toThrow(
      'An indexed entry path must remain relative to its library source.',
    );

    expect(fixture.joinPath).not.toHaveBeenCalled();
    expect(fixture.openNativePath).not.toHaveBeenCalled();
    expect(fixture.revealNativeItem).not.toHaveBeenCalled();
  });

  it('rejects empty access keys and relative paths', async () => {
    const fixture = createFixture();

    await expect(fixture.adapter.openEntry('   ', 'report.pdf')).rejects.toThrow(
      'A native source access key is required to open an indexed entry.',
    );

    fixture.registry.register('source-documents', '/home/karya/Documents');

    await expect(fixture.adapter.openEntry('source-documents', '   ')).rejects.toThrow(
      'An indexed relative path is required for a native entry operation.',
    );
  });
});
