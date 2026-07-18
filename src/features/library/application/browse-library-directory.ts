import type { FileEntry } from '@/core/entities/file-entry';
import type { FileEntryPage, FileEntryRepository } from '@/core/ports/file-entry-repository';

const DEFAULT_DIRECTORY_PAGE_LIMIT = 100;
const MAXIMUM_DIRECTORY_PAGE_LIMIT = 500;

/**
 * Narrow repository capability required for browsing one indexed directory.
 */
export type LibraryDirectoryBrowsingRepository = Pick<FileEntryRepository, 'getById' | 'find'>;

export interface BrowseLibraryDirectoryInput {
  sourceId: string;
  parentId?: string | null;
  offset?: number;
  limit?: number;
}

/**
 * Presentation-ready snapshot of one indexed directory.
 *
 * A null currentDirectory represents the root of the selected library source.
 */
export interface BrowseLibraryDirectoryResult extends FileEntryPage {
  sourceId: string;
  currentDirectory: FileEntry | null;
}

export interface BrowseLibraryDirectoryDependencies {
  fileEntryRepository: LibraryDirectoryBrowsingRepository;
}

function normalizeRequiredIdentifier(value: string, label: string): string {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new Error(`${label} is required.`);
  }

  return normalizedValue;
}

function normalizeParentId(parentId: string | null | undefined): string | null {
  if (parentId === undefined || parentId === null) {
    return null;
  }

  const normalizedParentId = parentId.trim();

  if (!normalizedParentId) {
    throw new Error('A parent directory identifier cannot be empty.');
  }

  return normalizedParentId;
}

function resolveOffset(offset: number | undefined): number {
  const resolvedOffset = offset ?? 0;

  if (!Number.isSafeInteger(resolvedOffset) || resolvedOffset < 0) {
    throw new Error('Directory browsing offset must be a non-negative integer.');
  }

  return resolvedOffset;
}

function resolveLimit(limit: number | undefined): number {
  const resolvedLimit = limit ?? DEFAULT_DIRECTORY_PAGE_LIMIT;

  if (
    !Number.isSafeInteger(resolvedLimit) ||
    resolvedLimit < 1 ||
    resolvedLimit > MAXIMUM_DIRECTORY_PAGE_LIMIT
  ) {
    throw new Error(
      `Directory browsing limit must be an integer between 1 and ${MAXIMUM_DIRECTORY_PAGE_LIMIT}.`,
    );
  }

  return resolvedLimit;
}

/**
 * Loads one level of the indexed file tree without exposing IndexedDB details
 * to React components.
 */
export class BrowseLibraryDirectory {
  constructor(private readonly dependencies: BrowseLibraryDirectoryDependencies) {}

  async execute(input: BrowseLibraryDirectoryInput): Promise<BrowseLibraryDirectoryResult> {
    const sourceId = normalizeRequiredIdentifier(input.sourceId, 'A library source identifier');

    const parentId = normalizeParentId(input.parentId);
    const offset = resolveOffset(input.offset);
    const limit = resolveLimit(input.limit);

    let currentDirectory: FileEntry | null = null;

    if (parentId !== null) {
      currentDirectory = await this.dependencies.fileEntryRepository.getById(parentId);

      if (!currentDirectory) {
        throw new Error('The selected indexed directory no longer exists.');
      }

      if (currentDirectory.sourceId !== sourceId) {
        throw new Error('The selected directory does not belong to the requested library source.');
      }

      if (currentDirectory.kind !== 'directory') {
        throw new Error('The selected indexed entry is not a directory.');
      }
    }

    const page = await this.dependencies.fileEntryRepository.find({
      sourceId,
      parentId,
      sortBy: 'kind',
      sortDirection: 'ascending',
      offset,
      limit,
    });

    return {
      sourceId,
      currentDirectory,
      ...page,
    };
  }
}
