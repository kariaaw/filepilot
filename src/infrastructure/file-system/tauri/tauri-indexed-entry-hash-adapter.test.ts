import { describe, expect, it, vi } from 'vitest';

import {
  TauriIndexedEntryHashAdapter,
  type TauriHashLibraryEntryResponse,
} from '@/infrastructure/file-system/tauri/tauri-indexed-entry-hash-adapter';
import { TauriNativePathRegistry } from '@/infrastructure/file-system/tauri/tauri-native-path-registry';

const VALID_HASH = 'a'.repeat(64);

function createFixture() {
  const registry = new TauriNativePathRegistry();

  const joinPath = vi.fn(async (...segments: string[]) => segments.join('/'));

  const hashNativeEntry = vi.fn(async (): Promise<TauriHashLibraryEntryResponse> => ({
    algorithm: 'sha256',
    value: VALID_HASH,
    sizeBytes: 4_096,
  }));

  const adapter = new TauriIndexedEntryHashAdapter(registry, {
    joinPath,
    hashNativeEntry,
  });

  return {
    registry,
    joinPath,
    hashNativeEntry,
    adapter,
  };
}

describe('TauriIndexedEntryHashAdapter', () => {
  it('hashes an indexed file through the native streaming command', async () => {
    const fixture = createFixture();

    fixture.registry.register('source-documents', '/home/karya/Documents');

    const result = await fixture.adapter.hashEntry('source-documents', 'Reports/annual.pdf');

    expect(fixture.joinPath).toHaveBeenCalledWith('/home/karya/Documents', 'Reports', 'annual.pdf');

    expect(fixture.hashNativeEntry).toHaveBeenCalledWith(
      '/home/karya/Documents/Reports/annual.pdf',
    );

    expect(result).toEqual({
      algorithm: 'sha256',
      value: VALID_HASH,
      sizeBytes: 4_096,
    });
  });

  it('normalizes portable backslash separators before joining paths', async () => {
    const fixture = createFixture();

    fixture.registry.register('source-documents', '/home/karya/Documents');

    await fixture.adapter.hashEntry('source-documents', String.raw`Archive\2026\report.pdf`);

    expect(fixture.joinPath).toHaveBeenCalledWith(
      '/home/karya/Documents',
      'Archive',
      '2026',
      'report.pdf',
    );
  });

  it('rejects an unregistered source before invoking native APIs', async () => {
    const fixture = createFixture();

    await expect(fixture.adapter.hashEntry('missing-source', 'report.pdf')).rejects.toThrow(
      'No native path is registered for library source "missing-source".',
    );

    expect(fixture.joinPath).not.toHaveBeenCalled();
    expect(fixture.hashNativeEntry).not.toHaveBeenCalled();
  });

  it('rejects unsafe relative paths before invoking native APIs', async () => {
    const fixture = createFixture();

    fixture.registry.register('source-documents', '/home/karya/Documents');

    await expect(fixture.adapter.hashEntry('source-documents', '../private.txt')).rejects.toThrow(
      'An indexed hashing path contains an unsafe path segment.',
    );

    await expect(fixture.adapter.hashEntry('source-documents', '/etc/passwd')).rejects.toThrow(
      'An indexed hashing path must remain relative to its library source.',
    );

    expect(fixture.joinPath).not.toHaveBeenCalled();
    expect(fixture.hashNativeEntry).not.toHaveBeenCalled();
  });

  it('validates every native hashing response before returning it', async () => {
    const fixture = createFixture();

    fixture.registry.register('source-documents', '/home/karya/Documents');

    fixture.hashNativeEntry.mockResolvedValueOnce({
      algorithm: 'md5',
      value: VALID_HASH,
      sizeBytes: 100,
    });

    await expect(fixture.adapter.hashEntry('source-documents', 'report.pdf')).rejects.toThrow(
      'The native hashing operation returned an unsupported algorithm.',
    );

    fixture.hashNativeEntry.mockResolvedValueOnce({
      algorithm: 'sha256',
      value: 'invalid',
      sizeBytes: 100,
    });

    await expect(fixture.adapter.hashEntry('source-documents', 'report.pdf')).rejects.toThrow(
      'The native hashing operation returned an invalid SHA-256 value.',
    );

    fixture.hashNativeEntry.mockResolvedValueOnce({
      algorithm: 'sha256',
      value: VALID_HASH,
      sizeBytes: -1,
    });

    await expect(fixture.adapter.hashEntry('source-documents', 'report.pdf')).rejects.toThrow(
      'The native hashing operation returned an invalid file size.',
    );
  });

  it('stops before native work when the request is already cancelled', async () => {
    const fixture = createFixture();
    const controller = new AbortController();

    fixture.registry.register('source-documents', '/home/karya/Documents');
    controller.abort();

    await expect(
      fixture.adapter.hashEntry('source-documents', 'report.pdf', controller.signal),
    ).rejects.toMatchObject({
      name: 'AbortError',
    });

    expect(fixture.joinPath).not.toHaveBeenCalled();
    expect(fixture.hashNativeEntry).not.toHaveBeenCalled();
  });

  it('discards a native result when cancellation occurs during hashing', async () => {
    const fixture = createFixture();
    const controller = new AbortController();

    fixture.registry.register('source-documents', '/home/karya/Documents');

    fixture.hashNativeEntry.mockImplementationOnce(async () => {
      controller.abort();

      return {
        algorithm: 'sha256',
        value: VALID_HASH,
        sizeBytes: 4_096,
      };
    });

    await expect(
      fixture.adapter.hashEntry('source-documents', 'report.pdf', controller.signal),
    ).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});
