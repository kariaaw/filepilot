import type { FileEntry } from '@/core/entities/file-entry';
import type { LibrarySource, LibrarySourcePlatform } from '@/core/entities/library-source';
import type { IndexedEntryOpenAdapter } from '@/core/ports/file-system-adapter';
import type { FileEntryRepository } from '@/core/ports/file-entry-repository';
import type { LibrarySourceRepository } from '@/core/ports/library-source-repository';
import type { LibrarySourceAccessPreparer } from '@/features/library/application/index-library-source';

/**
 * Native actions supported for an indexed entry.
 */
export type IndexedEntryOpenOperation = 'open' | 'reveal';

/**
 * Minimal indexed-entry lookup capability required by this workflow.
 */
export type IndexedEntryOpeningRepository = Pick<FileEntryRepository, 'getById'>;

/**
 * Minimal source lookup capability required by this workflow.
 */
export type IndexedEntrySourceRepository = Pick<LibrarySourceRepository, 'getById'>;

/**
 * Narrow access-preparation capability required before native operations.
 */
export type IndexedEntryAccessPreparer = Pick<
  LibrarySourceAccessPreparer,
  'platform' | 'prepareSource'
>;

export interface OpenIndexedEntryDependencies {
  fileEntryRepository: IndexedEntryOpeningRepository;
  librarySourceRepository: IndexedEntrySourceRepository;
  sourceAccessPreparer: IndexedEntryAccessPreparer;
  indexedEntryOpenAdapter: IndexedEntryOpenAdapter;
}

export interface OpenIndexedEntryInput {
  entryId: string;
  operation?: IndexedEntryOpenOperation;
  signal?: AbortSignal;
}

export interface OpenIndexedEntryResult {
  operation: IndexedEntryOpenOperation;
  entry: FileEntry;
  source: LibrarySource;
}

function normalizeEntryId(entryId: string): string {
  const normalizedEntryId = entryId.trim();

  if (!normalizedEntryId) {
    throw new Error('An indexed entry identifier is required.');
  }

  return normalizedEntryId;
}

function resolveOperation(
  operation: IndexedEntryOpenOperation | undefined,
): IndexedEntryOpenOperation {
  const resolvedOperation = operation ?? 'open';

  if (resolvedOperation !== 'open' && resolvedOperation !== 'reveal') {
    throw new Error('Indexed entry operation must be either "open" or "reveal".');
  }

  return resolvedOperation;
}

function createCancellationError(): Error {
  const error = new Error('Indexed entry operation was cancelled.');

  error.name = 'AbortError';

  return error;
}

function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createCancellationError();
  }
}

function supportsSourcePlatform(
  sourcePlatform: LibrarySourcePlatform,
  accessPreparer: IndexedEntryAccessPreparer,
  openAdapter: IndexedEntryOpenAdapter,
): boolean {
  return accessPreparer.platform === sourcePlatform && openAdapter.platform === sourcePlatform;
}

/**
 * Opens or reveals one indexed local entry through platform adapters.
 *
 * The application layer resolves and validates persisted metadata while
 * infrastructure adapters retain responsibility for native paths, Tauri
 * scopes, and operating-system integration.
 */
export class OpenIndexedEntry {
  constructor(private readonly dependencies: OpenIndexedEntryDependencies) {}

  async execute(input: OpenIndexedEntryInput): Promise<OpenIndexedEntryResult> {
    const entryId = normalizeEntryId(input.entryId);
    const operation = resolveOperation(input.operation);

    throwIfCancelled(input.signal);

    const entry = await this.dependencies.fileEntryRepository.getById(entryId);

    throwIfCancelled(input.signal);

    if (entry === null) {
      throw new Error('The selected indexed entry no longer exists.');
    }

    if (entry.availability !== 'available') {
      throw new Error('The selected indexed entry is not currently available.');
    }

    const source = await this.dependencies.librarySourceRepository.getById(entry.sourceId);

    throwIfCancelled(input.signal);

    if (source === null) {
      throw new Error('The library source containing the selected entry no longer exists.');
    }

    if (
      !supportsSourcePlatform(
        source.platform,
        this.dependencies.sourceAccessPreparer,
        this.dependencies.indexedEntryOpenAdapter,
      )
    ) {
      throw new Error(
        'The selected indexed entry is not supported by the active file-system adapter.',
      );
    }

    await this.dependencies.sourceAccessPreparer.prepareSource(source, input.signal);

    throwIfCancelled(input.signal);

    if (operation === 'open') {
      await this.dependencies.indexedEntryOpenAdapter.openEntry(source.id, entry.relativePath);
    } else {
      await this.dependencies.indexedEntryOpenAdapter.revealEntry(source.id, entry.relativePath);
    }

    return {
      operation,
      entry,
      source,
    };
  }
}
