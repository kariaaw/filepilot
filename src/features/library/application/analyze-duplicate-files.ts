import { parseFileEntry, type ContentHash, type FileEntry } from '@/core/entities/file-entry';
import type { LibrarySource } from '@/core/entities/library-source';
import type { FileEntryRepository } from '@/core/ports/file-entry-repository';
import type {
  IndexedEntryHashAdapter,
  IndexedEntryHashResult,
} from '@/core/ports/file-system-adapter';
import type { LibrarySourceRepository } from '@/core/ports/library-source-repository';
import type { LibrarySourceAccessPreparer } from '@/features/library/application/index-library-source';

const DEFAULT_PAGE_SIZE = 500;
const MAXIMUM_PAGE_SIZE = 500;

const DEFAULT_SAVE_BATCH_SIZE = 25;
const MAXIMUM_SAVE_BATCH_SIZE = 100;

export type DuplicateAnalysisFileRepository = Pick<FileEntryRepository, 'find' | 'saveMany'>;

export type DuplicateAnalysisSourceRepository = Pick<LibrarySourceRepository, 'find'>;

export interface AnalyzeDuplicateFilesDependencies {
  fileEntryRepository: DuplicateAnalysisFileRepository;
  librarySourceRepository: DuplicateAnalysisSourceRepository;
  sourceAccessPreparer: LibrarySourceAccessPreparer;
  indexedEntryHashAdapter: IndexedEntryHashAdapter;

  /**
   * Repository records are loaded through bounded pages.
   */
  pageSize?: number;

  /**
   * Newly calculated hashes are persisted in bounded batches.
   *
   * Completed batches remain reusable if a later hash fails or the user
   * cancels the analysis.
   */
  saveBatchSize?: number;
}

export type DuplicateAnalysisPhase = 'loading' | 'hashing' | 'complete';

export interface DuplicateAnalysisProgress {
  phase: DuplicateAnalysisPhase;
  candidateFileCount: number;
  processedFileCount: number;
  hashedFileCount: number;
  reusedHashCount: number;
  currentEntryId: string | null;
}

export interface AnalyzeDuplicateFilesOptions {
  signal?: AbortSignal;
  onProgress?: (progress: DuplicateAnalysisProgress) => void;
}

export interface DuplicateFileGroup {
  hash: ContentHash;
  sizeBytes: number;
  fileCount: number;
  totalBytes: number;
  reclaimableBytes: number;
  entries: readonly FileEntry[];
}

export interface AnalyzeDuplicateFilesResult {
  groups: readonly DuplicateFileGroup[];
  candidateFileCount: number;
  hashedFileCount: number;
  reusedHashCount: number;
  duplicateGroupCount: number;
  duplicateFileCount: number;
  totalDuplicateBytes: number;
  reclaimableBytes: number;
}

function createCancellationError(): Error {
  const error = new Error('Duplicate analysis was cancelled.');

  error.name = 'AbortError';

  return error;
}

function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createCancellationError();
  }
}

function resolveBoundedInteger(
  value: number | undefined,
  defaultValue: number,
  maximumValue: number,
  fieldName: string,
): number {
  const resolvedValue = value ?? defaultValue;

  if (!Number.isSafeInteger(resolvedValue) || resolvedValue < 1 || resolvedValue > maximumValue) {
    throw new Error(`${fieldName} must be an integer between 1 and ${maximumValue}.`);
  }

  return resolvedValue;
}

function addSafeInteger(currentValue: number, increment: number, fieldName: string): number {
  const result = currentValue + increment;

  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error(`The calculated ${fieldName} exceeds the supported safe-integer range.`);
  }

  return result;
}

function multiplySafeInteger(value: number, multiplier: number, fieldName: string): number {
  const result = value * multiplier;

  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error(`The calculated ${fieldName} exceeds the supported safe-integer range.`);
  }

  return result;
}

function compareEntries(left: FileEntry, right: FileEntry): number {
  const sourceComparison = left.sourceId.localeCompare(right.sourceId);

  if (sourceComparison !== 0) {
    return sourceComparison;
  }

  return left.relativePath.localeCompare(right.relativePath, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

function groupCandidateFilesBySize(entries: readonly FileEntry[]): readonly FileEntry[] {
  const filesBySize = new Map<number, FileEntry[]>();

  for (const entry of entries) {
    const existingGroup = filesBySize.get(entry.sizeBytes);

    if (existingGroup) {
      existingGroup.push(entry);
    } else {
      filesBySize.set(entry.sizeBytes, [entry]);
    }
  }

  const candidates: FileEntry[] = [];

  for (const files of filesBySize.values()) {
    if (files.length > 1) {
      candidates.push(...files);
    }
  }

  return candidates.sort((left, right) => {
    const sizeComparison = left.sizeBytes - right.sizeBytes;

    return sizeComparison !== 0 ? sizeComparison : compareEntries(left, right);
  });
}

function buildDuplicateGroups(entries: readonly FileEntry[]): DuplicateFileGroup[] {
  const entriesByHashAndSize = new Map<string, FileEntry[]>();

  for (const entry of entries) {
    if (entry.contentHash === null) {
      continue;
    }

    const groupKey = `${entry.sizeBytes}:${entry.contentHash.value}`;
    const existingGroup = entriesByHashAndSize.get(groupKey);

    if (existingGroup) {
      existingGroup.push(entry);
    } else {
      entriesByHashAndSize.set(groupKey, [entry]);
    }
  }

  const groups: DuplicateFileGroup[] = [];

  for (const entriesWithSameHash of entriesByHashAndSize.values()) {
    if (entriesWithSameHash.length < 2) {
      continue;
    }

    const sortedEntries = [...entriesWithSameHash].sort(compareEntries);
    const firstEntry = sortedEntries[0];

    if (!firstEntry?.contentHash) {
      continue;
    }

    const fileCount = sortedEntries.length;

    const totalBytes = multiplySafeInteger(firstEntry.sizeBytes, fileCount, 'duplicate group size');

    const reclaimableBytes = multiplySafeInteger(
      firstEntry.sizeBytes,
      fileCount - 1,
      'reclaimable duplicate size',
    );

    groups.push({
      hash: firstEntry.contentHash,
      sizeBytes: firstEntry.sizeBytes,
      fileCount,
      totalBytes,
      reclaimableBytes,
      entries: sortedEntries,
    });
  }

  return groups.sort((left, right) => {
    const reclaimableComparison = right.reclaimableBytes - left.reclaimableBytes;

    if (reclaimableComparison !== 0) {
      return reclaimableComparison;
    }

    const sizeComparison = right.sizeBytes - left.sizeBytes;

    if (sizeComparison !== 0) {
      return sizeComparison;
    }

    return left.hash.value.localeCompare(right.hash.value);
  });
}

/**
 * Finds exact duplicate files using locally calculated SHA-256 hashes.
 *
 * Unique file sizes are skipped because files with different byte lengths
 * cannot contain identical content. Files are streamed by the native adapter,
 * and only the resulting SHA-256 value is persisted in IndexedDB.
 */
export class AnalyzeDuplicateFiles {
  private readonly pageSize: number;
  private readonly saveBatchSize: number;

  constructor(private readonly dependencies: AnalyzeDuplicateFilesDependencies) {
    this.pageSize = resolveBoundedInteger(
      dependencies.pageSize,
      DEFAULT_PAGE_SIZE,
      MAXIMUM_PAGE_SIZE,
      'Duplicate analysis page size',
    );

    this.saveBatchSize = resolveBoundedInteger(
      dependencies.saveBatchSize,
      DEFAULT_SAVE_BATCH_SIZE,
      MAXIMUM_SAVE_BATCH_SIZE,
      'Duplicate hash save batch size',
    );
  }

  async execute(options: AnalyzeDuplicateFilesOptions = {}): Promise<AnalyzeDuplicateFilesResult> {
    throwIfCancelled(options.signal);

    options.onProgress?.({
      phase: 'loading',
      candidateFileCount: 0,
      processedFileCount: 0,
      hashedFileCount: 0,
      reusedHashCount: 0,
      currentEntryId: null,
    });

    const [availableFiles, sources] = await Promise.all([
      this.loadAvailableFiles(options.signal),
      this.loadSources(options.signal),
    ]);

    throwIfCancelled(options.signal);

    const candidateFiles = groupCandidateFilesBySize(availableFiles);
    const sourcesById = new Map(sources.map((source) => [source.id, source] as const));

    this.validateCandidateSources(candidateFiles, sourcesById);

    let hashedFileCount = 0;
    let reusedHashCount = 0;
    let processedFileCount = 0;

    const resolvedCandidates: FileEntry[] = [];
    const pendingHashUpdates: FileEntry[] = [];
    const preparedSourceIds = new Set<string>();

    options.onProgress?.({
      phase: 'hashing',
      candidateFileCount: candidateFiles.length,
      processedFileCount,
      hashedFileCount,
      reusedHashCount,
      currentEntryId: null,
    });

    for (const entry of candidateFiles) {
      throwIfCancelled(options.signal);

      if (entry.contentHash !== null) {
        reusedHashCount = addSafeInteger(reusedHashCount, 1, 'reused hash count');

        processedFileCount = addSafeInteger(
          processedFileCount,
          1,
          'processed duplicate candidate count',
        );

        resolvedCandidates.push(entry);

        options.onProgress?.({
          phase: 'hashing',
          candidateFileCount: candidateFiles.length,
          processedFileCount,
          hashedFileCount,
          reusedHashCount,
          currentEntryId: entry.id,
        });

        continue;
      }

      const source = sourcesById.get(entry.sourceId);

      if (!source) {
        throw new Error(`Library source "${entry.sourceId}" was not found for duplicate analysis.`);
      }

      if (!preparedSourceIds.has(source.id)) {
        await this.dependencies.sourceAccessPreparer.prepareSource(source, options.signal);

        throwIfCancelled(options.signal);

        preparedSourceIds.add(source.id);
      }

      const hashResult = await this.dependencies.indexedEntryHashAdapter.hashEntry(
        source.id,
        entry.relativePath,
        options.signal,
      );

      throwIfCancelled(options.signal);

      this.validateHashResult(entry, hashResult);

      const updatedEntry = parseFileEntry({
        ...entry,
        contentHash: {
          algorithm: 'sha256',
          value: hashResult.value,
        },
      });

      resolvedCandidates.push(updatedEntry);
      pendingHashUpdates.push(updatedEntry);

      hashedFileCount = addSafeInteger(hashedFileCount, 1, 'calculated hash count');

      processedFileCount = addSafeInteger(
        processedFileCount,
        1,
        'processed duplicate candidate count',
      );

      if (pendingHashUpdates.length >= this.saveBatchSize) {
        await this.dependencies.fileEntryRepository.saveMany([...pendingHashUpdates]);

        pendingHashUpdates.length = 0;

        throwIfCancelled(options.signal);
      }

      options.onProgress?.({
        phase: 'hashing',
        candidateFileCount: candidateFiles.length,
        processedFileCount,
        hashedFileCount,
        reusedHashCount,
        currentEntryId: entry.id,
      });
    }

    if (pendingHashUpdates.length > 0) {
      await this.dependencies.fileEntryRepository.saveMany([...pendingHashUpdates]);

      throwIfCancelled(options.signal);
    }

    const groups = buildDuplicateGroups(resolvedCandidates);

    let duplicateFileCount = 0;
    let totalDuplicateBytes = 0;
    let reclaimableBytes = 0;

    for (const group of groups) {
      duplicateFileCount = addSafeInteger(
        duplicateFileCount,
        group.fileCount,
        'duplicate file count',
      );

      totalDuplicateBytes = addSafeInteger(
        totalDuplicateBytes,
        group.totalBytes,
        'total duplicate size',
      );

      reclaimableBytes = addSafeInteger(
        reclaimableBytes,
        group.reclaimableBytes,
        'total reclaimable duplicate size',
      );
    }

    const result: AnalyzeDuplicateFilesResult = {
      groups,
      candidateFileCount: candidateFiles.length,
      hashedFileCount,
      reusedHashCount,
      duplicateGroupCount: groups.length,
      duplicateFileCount,
      totalDuplicateBytes,
      reclaimableBytes,
    };

    options.onProgress?.({
      phase: 'complete',
      candidateFileCount: candidateFiles.length,
      processedFileCount,
      hashedFileCount,
      reusedHashCount,
      currentEntryId: null,
    });

    return result;
  }

  private async loadAvailableFiles(signal?: AbortSignal): Promise<FileEntry[]> {
    const entries: FileEntry[] = [];

    let offset = 0;
    let total: number;

    do {
      throwIfCancelled(signal);

      const page = await this.dependencies.fileEntryRepository.find({
        kinds: ['file'],
        availability: ['available'],
        sortBy: 'sizeBytes',
        sortDirection: 'ascending',
        offset,
        limit: this.pageSize,
      });

      entries.push(...page.items);
      total = page.total;

      if (page.items.length === 0) {
        break;
      }

      offset += page.items.length;
    } while (offset < total);

    return entries;
  }

  private async loadSources(signal?: AbortSignal): Promise<LibrarySource[]> {
    const sources: LibrarySource[] = [];

    let offset = 0;
    let total: number;

    do {
      throwIfCancelled(signal);

      const page = await this.dependencies.librarySourceRepository.find({
        sortBy: 'name',
        sortDirection: 'ascending',
        offset,
        limit: this.pageSize,
      });

      sources.push(...page.items);
      total = page.total;

      if (page.items.length === 0) {
        break;
      }

      offset += page.items.length;
    } while (offset < total);

    return sources;
  }

  private validateCandidateSources(
    entries: readonly FileEntry[],
    sourcesById: ReadonlyMap<string, LibrarySource>,
  ): void {
    for (const entry of entries) {
      const source = sourcesById.get(entry.sourceId);

      if (!source) {
        throw new Error(`Library source "${entry.sourceId}" was not found for duplicate analysis.`);
      }

      if (source.platform !== this.dependencies.indexedEntryHashAdapter.platform) {
        throw new Error('A duplicate-analysis source does not match the active hashing adapter.');
      }

      if (source.platform !== this.dependencies.sourceAccessPreparer.platform) {
        throw new Error('A duplicate-analysis source does not match the active access preparer.');
      }

      if (source.access !== 'available') {
        throw new Error(
          `Library source "${source.id}" is not currently accessible for duplicate analysis.`,
        );
      }
    }
  }

  private validateHashResult(entry: FileEntry, result: IndexedEntryHashResult): void {
    if (result.sizeBytes !== entry.sizeBytes) {
      throw new Error(
        `Indexed file "${entry.relativePath}" changed size before duplicate analysis completed. Reindex the source and try again.`,
      );
    }
  }
}
