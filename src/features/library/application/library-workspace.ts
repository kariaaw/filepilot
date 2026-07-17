import type { LibrarySource } from '@/core/entities/library-source';
import type { LibrarySourceRepository } from '@/core/ports/library-source-repository';
import type {
  ConnectLibrarySource,
  ConnectLibrarySourceResult,
} from '@/features/library/application/connect-library-source';
import type {
  IndexLibrarySource,
  IndexLibrarySourceOptions,
  IndexLibrarySourceResult,
} from '@/features/library/application/index-library-source';

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
 * Narrow indexing capability consumed by the presentation-facing facade.
 */
export type LibrarySourceIndexingWorkflow = Pick<IndexLibrarySource, 'execute'>;

export interface LibraryWorkspaceDependencies {
  librarySourceRepository: LibrarySourceListingRepository;
  connectLibrarySource: LibrarySourceConnectionWorkflow;
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
