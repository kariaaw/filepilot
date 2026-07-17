import { describe, expect, it } from 'vitest';

import { FileEntrySchema, parseFileEntry } from '@/core/entities/file-entry';
import { createFileEntry } from '@/test/factories';

describe('FileEntry', () => {
  it('accepts a valid file entry', () => {
    const entry = createFileEntry();

    expect(entry.name).toBe('example.pdf');
    expect(entry.category).toBe('document');
    expect(entry.sizeBytes).toBe(1_024);
  });

  it('accepts a directory without an extension or MIME type', () => {
    const directory = createFileEntry({
      id: 'directory-1',
      name: 'Projects',
      relativePath: 'Projects',
      kind: 'directory',
      extension: null,
      mimeType: null,
      category: 'other',
      sizeBytes: 0,
    });

    expect(directory.kind).toBe('directory');
    expect(directory.extension).toBeNull();
    expect(directory.mimeType).toBeNull();
  });

  it('rejects negative file sizes', () => {
    const result = FileEntrySchema.safeParse({
      ...createFileEntry(),
      sizeBytes: -1,
    });

    expect(result.success).toBe(false);
  });

  it('rejects malformed SHA-256 hashes', () => {
    const result = FileEntrySchema.safeParse({
      ...createFileEntry(),
      contentHash: {
        algorithm: 'sha256',
        value: 'not-a-valid-sha256-hash',
      },
    });

    expect(result.success).toBe(false);
  });

  it('accepts a valid lowercase SHA-256 hash', () => {
    const hashValue = 'a'.repeat(64);

    const entry = parseFileEntry({
      ...createFileEntry(),
      contentHash: {
        algorithm: 'sha256',
        value: hashValue,
      },
    });

    expect(entry.contentHash?.value).toBe(hashValue);
  });

  it('rejects entries with an empty relative path', () => {
    const result = FileEntrySchema.safeParse({
      ...createFileEntry(),
      relativePath: '',
    });

    expect(result.success).toBe(false);
  });
});
