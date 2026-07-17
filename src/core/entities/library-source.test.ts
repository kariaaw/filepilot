import { describe, expect, it } from 'vitest';

import { LibrarySourceSchema } from '@/core/entities/library-source';
import { createLibrarySource } from '@/test/factories';

describe('LibrarySource', () => {
  it('accepts a valid library source', () => {
    const source = createLibrarySource();

    expect(source.name).toBe('Documents');
    expect(source.platform).toBe('browser');
    expect(source.statistics.fileCount).toBe(10);
  });

  it('accepts a source that has not been scanned yet', () => {
    const source = createLibrarySource({
      lastScannedAtMs: null,
    });

    expect(source.lastScannedAtMs).toBeNull();
  });

  it('supports a native Tauri library source', () => {
    const source = createLibrarySource({
      platform: 'tauri',
      displayPath: '/home/karya/Documents',
      syncMode: 'watch',
    });

    expect(source.platform).toBe('tauri');
    expect(source.syncMode).toBe('watch');
  });

  it('rejects an empty source name', () => {
    const result = LibrarySourceSchema.safeParse({
      ...createLibrarySource(),
      name: '   ',
    });

    expect(result.success).toBe(false);
  });

  it('rejects negative cached statistics', () => {
    const result = LibrarySourceSchema.safeParse({
      ...createLibrarySource(),
      statistics: {
        fileCount: -1,
        directoryCount: 0,
        totalSizeBytes: 0,
      },
    });

    expect(result.success).toBe(false);
  });

  it('rejects unknown access states', () => {
    const result = LibrarySourceSchema.safeParse({
      ...createLibrarySource(),
      access: 'unknown',
    });

    expect(result.success).toBe(false);
  });
});
