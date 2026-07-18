import type { FileEntryKind } from '@/core/entities/file-entry';
import type { FileEntryPage, FileEntryRepository } from '@/core/ports/file-entry-repository';

const DEFAULT_SEARCH_PAGE_SIZE = 50;
const MAXIMUM_SEARCH_PAGE_SIZE = 200;
const MAXIMUM_SEARCH_TEXT_LENGTH = 256;

/**
 * Narrow repository capability required by indexed metadata search.
 */
export type IndexedEntrySearchRepository = Pick<FileEntryRepository, 'find'>;

export interface SearchIndexedEntriesDependencies {
  fileEntryRepository: IndexedEntrySearchRepository;
}

export interface SearchIndexedEntriesInput {
  text: string;
  sourceId?: string;
  kinds?: readonly FileEntryKind[];
  offset?: number;
  limit?: number;
}

export interface SearchIndexedEntriesResult extends FileEntryPage {
  text: string;
  sourceId: string | null;
}

function normalizeSearchText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

function resolveOffset(offset: number | undefined): number {
  const resolvedOffset = offset ?? 0;

  if (!Number.isSafeInteger(resolvedOffset) || resolvedOffset < 0) {
    throw new Error('Search offset must be a non-negative integer.');
  }

  return resolvedOffset;
}

function resolveLimit(limit: number | undefined): number {
  const resolvedLimit = limit ?? DEFAULT_SEARCH_PAGE_SIZE;

  if (
    !Number.isSafeInteger(resolvedLimit) ||
    resolvedLimit < 1 ||
    resolvedLimit > MAXIMUM_SEARCH_PAGE_SIZE
  ) {
    throw new Error(`Search limit must be an integer between 1 and ${MAXIMUM_SEARCH_PAGE_SIZE}.`);
  }

  return resolvedLimit;
}

/**
 * Searches locally indexed file and directory metadata.
 *
 * This workflow searches entry names and relative paths only. File contents
 * remain untouched and are never uploaded or read by this operation.
 */
export class SearchIndexedEntries {
  constructor(private readonly dependencies: SearchIndexedEntriesDependencies) {}

  async execute(input: SearchIndexedEntriesInput): Promise<SearchIndexedEntriesResult> {
    const text = normalizeSearchText(input.text);

    if (!text) {
      throw new Error('Search text must not be empty.');
    }

    if (text.length > MAXIMUM_SEARCH_TEXT_LENGTH) {
      throw new Error(`Search text must not exceed ${MAXIMUM_SEARCH_TEXT_LENGTH} characters.`);
    }

    const sourceId = input.sourceId === undefined ? null : input.sourceId.trim();

    if (input.sourceId !== undefined && !sourceId) {
      throw new Error('Search source identifier must not be empty.');
    }

    const offset = resolveOffset(input.offset);
    const limit = resolveLimit(input.limit);

    const page = await this.dependencies.fileEntryRepository.find({
      text,
      sourceId: sourceId ?? undefined,
      kinds: input.kinds,
      sortBy: 'kind',
      sortDirection: 'ascending',
      offset,
      limit,
    });

    return {
      text,
      sourceId,
      items: page.items,
      total: page.total,
      offset: page.offset,
      limit: page.limit,
    };
  }
}
