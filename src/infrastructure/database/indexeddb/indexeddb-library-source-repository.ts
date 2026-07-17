import type { LibrarySource } from '@/core/entities/library-source';
import type {
  LibrarySourcePage,
  LibrarySourceQuery,
  LibrarySourceRepository,
  LibrarySourceSortDirection,
  LibrarySourceSortField,
} from '@/core/ports/library-source-repository';
import {
  filePilotDatabase,
  type FilePilotDatabase,
} from '@/infrastructure/database/indexeddb/database';
import {
  fromLibrarySourceRecord,
  normalizeIndexedText,
  toLibrarySourceRecord,
  type LibrarySourceRecord,
} from '@/infrastructure/database/indexeddb/records';

/**
 * Default and maximum page sizes protect the application from loading
 * unnecessarily large result sets into memory.
 */
const DEFAULT_PAGE_LIMIT = 50;
const MAXIMUM_PAGE_LIMIT = 500;

/**
 * Provides natural and case-insensitive ordering for source names.
 *
 * Numeric comparison ensures names such as "Drive 2" appear before
 * "Drive 10", which is generally more intuitive for users.
 */
const sourceNameCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

/**
 * Normalizes pagination values supplied by application services.
 */
function resolvePagination(query: LibrarySourceQuery): {
  offset: number;
  limit: number;
} {
  const offset = Math.max(0, Math.floor(query.offset ?? 0));
  const requestedLimit = Math.max(1, Math.floor(query.limit ?? DEFAULT_PAGE_LIMIT));
  const limit = Math.min(requestedLimit, MAXIMUM_PAGE_LIMIT);

  return {
    offset,
    limit,
  };
}

/**
 * Returns true when no accepted values were provided or the current value
 * exists in the supplied filter.
 */
function matchesAllowedValue<T>(value: T, allowedValues?: readonly T[]): boolean {
  return !allowedValues?.length || allowedValues.includes(value);
}

/**
 * Checks an optional lower and upper timestamp boundary.
 */
function matchesTimestampRange(value: number | null, minimum?: number, maximum?: number): boolean {
  if (minimum === undefined && maximum === undefined) {
    return true;
  }

  if (value === null) {
    return false;
  }

  if (minimum !== undefined && value < minimum) {
    return false;
  }

  if (maximum !== undefined && value > maximum) {
    return false;
  }

  return true;
}

/**
 * Applies all portable LibrarySource filters to one persistence record.
 *
 * Library-source collections are normally very small, so composing filters
 * in memory keeps behavior consistent across IndexedDB and future SQLite
 * adapters without creating unnecessary query complexity.
 */
function matchesQuery(record: LibrarySourceRecord, query: LibrarySourceQuery): boolean {
  if (!matchesAllowedValue(record.platform, query.platforms)) {
    return false;
  }

  if (!matchesAllowedValue(record.access, query.accessStates)) {
    return false;
  }

  if (!matchesAllowedValue(record.syncMode, query.syncModes)) {
    return false;
  }

  if (
    query.includeHiddenFiles !== undefined &&
    record.includeHiddenFiles !== query.includeHiddenFiles
  ) {
    return false;
  }

  const normalizedSearchText = query.text ? normalizeIndexedText(query.text) : '';

  if (
    normalizedSearchText &&
    !record.normalizedName.includes(normalizedSearchText) &&
    !record.normalizedDisplayPath.includes(normalizedSearchText)
  ) {
    return false;
  }

  if (!matchesTimestampRange(record.addedAtMs, query.addedAfterMs, query.addedBeforeMs)) {
    return false;
  }

  if (!matchesTimestampRange(record.updatedAtMs, query.updatedAfterMs, query.updatedBeforeMs)) {
    return false;
  }

  if (!matchesTimestampRange(record.lastScannedAtMs, query.scannedAfterMs, query.scannedBeforeMs)) {
    return false;
  }

  return true;
}

/**
 * Compares nullable timestamps while consistently placing missing values last.
 */
function compareNullableNumbers(left: number | null, right: number | null): number {
  if (left === null && right === null) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return left - right;
}

/**
 * Compares two records using a supported domain sort field.
 */
function compareRecords(
  left: LibrarySourceRecord,
  right: LibrarySourceRecord,
  sortField: LibrarySourceSortField,
): number {
  switch (sortField) {
    case 'name':
      return sourceNameCollator.compare(left.name, right.name);

    case 'addedAtMs':
      return left.addedAtMs - right.addedAtMs;

    case 'updatedAtMs':
      return left.updatedAtMs - right.updatedAtMs;

    case 'lastScannedAtMs':
      return compareNullableNumbers(left.lastScannedAtMs, right.lastScannedAtMs);
  }
}

/**
 * Sorts records without mutating the array returned by Dexie.
 */
function sortRecords(
  records: readonly LibrarySourceRecord[],
  sortField: LibrarySourceSortField,
  sortDirection: LibrarySourceSortDirection,
): LibrarySourceRecord[] {
  const directionMultiplier = sortDirection === 'descending' ? -1 : 1;

  return [...records].sort(
    (left, right) => compareRecords(left, right, sortField) * directionMultiplier,
  );
}

/**
 * IndexedDB implementation of the LibrarySource persistence contract.
 *
 * The database instance is injectable so automated tests can use an isolated
 * temporary database instead of the shared production database.
 */
export class IndexedDbLibrarySourceRepository implements LibrarySourceRepository {
  public constructor(private readonly database: FilePilotDatabase = filePilotDatabase) {}

  public async getById(id: string): Promise<LibrarySource | null> {
    const record = await this.database.librarySources.get(id);

    return record ? fromLibrarySourceRecord(record) : null;
  }

  public async find(query: LibrarySourceQuery = {}): Promise<LibrarySourcePage> {
    const { offset, limit } = resolvePagination(query);
    const records = await this.database.librarySources.toArray();

    const filteredRecords = records.filter((record) => matchesQuery(record, query));

    const sortedRecords = sortRecords(
      filteredRecords,
      query.sortBy ?? 'name',
      query.sortDirection ?? 'ascending',
    );

    return {
      items: sortedRecords
        .slice(offset, offset + limit)
        .map((record) => fromLibrarySourceRecord(record)),
      total: sortedRecords.length,
      offset,
      limit,
    };
  }

  public async save(source: LibrarySource): Promise<void> {
    await this.database.librarySources.put(toLibrarySourceRecord(source));
  }

  public async saveMany(sources: readonly LibrarySource[]): Promise<void> {
    if (sources.length === 0) {
      return;
    }

    const records = sources.map((source) => toLibrarySourceRecord(source));

    await this.database.transaction('rw', this.database.librarySources, async () => {
      await this.database.librarySources.bulkPut(records);
    });
  }

  public async deleteById(id: string): Promise<void> {
    await this.database.librarySources.delete(id);
  }

  public async count(query: Omit<LibrarySourceQuery, 'offset' | 'limit'> = {}): Promise<number> {
    const records = await this.database.librarySources.toArray();

    return records.filter((record) => matchesQuery(record, query)).length;
  }
}
