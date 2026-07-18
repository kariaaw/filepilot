import { describe, expect, it, vi } from 'vitest';

import {
  MAXIMUM_NATIVE_PREVIEW_BYTES,
  TauriIndexedEntryContentAdapter,
} from '@/infrastructure/file-system/tauri/tauri-indexed-entry-content-adapter';
import { TauriNativePathRegistry } from '@/infrastructure/file-system/tauri/tauri-native-path-registry';

function createFixture() {
  const registry = new TauriNativePathRegistry();

  const joinPath = vi.fn(async (...segments: string[]) => segments.join('/'));

  const readNativeBytes = vi.fn(async () => ({
    bytes: [70, 105, 108, 101, 80, 105, 108, 111, 116],
    truncated: false,
  }));

  const adapter = new TauriIndexedEntryContentAdapter(registry, {
    joinPath,
    readNativeBytes,
  });

  return {
    registry,
    joinPath,
    readNativeBytes,
    adapter,
  };
}

describe('TauriIndexedEntryContentAdapter', () => {
  it('reads a bounded byte prefix from an indexed file', async () => {
    const fixture = createFixture();

    fixture.registry.register('source-documents', '/home/karya/Documents');

    const result = await fixture.adapter.readEntry(
      'source-documents',
      'Notes/important.txt',
      4_096,
    );

    expect(fixture.joinPath).toHaveBeenCalledWith(
      '/home/karya/Documents',
      'Notes',
      'important.txt',
    );

    expect(fixture.readNativeBytes).toHaveBeenCalledWith(
      '/home/karya/Documents/Notes/important.txt',
      4_096,
    );

    expect(new TextDecoder().decode(result.bytes)).toBe('FilePilot');
    expect(result.truncated).toBe(false);
  });

  it('preserves the native truncated indicator', async () => {
    const fixture = createFixture();

    fixture.registry.register('source-documents', '/home/karya/Documents');

    fixture.readNativeBytes.mockResolvedValueOnce({
      bytes: [112, 97, 114, 116, 105, 97, 108],
      truncated: true,
    });

    const result = await fixture.adapter.readEntry(
      'source-documents',
      'large.log',
      MAXIMUM_NATIVE_PREVIEW_BYTES,
    );

    expect(new TextDecoder().decode(result.bytes)).toBe('partial');
    expect(result.truncated).toBe(true);
  });

  it('normalizes portable backslash separators before joining paths', async () => {
    const fixture = createFixture();

    fixture.registry.register('source-documents', '/home/karya/Documents');

    await fixture.adapter.readEntry(
      'source-documents',
      String.raw`Notes\archive\report.txt`,
      1_024,
    );

    expect(fixture.joinPath).toHaveBeenCalledWith(
      '/home/karya/Documents',
      'Notes',
      'archive',
      'report.txt',
    );
  });

  it('rejects an unregistered source before invoking native APIs', async () => {
    const fixture = createFixture();

    await expect(fixture.adapter.readEntry('missing-source', 'report.txt', 1_024)).rejects.toThrow(
      'No native path is registered for library source "missing-source".',
    );

    expect(fixture.joinPath).not.toHaveBeenCalled();
    expect(fixture.readNativeBytes).not.toHaveBeenCalled();
  });

  it('rejects unsafe relative paths before invoking native APIs', async () => {
    const fixture = createFixture();

    fixture.registry.register('source-documents', '/home/karya/Documents');

    await expect(
      fixture.adapter.readEntry('source-documents', '../private.txt', 1_024),
    ).rejects.toThrow('An indexed preview path contains an unsafe path segment.');

    await expect(
      fixture.adapter.readEntry('source-documents', '/etc/passwd', 1_024),
    ).rejects.toThrow('An indexed preview path must remain relative to its library source.');

    expect(fixture.joinPath).not.toHaveBeenCalled();
    expect(fixture.readNativeBytes).not.toHaveBeenCalled();
  });

  it('rejects empty values and invalid byte limits', async () => {
    const fixture = createFixture();

    await expect(fixture.adapter.readEntry('   ', 'report.txt', 1_024)).rejects.toThrow(
      'A native source access key is required to preview an indexed entry.',
    );

    fixture.registry.register('source-documents', '/home/karya/Documents');

    await expect(fixture.adapter.readEntry('source-documents', '   ', 1_024)).rejects.toThrow(
      'An indexed relative path is required for a file preview.',
    );

    for (const maximumBytes of [0, -1, 1.5, MAXIMUM_NATIVE_PREVIEW_BYTES + 1]) {
      await expect(
        fixture.adapter.readEntry('source-documents', 'report.txt', maximumBytes),
      ).rejects.toThrow(
        `Preview size must be an integer between 1 and ${MAXIMUM_NATIVE_PREVIEW_BYTES} bytes.`,
      );
    }

    expect(fixture.readNativeBytes).not.toHaveBeenCalled();
  });
});
