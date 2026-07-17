import type {
  FileAvailability,
  FileCategory,
  FileEntry,
  FileEntryKind,
  FileSecurityLevel,
} from '@/core/entities/file-entry';

/**
 * Supported fields for ordering file-system entries.
 *
 * Keeping this list explicit prevents infrastructure adapters from
 * accepting arbitrary or unsafe database column names.
 */
export type FileEntrySortField =
  'name' | 'sizeBytes' | 'createdAtMs' | 'modifiedAtMs' | 'indexedAtMs';

/**
 * Common ordering directions supported by every storage adapter.
 */
export type SortDirection = 'ascending' | 'descending';

/**
 * Filters used when querying indexed file-system entries.
 *
 * Every field is optional so callers can combine only the conditions
 * required by the current screen or search request.
 */
export interface FileEntryQuery {
  sourceId?: string;
  parentId?: string | null;
  kinds?: readonly FileEntryKind[];
  categories?: readonly FileCategory[];
  extensions?: readonly string[];
  tags?: readonly string[];
  availability?: readonly FileAvailability[];
  securityLevels?: readonly FileSecurityLevel[];

  /**
   * Case-insensitive text matched against searchable entry metadata.
   *
   * Full-text content search will later be provided by a dedicated
   * search index rather than this metadata repository.
   */
  text?: string;

  minimumSizeBytes?: number;
  maximumSizeBytes?: number;

  createdAfterMs?: number;
  createdBeforeMs?: number;
  modifiedAfterMs?: number;
  modifiedBeforeMs?: number;
  indexedAfterMs?: number;
  indexedBeforeMs?: number;

  sortBy?: FileEntrySortField;
  sortDirection?: SortDirection;

  /**
   * Pagination protects the interface from loading very large libraries
   * into memory at once.
   */
  offset?: number;
  limit?: number;
}

/**
 * Paginated result returned by repository queries.
 *
 * The total count represents all matching records before pagination.
 */
export interface FileEntryPage {
  items: readonly FileEntry[];
  total: number;
  offset: number;
  limit: number;
}

/**
 * Platform-independent persistence contract for indexed entries.
 *
 * The browser implementation will use IndexedDB through Dexie, while
 * the desktop implementation can later use SQLite. Application services
 * depend only on this interface.
 */
export interface FileEntryRepository {
  /**
   * Returns a single indexed entry or null when it does not exist.
   */
  getById(id: string): Promise<FileEntry | null>;

  /**
   * Queries indexed entries using portable filters and pagination.
   */
  find(query?: FileEntryQuery): Promise<FileEntryPage>;

  /**
   * Inserts or replaces one entry.
   */
  save(entry: FileEntry): Promise<void>;

  /**
   * Efficiently inserts or replaces multiple entries during scanning.
   *
   * Implementations should use a transaction whenever the underlying
   * database supports transactions.
   */
  saveMany(entries: readonly FileEntry[]): Promise<void>;

  /**
   * Atomically replaces every indexed entry belonging to one source.
   *
   * Implementations must delete stale records and insert the supplied entries
   * inside one transaction so a failed rescan cannot leave a partial library.
   */
  replaceForSource(sourceId: string, entries: readonly FileEntry[]): Promise<void>;

  /**
   * Removes one entry by its stable FilePilot identifier.
   */
  deleteById(id: string): Promise<void>;

  /**
   * Removes all indexed entries belonging to one library source.
   */
  deleteBySourceId(sourceId: string): Promise<void>;

  /**
   * Counts entries matching the supplied filters without loading them.
   */
  count(query?: Omit<FileEntryQuery, 'offset' | 'limit'>): Promise<number>;
}
