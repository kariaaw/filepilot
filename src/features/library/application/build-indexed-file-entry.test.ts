import { describe, expect, it } from 'vitest';

import type { FileEntry } from '@/core/entities/file-entry';
import type { DiscoveredFileSystemEntry } from '@/core/ports/file-system-adapter';
import {
  BuildIndexedFileEntry,
  createStableFileEntryId,
  type FileEntryIdFactory,
} from '@/features/library/application/build-indexed-file-entry';
import { createFileEntry } from '@/test/factories';

const SCAN_TIMESTAMP_MS = 1_725_000_000_000;

const createReadableEntryId: FileEntryIdFactory = async (sourceId, relativePath) =>
  `entry:${sourceId}:${relativePath}`;

function createDiscoveredEntry(
  overrides: Partial<DiscoveredFileSystemEntry> = {},
): DiscoveredFileSystemEntry {
  return {
    name: 'report.pdf',
    relativePath: 'report.pdf',
    kind: 'file',
    extension: 'pdf',
    mimeType: 'application/pdf',
    category: 'document',
    sizeBytes: 4_096,
    createdAtMs: 1_000,
    modifiedAtMs: 2_000,
    ...overrides,
  };
}

function createBuilder(): BuildIndexedFileEntry {
  return new BuildIndexedFileEntry({
    createEntryId: createReadableEntryId,
  });
}

describe('createStableFileEntryId', () => {
  it('creates deterministic source-specific SHA-256 identifiers', async () => {
    const firstId = await createStableFileEntryId(
      'source-documents',
      'Projects/FilePilot/README.md',
    );

    const repeatedId = await createStableFileEntryId(
      'source-documents',
      'Projects/FilePilot/README.md',
    );

    const otherSourceId = await createStableFileEntryId(
      'source-backup',
      'Projects/FilePilot/README.md',
    );

    const otherPathId = await createStableFileEntryId(
      'source-documents',
      'Projects/FilePilot/LICENSE',
    );

    expect(firstId).toMatch(/^file-entry:[a-f0-9]{64}$/);

    expect(repeatedId).toBe(firstId);
    expect(otherSourceId).not.toBe(firstId);
    expect(otherPathId).not.toBe(firstId);
  });
});

describe('BuildIndexedFileEntry', () => {
  it('builds a valid root-level file entry', async () => {
    const entry = await createBuilder().execute({
      sourceId: 'source-documents',
      discoveredEntry: createDiscoveredEntry({
        extension: '.PDF',
      }),
      scanTimestampMs: SCAN_TIMESTAMP_MS,
    });

    expect(entry).toEqual({
      id: 'entry:source-documents:report.pdf',
      sourceId: 'source-documents',
      parentId: null,
      name: 'report.pdf',
      extension: 'pdf',
      relativePath: 'report.pdf',
      kind: 'file',
      mimeType: 'application/pdf',
      category: 'document',
      sizeBytes: 4_096,
      createdAtMs: 1_000,
      modifiedAtMs: 2_000,
      indexedAtMs: SCAN_TIMESTAMP_MS,
      lastSeenAtMs: SCAN_TIMESTAMP_MS,
      availability: 'available',
      securityLevel: 'standard',
      contentHash: null,
      tags: [],
    });
  });

  it('derives a nested entry parent ID from its portable path', async () => {
    const entry = await createBuilder().execute({
      sourceId: 'source-documents',
      discoveredEntry: createDiscoveredEntry({
        name: 'README.md',
        relativePath: 'Projects/FilePilot/README.md',
        extension: 'md',
        mimeType: 'text/markdown',
        category: 'text',
      }),
      scanTimestampMs: SCAN_TIMESTAMP_MS,
    });

    expect(entry.id).toBe('entry:source-documents:Projects/FilePilot/README.md');

    expect(entry.parentId).toBe('entry:source-documents:Projects/FilePilot');
  });

  it('normalizes directory-only metadata', async () => {
    const entry = await createBuilder().execute({
      sourceId: 'source-documents',
      discoveredEntry: createDiscoveredEntry({
        name: 'Projects',
        relativePath: 'Projects',
        kind: 'directory',
        extension: 'ignored',
        mimeType: 'application/octet-stream',
        category: 'archive',
        sizeBytes: 9_999,
      }),
      scanTimestampMs: SCAN_TIMESTAMP_MS,
    });

    expect(entry).toMatchObject({
      kind: 'directory',
      extension: null,
      mimeType: null,
      category: 'other',
      sizeBytes: 0,
    });
  });

  it('preserves user metadata and a valid unchanged content hash', async () => {
    const existingEntry: FileEntry = createFileEntry({
      id: 'entry:source-documents:report.pdf',
      sourceId: 'source-documents',
      relativePath: 'report.pdf',
      name: 'report.pdf',
      sizeBytes: 4_096,
      modifiedAtMs: 2_000,
      indexedAtMs: 500,
      lastSeenAtMs: 700,
      securityLevel: 'private',
      contentHash: {
        algorithm: 'sha256',
        value: 'a'.repeat(64),
      },
      tags: ['finance', 'important'],
    });

    const entry = await createBuilder().execute({
      sourceId: 'source-documents',
      discoveredEntry: createDiscoveredEntry(),
      existingEntry,
      scanTimestampMs: SCAN_TIMESTAMP_MS,
    });

    expect(entry.indexedAtMs).toBe(500);
    expect(entry.lastSeenAtMs).toBe(SCAN_TIMESTAMP_MS);
    expect(entry.securityLevel).toBe('private');
    expect(entry.tags).toEqual(['finance', 'important']);
    expect(entry.contentHash).toEqual(existingEntry.contentHash);
  });

  it('invalidates a content hash when file metadata changes', async () => {
    const existingEntry = createFileEntry({
      id: 'entry:source-documents:report.pdf',
      sourceId: 'source-documents',
      relativePath: 'report.pdf',
      name: 'report.pdf',
      sizeBytes: 1_024,
      modifiedAtMs: 1_500,
      contentHash: {
        algorithm: 'sha256',
        value: 'b'.repeat(64),
      },
    });

    const entry = await createBuilder().execute({
      sourceId: 'source-documents',
      discoveredEntry: createDiscoveredEntry(),
      existingEntry,
      scanTimestampMs: SCAN_TIMESTAMP_MS,
    });

    expect(entry.contentHash).toBeNull();
  });

  it('rejects inconsistent discovered paths', async () => {
    await expect(
      createBuilder().execute({
        sourceId: 'source-documents',
        discoveredEntry: createDiscoveredEntry({
          name: 'report.pdf',
          relativePath: 'Documents/other.pdf',
        }),
        scanTimestampMs: SCAN_TIMESTAMP_MS,
      }),
    ).rejects.toThrow('A discovered entry name must match the final relative-path segment.');
  });

  it('rejects invalid scan timestamps', async () => {
    await expect(
      createBuilder().execute({
        sourceId: 'source-documents',
        discoveredEntry: createDiscoveredEntry(),
        scanTimestampMs: Number.NaN,
      }),
    ).rejects.toThrow('The library scan clock must return a non-negative integer timestamp.');
  });
});
