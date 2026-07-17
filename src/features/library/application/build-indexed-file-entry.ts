import { parseFileEntry, type FileEntry } from '@/core/entities/file-entry';
import type { DiscoveredFileSystemEntry } from '@/core/ports/file-system-adapter';

const FILE_ENTRY_ID_PREFIX = 'file-entry:';

export type FileEntryIdFactory = (sourceId: string, relativePath: string) => Promise<string>;

export interface BuildIndexedFileEntryInput {
  sourceId: string;
  discoveredEntry: DiscoveredFileSystemEntry;
  scanTimestampMs: number;
  existingEntry?: FileEntry | null;
}

export interface BuildIndexedFileEntryDependencies {
  createEntryId?: FileEntryIdFactory;
}

/**
 * Creates a stable opaque identifier from a source and portable relative path.
 *
 * The same local entry receives the same ID across rescans, while identical
 * relative paths in different library sources remain independent.
 */
export async function createStableFileEntryId(
  sourceId: string,
  relativePath: string,
): Promise<string> {
  const normalizedSourceId = sourceId.trim();
  const normalizedRelativePath = normalizeRelativePath(relativePath);

  if (!normalizedSourceId) {
    throw new Error('A source identifier is required when creating a file-entry ID.');
  }

  if (!normalizedRelativePath) {
    throw new Error('A relative path is required when creating a file-entry ID.');
  }

  if (!globalThis.crypto?.subtle) {
    throw new Error('The current environment does not provide Web Crypto SHA-256 support.');
  }

  const identity = `${normalizedSourceId}\u0000${normalizedRelativePath}`;
  const encodedIdentity = new TextEncoder().encode(identity);

  const digest = await globalThis.crypto.subtle.digest('SHA-256', encodedIdentity);

  const hexadecimalDigest = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');

  return `${FILE_ENTRY_ID_PREFIX}${hexadecimalDigest}`;
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\/{2,}/g, '/');
}

function validateRelativePath(entryName: string, relativePath: string): void {
  const segments = relativePath.split('/');

  if (
    !relativePath ||
    segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error('A discovered entry must have a safe non-empty relative path.');
  }

  const finalSegment = segments[segments.length - 1];

  if (finalSegment !== entryName) {
    throw new Error('A discovered entry name must match the final relative-path segment.');
  }
}

function resolveParentRelativePath(relativePath: string): string | null {
  const finalSeparatorIndex = relativePath.lastIndexOf('/');

  if (finalSeparatorIndex < 0) {
    return null;
  }

  return relativePath.slice(0, finalSeparatorIndex);
}

function validateScanTimestamp(timestamp: number): void {
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new Error('The library scan clock must return a non-negative integer timestamp.');
  }
}

function validateExistingEntry(
  existingEntry: FileEntry,
  sourceId: string,
  relativePath: string,
): void {
  if (existingEntry.sourceId !== sourceId) {
    throw new Error('The existing file entry belongs to a different library source.');
  }

  if (existingEntry.relativePath !== relativePath) {
    throw new Error('The existing file entry belongs to a different relative path.');
  }
}

function canPreserveContentHash(
  existingEntry: FileEntry | null | undefined,
  discoveredEntry: DiscoveredFileSystemEntry,
): boolean {
  return (
    existingEntry?.kind === 'file' &&
    discoveredEntry.kind === 'file' &&
    existingEntry.sizeBytes === discoveredEntry.sizeBytes &&
    existingEntry.modifiedAtMs === discoveredEntry.modifiedAtMs
  );
}

/**
 * Converts untrusted scanner metadata into FilePilot's canonical FileEntry.
 */
export class BuildIndexedFileEntry {
  private readonly createEntryId: FileEntryIdFactory;

  constructor(dependencies: BuildIndexedFileEntryDependencies = {}) {
    this.createEntryId = dependencies.createEntryId ?? createStableFileEntryId;
  }

  async execute(input: BuildIndexedFileEntryInput): Promise<FileEntry> {
    const sourceId = input.sourceId.trim();
    const entryName = input.discoveredEntry.name.trim();

    const relativePath = normalizeRelativePath(input.discoveredEntry.relativePath);

    if (!sourceId) {
      throw new Error('A source identifier is required when building an indexed entry.');
    }

    if (!entryName) {
      throw new Error('A discovered entry name must not be empty.');
    }

    validateScanTimestamp(input.scanTimestampMs);
    validateRelativePath(entryName, relativePath);

    if (input.existingEntry) {
      validateExistingEntry(input.existingEntry, sourceId, relativePath);
    }

    const parentRelativePath = resolveParentRelativePath(relativePath);

    const [entryId, parentId] = await Promise.all([
      this.createEntryId(sourceId, relativePath),

      parentRelativePath === null
        ? Promise.resolve(null)
        : this.createEntryId(sourceId, parentRelativePath),
    ]);

    const isDirectory = input.discoveredEntry.kind === 'directory';

    const preserveContentHash = canPreserveContentHash(input.existingEntry, input.discoveredEntry);

    return parseFileEntry({
      id: entryId,
      sourceId,
      parentId,
      name: entryName,
      extension: isDirectory
        ? null
        : (input.discoveredEntry.extension?.trim().replace(/^\./, '').toLowerCase() ?? null),
      relativePath,
      kind: input.discoveredEntry.kind,
      mimeType: isDirectory ? null : (input.discoveredEntry.mimeType?.trim() ?? null),
      category: isDirectory ? 'other' : input.discoveredEntry.category,
      sizeBytes: isDirectory ? 0 : input.discoveredEntry.sizeBytes,
      createdAtMs: input.discoveredEntry.createdAtMs,
      modifiedAtMs: input.discoveredEntry.modifiedAtMs,
      indexedAtMs: input.existingEntry?.indexedAtMs ?? input.scanTimestampMs,
      lastSeenAtMs: input.scanTimestampMs,
      availability: 'available',
      securityLevel: input.existingEntry?.securityLevel ?? 'standard',
      contentHash: preserveContentHash ? (input.existingEntry?.contentHash ?? null) : null,
      tags: input.existingEntry?.tags ?? [],
    });
  }
}
