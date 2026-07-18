import type { LibrarySource } from '@/core/entities/library-source';
import type {
  AnalyzeDuplicateFiles,
  AnalyzeDuplicateFilesOptions,
  AnalyzeDuplicateFilesResult,
} from '@/features/library/application/analyze-duplicate-files';
import type { LibrarySourceRepository } from '@/core/ports/library-source-repository';
import type {
  BrowseLibraryDirectory,
  BrowseLibraryDirectoryInput,
  BrowseLibraryDirectoryResult,
} from '@/features/library/application/browse-library-directory';
import type {
  ConnectLibrarySource,
  ConnectLibrarySourceResult,
} from '@/features/library/application/connect-library-source';
import type {
  IndexLibrarySource,
  IndexLibrarySourceOptions,
  IndexLibrarySourceResult,
} from '@/features/library/application/index-library-source';
import type {
  OpenIndexedEntry,
  OpenIndexedEntryInput,
  OpenIndexedEntryResult,
} from '@/features/library/application/open-indexed-entry';
import type {
  PreviewIndexedTextEntry,
  PreviewIndexedTextEntryInput,
  PreviewIndexedTextEntryResult,
} from '@/features/library/application/preview-indexed-text-entry';
import type {
  RemoveLibrarySource,
  RemoveLibrarySourceResult,
} from '@/features/library/application/remove-library-source';
import type {
  SearchIndexedEntries,
  SearchIndexedEntriesInput,
  SearchIndexedEntriesResult,
} from '@/features/library/application/search-indexed-entries';

const DEFAULT_PAGE_SIZE = 100;
const MAXIMUM_PAGE_SIZE = 500;

/**
 * Narrow repository capability required by the Library workspace.
 */
export type LibrarySourceListingRepository = Pick<LibrarySourceRepository, 'find'>;

/**
 * Narrow connection capability consumed by the presentation-facing facade.
 */
export type LibrarySourceConnectionWorkflow = Pick<ConnectLibrarySource, 'execute'>;

/**
 * Narrow indexed-directory browsing capability consumed by the workspace.
 */
export type LibraryDirectoryBrowsingWorkflow = Pick<BrowseLibraryDirectory, 'execute'>;

/**
 * Narrow indexed-entry search capability consumed by the workspace.
 */
export type LibraryIndexedEntrySearchWorkflow = Pick<SearchIndexedEntries, 'execute'>;

/**
 * Narrow indexed-entry native operation capability consumed by the workspace.
 */
export type LibraryIndexedEntryOpeningWorkflow = Pick<OpenIndexedEntry, 'execute'>;

/**
 * Narrow indexed text-preview capability consumed by the workspace.
 */
export type LibraryIndexedTextPreviewWorkflow = Pick<PreviewIndexedTextEntry, 'execute'>;

/**
 * Narrow duplicate-analysis capability consumed by the workspace.
 */
export type LibraryDuplicateAnalysisWorkflow = Pick<AnalyzeDuplicateFiles, 'execute'>;

/**
 * Narrow source-removal capability consumed by the workspace.
 */
export type LibrarySourceRemovalWorkflow = Pick<RemoveLibrarySource, 'execute'>;

/**
 * Narrow indexing capability consumed by the presentation-facing facade.
 */
export type LibrarySourceIndexingWorkflow = Pick<IndexLibrarySource, 'execute'>;

export interface LibraryWorkspaceDependencies {
  librarySourceRepository: LibrarySourceListingRepository;
  connectLibrarySource: LibrarySourceConnectionWorkflow;
  browseLibraryDirectory: LibraryDirectoryBrowsingWorkflow;
  searchIndexedEntries: LibraryIndexedEntrySearchWorkflow;
  openIndexedEntry: LibraryIndexedEntryOpeningWorkflow;
  previewIndexedTextEntry: LibraryIndexedTextPreviewWorkflow;
  analyzeDuplicateFiles: LibraryDuplicateAnalysisWorkflow;
  removeLibrarySource: LibrarySourceRemovalWorkflow;
  indexLibrarySource: LibrarySourceIndexingWorkflow;

  /**
   * Smaller page sizes are useful for tests while production uses a
   * conservative batch size that avoids loading unbounded records.
   */
  pageSize?: number;
}

export interface LibraryWorkspaceSnapshot {
  sources: readonly LibrarySource[];
  total: number;
}

export interface LibraryConnectionSnapshot extends LibraryWorkspaceSnapshot {
  connection: ConnectLibrarySourceResult;
}

export interface LibraryIndexingSnapshot extends LibraryWorkspaceSnapshot {
  indexing: IndexLibrarySourceResult;
}

export interface LibraryRemovalSnapshot extends LibraryWorkspaceSnapshot {
  removal: RemoveLibrarySourceResult;
}

/**
 * Presentation-facing facade for the FilePilot Library workspace.
 *
 * React components depend on this class instead of directly importing
 * IndexedDB repositories, Tauri adapters, or individual application use cases.
 */
export class LibraryWorkspace {
  private readonly pageSize: number;

  constructor(private readonly dependencies: LibraryWorkspaceDependencies) {
    this.pageSize = dependencies.pageSize ?? DEFAULT_PAGE_SIZE;

    if (
      !Number.isSafeInteger(this.pageSize) ||
      this.pageSize < 1 ||
      this.pageSize > MAXIMUM_PAGE_SIZE
    ) {
      throw new Error(
        `Library workspace page size must be an integer between 1 and ${MAXIMUM_PAGE_SIZE}.`,
      );
    }
  }

  /**
   * Loads every registered source using bounded repository pages.
   */
  async loadSources(): Promise<LibraryWorkspaceSnapshot> {
    const sources: LibrarySource[] = [];

    let offset = 0;
    let total: number;

    do {
      const page = await this.dependencies.librarySourceRepository.find({
        sortBy: 'name',
        sortDirection: 'ascending',
        offset,
        limit: this.pageSize,
      });

      sources.push(...page.items);
      total = page.total;

      /*
       * A defensive empty-page check prevents an infinite loop if a future
       * repository implementation returns an inconsistent total.
       */
      if (page.items.length === 0) {
        break;
      }

      offset += page.items.length;
    } while (sources.length < total);

    return {
      sources,
      total,
    };
  }

  /**
   * Runs native directory selection and returns the refreshed Library state.
   */
  async connectDirectory(): Promise<LibraryConnectionSnapshot> {
    const connection = await this.dependencies.connectLibrarySource.execute();

    const snapshot = await this.loadSources();

    return {
      connection,
      ...snapshot,
    };
  }

  /**
   * Loads one level of an indexed source directory.
   */
  async browseDirectory(input: BrowseLibraryDirectoryInput): Promise<BrowseLibraryDirectoryResult> {
    return this.dependencies.browseLibraryDirectory.execute(input);
  }

  /**
   * Searches indexed file and directory metadata across the Library.
   */
  async searchEntries(input: SearchIndexedEntriesInput): Promise<SearchIndexedEntriesResult> {
    return this.dependencies.searchIndexedEntries.execute(input);
  }

  /**
   * Opens or reveals one indexed entry through the active platform adapter.
   */
  async openEntry(input: OpenIndexedEntryInput): Promise<OpenIndexedEntryResult> {
    return this.dependencies.openIndexedEntry.execute(input);
  }

  /**
   * Loads a bounded local UTF-8 preview for one indexed text or code file.
   */
  async previewTextEntry(
    input: PreviewIndexedTextEntryInput,
  ): Promise<PreviewIndexedTextEntryResult> {
    return this.dependencies.previewIndexedTextEntry.execute(input);
  }

  /**
   * Calculates local SHA-256 hashes and returns exact duplicate groups.
   */
  async analyzeDuplicates(
    options: AnalyzeDuplicateFilesOptions = {},
  ): Promise<AnalyzeDuplicateFilesResult> {
    return this.dependencies.analyzeDuplicateFiles.execute(options);
  }

  /**
   * Disconnects one source and returns the refreshed Library state.
   */
  async removeSource(sourceId: string): Promise<LibraryRemovalSnapshot> {
    const removal = await this.dependencies.removeLibrarySource.execute(sourceId);

    const snapshot = await this.loadSources();

    return {
      removal,
      ...snapshot,
    };
  }

  /**
   * Indexes one connected source and returns the refreshed Library state.
   */
  async indexSource(
    sourceId: string,
    options: IndexLibrarySourceOptions = {},
  ): Promise<LibraryIndexingSnapshot> {
    const indexing = await this.dependencies.indexLibrarySource.execute(sourceId, options);

    const snapshot = await this.loadSources();

    return {
      indexing,
      ...snapshot,
    };
  }
}
