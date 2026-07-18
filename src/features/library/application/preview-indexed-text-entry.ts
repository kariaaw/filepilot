import type { FileEntry } from '@/core/entities/file-entry';
import type { LibrarySource, LibrarySourcePlatform } from '@/core/entities/library-source';
import type { IndexedEntryContentAdapter } from '@/core/ports/file-system-adapter';
import type { FileEntryRepository } from '@/core/ports/file-entry-repository';
import type { LibrarySourceRepository } from '@/core/ports/library-source-repository';
import type { LibrarySourceAccessPreparer } from '@/features/library/application/index-library-source';

export const DEFAULT_TEXT_PREVIEW_BYTES = 128 * 1024;
export const MAXIMUM_TEXT_PREVIEW_BYTES = 256 * 1024;

/**
 * Minimal indexed-entry lookup capability required by text previews.
 */
export type IndexedTextPreviewEntryRepository = Pick<FileEntryRepository, 'getById'>;

/**
 * Minimal source lookup capability required by text previews.
 */
export type IndexedTextPreviewSourceRepository = Pick<LibrarySourceRepository, 'getById'>;

/**
 * Narrow source-access capability required before reading local bytes.
 */
export type IndexedTextPreviewAccessPreparer = Pick<
  LibrarySourceAccessPreparer,
  'platform' | 'prepareSource'
>;

export interface PreviewIndexedTextEntryDependencies {
  fileEntryRepository: IndexedTextPreviewEntryRepository;
  librarySourceRepository: IndexedTextPreviewSourceRepository;
  sourceAccessPreparer: IndexedTextPreviewAccessPreparer;
  indexedEntryContentAdapter: IndexedEntryContentAdapter;
}

export interface PreviewIndexedTextEntryInput {
  entryId: string;
  maximumBytes?: number;
  signal?: AbortSignal;
}

export interface PreviewIndexedTextEntryResult {
  entry: FileEntry;
  source: LibrarySource;
  text: string;
  bytesRead: number;
  maximumBytes: number;
  truncated: boolean;
}

function normalizeEntryId(entryId: string): string {
  const normalizedEntryId = entryId.trim();

  if (!normalizedEntryId) {
    throw new Error('An indexed entry identifier is required for preview.');
  }

  return normalizedEntryId;
}

function resolveMaximumBytes(maximumBytes: number | undefined): number {
  const resolvedMaximumBytes = maximumBytes ?? DEFAULT_TEXT_PREVIEW_BYTES;

  if (
    !Number.isSafeInteger(resolvedMaximumBytes) ||
    resolvedMaximumBytes < 1 ||
    resolvedMaximumBytes > MAXIMUM_TEXT_PREVIEW_BYTES
  ) {
    throw new Error(
      `Text preview size must be an integer between 1 and ${MAXIMUM_TEXT_PREVIEW_BYTES} bytes.`,
    );
  }

  return resolvedMaximumBytes;
}

function createCancellationError(): Error {
  const error = new Error('Indexed text preview was cancelled.');

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
  accessPreparer: IndexedTextPreviewAccessPreparer,
  contentAdapter: IndexedEntryContentAdapter,
): boolean {
  return accessPreparer.platform === sourcePlatform && contentAdapter.platform === sourcePlatform;
}

function supportsTextPreview(entry: FileEntry): boolean {
  return entry.category === 'text' || entry.category === 'code';
}

function decodeUtf8Text(buffer: ArrayBuffer, truncated: boolean): string {
  const bytes = new Uint8Array(buffer);

  if (bytes.includes(0)) {
    throw new Error(
      'The selected file appears to contain binary data and cannot be previewed as text.',
    );
  }

  try {
    const decoder = new TextDecoder('utf-8', {
      fatal: true,
    });

    /*
     * A bounded read can stop inside the final multi-byte UTF-8 character.
     * Streaming mode validates complete content while retaining an incomplete
     * trailing sequence instead of treating it as corrupted text.
     */
    return decoder.decode(bytes, {
      stream: truncated,
    });
  } catch {
    throw new Error('The selected file is not valid UTF-8 text and cannot be previewed safely.');
  }
}

/**
 * Loads a bounded UTF-8 preview for one indexed local text or code file.
 *
 * Persisted metadata is validated before source access is restored. Native
 * paths and byte reading remain inside infrastructure adapters.
 */
export class PreviewIndexedTextEntry {
  constructor(private readonly dependencies: PreviewIndexedTextEntryDependencies) {}

  async execute(input: PreviewIndexedTextEntryInput): Promise<PreviewIndexedTextEntryResult> {
    const entryId = normalizeEntryId(input.entryId);
    const maximumBytes = resolveMaximumBytes(input.maximumBytes);

    throwIfCancelled(input.signal);

    const entry = await this.dependencies.fileEntryRepository.getById(entryId);

    throwIfCancelled(input.signal);

    if (entry === null) {
      throw new Error('The selected indexed entry no longer exists.');
    }

    if (entry.kind !== 'file') {
      throw new Error('Only indexed files can be previewed.');
    }

    if (entry.availability !== 'available') {
      throw new Error('The selected indexed entry is not currently available.');
    }

    if (!supportsTextPreview(entry)) {
      throw new Error('Only indexed text and code files can be previewed.');
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
        this.dependencies.indexedEntryContentAdapter,
      )
    ) {
      throw new Error('The selected indexed entry is not supported by the active content adapter.');
    }

    await this.dependencies.sourceAccessPreparer.prepareSource(source, input.signal);

    throwIfCancelled(input.signal);

    const content = await this.dependencies.indexedEntryContentAdapter.readEntry(
      source.id,
      entry.relativePath,
      maximumBytes,
    );

    throwIfCancelled(input.signal);

    const text = decodeUtf8Text(content.bytes, content.truncated);

    return {
      entry,
      source,
      text,
      bytesRead: content.bytes.byteLength,
      maximumBytes,
      truncated: content.truncated,
    };
  }
}
