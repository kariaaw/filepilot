import type {
  LibrarySource,
  LibrarySourceAccess,
  LibrarySourcePlatform,
  LibrarySyncMode,
} from '@/core/entities/library-source';

/**
 * Supported fields for ordering library sources.
 *
 * The repository exposes only known domain fields so database adapters
 * never receive arbitrary column names from the application layer.
 */
export type LibrarySourceSortField = 'name' | 'addedAtMs' | 'updatedAtMs' | 'lastScannedAtMs';

/**
 * Common ordering directions supported by every persistence adapter.
 */
export type LibrarySourceSortDirection = 'ascending' | 'descending';

/**
 * Portable filters for querying FilePilot library sources.
 *
 * Every property is optional so application services can combine only
 * the filters needed by the current workflow.
 */
export interface LibrarySourceQuery {
  platforms?: readonly LibrarySourcePlatform[];
  accessStates?: readonly LibrarySourceAccess[];
  syncModes?: readonly LibrarySyncMode[];

  /**
   * Case-insensitive text matched against source names and display paths.
   */
  text?: string;

  /**
   * Filters sources based on whether hidden files are included.
   */
  includeHiddenFiles?: boolean;

  addedAfterMs?: number;
  addedBeforeMs?: number;
  updatedAfterMs?: number;
  updatedBeforeMs?: number;
  scannedAfterMs?: number;
  scannedBeforeMs?: number;

  sortBy?: LibrarySourceSortField;
  sortDirection?: LibrarySourceSortDirection;

  /**
   * Pagination prevents large source collections from being loaded
   * into memory unnecessarily.
   */
  offset?: number;
  limit?: number;
}

/**
 * Paginated result returned by library-source queries.
 */
export interface LibrarySourcePage {
  items: readonly LibrarySource[];
  total: number;
  offset: number;
  limit: number;
}

/**
 * Platform-independent persistence contract for library sources.
 *
 * Browser storage will initially use IndexedDB through Dexie. The Tauri
 * desktop application can later use SQLite while preserving the same
 * application-service interface.
 */
export interface LibrarySourceRepository {
  /**
   * Returns one source by its stable FilePilot identifier.
   */
  getById(id: string): Promise<LibrarySource | null>;

  /**
   * Returns sources matching the supplied portable filters.
   */
  find(query?: LibrarySourceQuery): Promise<LibrarySourcePage>;

  /**
   * Inserts a new source or replaces an existing source with the same ID.
   */
  save(source: LibrarySource): Promise<void>;

  /**
   * Efficiently inserts or replaces multiple sources.
   *
   * Implementations should use a transaction whenever supported by
   * the underlying database.
   */
  saveMany(sources: readonly LibrarySource[]): Promise<void>;

  /**
   * Removes one source by its stable FilePilot identifier.
   *
   * Removing associated FileEntry records is intentionally handled by
   * an application service so the operation can span multiple repositories.
   */
  deleteById(id: string): Promise<void>;

  /**
   * Counts sources matching the supplied filters without loading them.
   */
  count(query?: Omit<LibrarySourceQuery, 'offset' | 'limit'>): Promise<number>;
}
