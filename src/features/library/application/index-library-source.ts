import type { FileEntry } from '@/core/entities/file-entry';
import { parseLibrarySource, type LibrarySource } from '@/core/entities/library-source';
import type { FileEntryRepository } from '@/core/ports/file-entry-repository';
import type { DirectoryScanAdapter } from '@/core/ports/file-system-adapter';
import type { LibraryIndexRepository } from '@/core/ports/library-index-repository';
import type { LibrarySourceRepository } from '@/core/ports/library-source-repository';
import type { BuildIndexedFileEntry } from '@/features/library/application/build-indexed-file-entry';

const DEFAULT_EXISTING_ENTRY_PAGE_SIZE = 1_000;
const MAXIMUM_EXISTING_ENTRY_PAGE_SIZE = 1_000;

export type LibrarySourceIndexingRepository = Pick<LibrarySourceRepository, 'getById'>;

export type ExistingFileEntryRepository = Pick<FileEntryRepository, 'find'>;

export type LibraryIndexCommitRepository = Pick<LibraryIndexRepository, 'replaceSourceIndex'>;

export type IndexedFileEntryBuilder = Pick<BuildIndexedFileEntry, 'execute'>;

/**
 * Restores adapter-specific access state before a saved source is scanned.
 *
 * Tauri implementations can register the persisted native path, while future
 * browser implementations can restore their FileSystemDirectoryHandle.
 */
export interface LibrarySourceAccessPreparer {
  readonly platform: LibrarySource['platform'];

  prepareSource(source: LibrarySource, signal?: AbortSignal): Promise<void>;
}

export interface IndexLibrarySourceDependencies {
  librarySourceRepository: LibrarySourceIndexingRepository;
  existingFileEntryRepository: ExistingFileEntryRepository;
  libraryIndexRepository: LibraryIndexCommitRepository;
  directoryScanAdapter: DirectoryScanAdapter;
  sourceAccessPreparer: LibrarySourceAccessPreparer;
  buildIndexedFileEntry: IndexedFileEntryBuilder;

  /**
   * Injectable clock keeps scan timestamps deterministic in tests.
   */
  now?: () => number;

  /**
   * Existing entries are loaded in bounded pages before rescanning.
   */
  existingEntryPageSize?: number;
}

export interface IndexLibrarySourceOptions {
  maximumDepth?: number;
  signal?: AbortSignal;
}

export interface IndexLibrarySourceResult {
  source: LibrarySource;
  entryCount: number;
  scanStartedAtMs: number;
  scanCompletedAtMs: number;
}

function throwIfCancelled(signal?: AbortSignal): void {
  if (!signal?.aborted) {
    return;
  }

  const cancellationError = new Error('Library indexing was cancelled.');

  cancellationError.name = 'AbortError';

  throw cancellationError;
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\/{2,}/g, '/');
}

function addSafeInteger(currentValue: number, increment: number, fieldName: string): number {
  const result = currentValue + increment;

  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error(
      `The calculated library ${fieldName} exceeds the supported safe-integer range.`,
    );
  }

  return result;
}

/**
 * Calculates the recursive size of every indexed directory.
 *
 * File sizes are propagated through every ancestor directory while the source
 * total remains based only on regular files, preventing double-counting.
 */
function applyRecursiveDirectorySizes(entries: readonly FileEntry[]): FileEntry[] {
  const entriesById = new Map(entries.map((entry) => [entry.id, entry] as const));

  const directorySizes = new Map<string, number>();

  for (const entry of entries) {
    if (entry.kind === 'directory') {
      directorySizes.set(entry.id, 0);
    }
  }

  for (const entry of entries) {
    const visitedParentIds = new Set<string>();

    let parentId = entry.parentId;

    while (parentId !== null) {
      if (visitedParentIds.has(parentId)) {
        throw new Error(`The indexed directory hierarchy contains a cycle at entry "${parentId}".`);
      }

      visitedParentIds.add(parentId);

      const parentEntry = entriesById.get(parentId);

      if (!parentEntry) {
        throw new Error(
          `Indexed entry "${entry.relativePath}" references a missing parent directory.`,
        );
      }

      if (parentEntry.kind !== 'directory') {
        throw new Error(
          `Indexed entry "${entry.relativePath}" references a parent that is not a directory.`,
        );
      }

      if (parentEntry.sourceId !== entry.sourceId) {
        throw new Error(
          `Indexed entry "${entry.relativePath}" references a directory from another source.`,
        );
      }

      if (entry.kind === 'file') {
        const currentDirectorySize = directorySizes.get(parentEntry.id) ?? 0;

        directorySizes.set(
          parentEntry.id,
          addSafeInteger(currentDirectorySize, entry.sizeBytes, 'directory size'),
        );
      }

      parentId = parentEntry.parentId;
    }
  }

  return entries.map((entry) =>
    entry.kind === 'directory'
      ? {
          ...entry,
          sizeBytes: directorySizes.get(entry.id) ?? 0,
        }
      : entry,
  );
}

/**
 * Scans one saved library source and atomically commits its complete index.
 *
 * Scanner and mapping failures occur before persistence, so the previous
 * successful index remains available until a new scan completes fully.
 */
export class IndexLibrarySource {
  private readonly now: () => number;
  private readonly existingEntryPageSize: number;

  constructor(private readonly dependencies: IndexLibrarySourceDependencies) {
    this.now = dependencies.now ?? Date.now;

    this.existingEntryPageSize =
      dependencies.existingEntryPageSize ?? DEFAULT_EXISTING_ENTRY_PAGE_SIZE;

    if (
      !Number.isSafeInteger(this.existingEntryPageSize) ||
      this.existingEntryPageSize < 1 ||
      this.existingEntryPageSize > MAXIMUM_EXISTING_ENTRY_PAGE_SIZE
    ) {
      throw new Error(
        `Existing file-entry page size must be an integer between 1 and ${MAXIMUM_EXISTING_ENTRY_PAGE_SIZE}.`,
      );
    }
  }

  async execute(
    sourceId: string,
    options: IndexLibrarySourceOptions = {},
  ): Promise<IndexLibrarySourceResult> {
    const normalizedSourceId = sourceId.trim();

    if (!normalizedSourceId) {
      throw new Error('A library source identifier is required for indexing.');
    }

    throwIfCancelled(options.signal);

    const source = await this.dependencies.librarySourceRepository.getById(normalizedSourceId);

    if (source === null) {
      throw new Error(`Library source "${normalizedSourceId}" was not found.`);
    }

    if (source.platform !== this.dependencies.directoryScanAdapter.platform) {
      throw new Error('The library source platform does not match the active directory scanner.');
    }

    if (source.platform !== this.dependencies.sourceAccessPreparer.platform) {
      throw new Error('The library source platform does not match the active access preparer.');
    }

    if (source.access !== 'available') {
      throw new Error(`Library source "${normalizedSourceId}" is not currently accessible.`);
    }

    const existingEntriesByPath = await this.loadExistingEntries(normalizedSourceId);

    throwIfCancelled(options.signal);

    await this.dependencies.sourceAccessPreparer.prepareSource(source, options.signal);

    throwIfCancelled(options.signal);

    const scanStartedAtMs = this.getCurrentTimestamp();

    const indexedEntries: FileEntry[] = [];
    const discoveredPaths = new Set<string>();
    const discoveredIds = new Set<string>();

    let fileCount = 0;
    let directoryCount = 0;
    let totalSizeBytes = 0;

    const discoveredEntries = this.dependencies.directoryScanAdapter.scanDirectory(source.id, {
      includeHiddenFiles: source.includeHiddenFiles,
      excludedPatterns: source.excludedPatterns,
      maximumDepth: options.maximumDepth,
      signal: options.signal,
    });

    for await (const discoveredEntry of discoveredEntries) {
      throwIfCancelled(options.signal);

      const normalizedRelativePath = normalizeRelativePath(discoveredEntry.relativePath);

      const existingEntry = existingEntriesByPath.get(normalizedRelativePath) ?? null;

      const indexedEntry = await this.dependencies.buildIndexedFileEntry.execute({
        sourceId: source.id,
        discoveredEntry,
        existingEntry,
        scanTimestampMs: scanStartedAtMs,
      });

      if (discoveredPaths.has(indexedEntry.relativePath)) {
        throw new Error(
          `The directory scanner returned duplicate relative path "${indexedEntry.relativePath}".`,
        );
      }

      if (discoveredIds.has(indexedEntry.id)) {
        throw new Error(
          `The indexed scan produced duplicate entry identifier "${indexedEntry.id}".`,
        );
      }

      discoveredPaths.add(indexedEntry.relativePath);
      discoveredIds.add(indexedEntry.id);
      indexedEntries.push(indexedEntry);

      if (indexedEntry.kind === 'directory') {
        directoryCount = addSafeInteger(directoryCount, 1, 'directory count');
      } else {
        fileCount = addSafeInteger(fileCount, 1, 'file count');

        totalSizeBytes = addSafeInteger(totalSizeBytes, indexedEntry.sizeBytes, 'total size');
      }
    }

    throwIfCancelled(options.signal);

    const entriesWithDirectorySizes = applyRecursiveDirectorySizes(indexedEntries);

    throwIfCancelled(options.signal);

    const scanCompletedAtMs = this.getCurrentTimestamp();

    if (scanCompletedAtMs < scanStartedAtMs) {
      throw new Error('The library scan completion timestamp cannot precede its start timestamp.');
    }

    const indexedSource = parseLibrarySource({
      ...source,
      lastScannedAtMs: scanCompletedAtMs,
      updatedAtMs: scanCompletedAtMs,
      statistics: {
        fileCount,
        directoryCount,
        totalSizeBytes,
      },
    });

    await this.dependencies.libraryIndexRepository.replaceSourceIndex(
      indexedSource,
      entriesWithDirectorySizes,
    );

    return {
      source: indexedSource,
      entryCount: entriesWithDirectorySizes.length,
      scanStartedAtMs,
      scanCompletedAtMs,
    };
  }

  private async loadExistingEntries(sourceId: string): Promise<Map<string, FileEntry>> {
    const entriesByRelativePath = new Map<string, FileEntry>();

    let offset = 0;
    let total: number;

    do {
      const page = await this.dependencies.existingFileEntryRepository.find({
        sourceId,
        sortBy: 'name',
        sortDirection: 'ascending',
        offset,
        limit: this.existingEntryPageSize,
      });

      total = page.total;

      for (const entry of page.items) {
        const normalizedRelativePath = normalizeRelativePath(entry.relativePath);

        if (entriesByRelativePath.has(normalizedRelativePath)) {
          throw new Error(
            `The existing index contains duplicate relative path "${normalizedRelativePath}".`,
          );
        }

        entriesByRelativePath.set(normalizedRelativePath, entry);
      }

      if (page.items.length === 0) {
        break;
      }

      offset += page.items.length;
    } while (offset < total);

    return entriesByRelativePath;
  }

  private getCurrentTimestamp(): number {
    const timestamp = this.now();

    if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
      throw new Error('The library scan clock must return a non-negative integer timestamp.');
    }

    return timestamp;
  }
}
