import type { FileEntry } from '@/core/entities/file-entry';
import type {
  FileEntryPage,
  FileEntryQuery,
  FileEntryRepository,
  FileEntrySortField,
  SortDirection,
} from '@/core/ports/file-entry-repository';
import {
  filePilotDatabase,
  type FilePilotDatabase,
} from '@/infrastructure/database/indexeddb/database';
import {
  fromFileEntryRecord,
  normalizeIndexedText,
  ROOT_PARENT_KEY,
  toFileEntryRecord,
  type FileEntryRecord,
} from '@/infrastructure/database/indexeddb/records';

/**
 * Reasonable pagination defaults protect the UI from loading an entire
 * large library into memory during normal browsing operations.
 */
const DEFAULT_PAGE_LIMIT = 100;
const MAXIMUM_PAGE_LIMIT = 1_000;

/**
 * Natural comparison keeps names containing numbers intuitive.
 *
 * For example, "Image 2" is ordered before "Image 10".
 */
const fileNameCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

/**
 * Converts potentially unsafe pagination input into bounded integers.
 */
function resolvePagination(query: FileEntryQuery): {
  offset: number;
  limit: number;
} {
  const offset = Math.max(0, Math.floor(query.offset ?? 0));
  const requestedLimit = Math.max(1, Math.floor(query.limit ?? DEFAULT_PAGE_LIMIT));

  return {
    offset,
    limit: Math.min(requestedLimit, MAXIMUM_PAGE_LIMIT),
  };
}

/**
 * Returns true when no filter values were supplied or the current value
 * is included in the accepted values.
 */
function matchesAllowedValue<T>(value: T, allowedValues?: readonly T[]): boolean {
  return !allowedValues?.length || allowedValues.includes(value);
}

/**
 * Applies optional minimum and maximum boundaries to numeric values.
 */
function matchesNumberRange(value: number, minimum?: number, maximum?: number): boolean {
  if (minimum !== undefined && value < minimum) {
    return false;
  }

  if (maximum !== undefined && value > maximum) {
    return false;
  }

  return true;
}

/**
 * Applies optional timestamp boundaries.
 *
 * Null timestamps cannot match an active date filter because the real
 * creation or modification time is unknown.
 */
function matchesNullableTimestampRange(
  value: number | null,
  minimum?: number,
  maximum?: number,
): boolean {
  if (minimum === undefined && maximum === undefined) {
    return true;
  }

  if (value === null) {
    return false;
  }

  return matchesNumberRange(value, minimum, maximum);
}

/**
 * Normalizes extension filters to match FileEntry persistence rules.
 *
 * Both "pdf" and ".PDF" therefore produce the same query value.
 */
function normalizeExtensions(extensions?: readonly string[]): ReadonlySet<string> | null {
  if (!extensions?.length) {
    return null;
  }

  const normalizedExtensions = extensions
    .map((extension) => extension.trim().replace(/^\./, '').toLocaleLowerCase())
    .filter(Boolean);

  return normalizedExtensions.length ? new Set(normalizedExtensions) : null;
}

/**
 * Normalizes requested tags for case-insensitive comparisons.
 */
function normalizeTags(tags?: readonly string[]): readonly string[] {
  if (!tags?.length) {
    return [];
  }

  return tags.map((tag) => normalizeIndexedText(tag)).filter(Boolean);
}

/**
 * Checks whether an entry contains every requested tag.
 *
 * Requiring all tags makes combined filters predictable. A future advanced
 * search expression can provide explicit AND and OR behavior separately.
 */
function matchesTags(record: FileEntryRecord, requestedTags: readonly string[]): boolean {
  if (requestedTags.length === 0) {
    return true;
  }

  const recordTags = new Set(record.tags.map((tag) => normalizeIndexedText(tag)));

  return requestedTags.every((tag) => recordTags.has(tag));
}

/**
 * Applies all portable repository filters to one IndexedDB record.
 */
function matchesQuery(
  record: FileEntryRecord,
  query: FileEntryQuery,
  normalizedExtensions: ReadonlySet<string> | null,
  normalizedTags: readonly string[],
  normalizedSearchText: string,
): boolean {
  if (query.sourceId !== undefined && record.sourceId !== query.sourceId) {
    return false;
  }

  if (query.parentId !== undefined) {
    const requestedParentKey = query.parentId ?? ROOT_PARENT_KEY;

    if (record.parentKey !== requestedParentKey) {
      return false;
    }
  }

  if (!matchesAllowedValue(record.kind, query.kinds)) {
    return false;
  }

  if (!matchesAllowedValue(record.category, query.categories)) {
    return false;
  }

  if (!matchesAllowedValue(record.availability, query.availability)) {
    return false;
  }

  if (!matchesAllowedValue(record.securityLevel, query.securityLevels)) {
    return false;
  }

  if (normalizedExtensions && (!record.extension || !normalizedExtensions.has(record.extension))) {
    return false;
  }

  if (!matchesTags(record, normalizedTags)) {
    return false;
  }

  if (
    normalizedSearchText &&
    !record.normalizedName.includes(normalizedSearchText) &&
    !record.normalizedRelativePath.includes(normalizedSearchText)
  ) {
    return false;
  }

  if (!matchesNumberRange(record.sizeBytes, query.minimumSizeBytes, query.maximumSizeBytes)) {
    return false;
  }

  if (
    !matchesNullableTimestampRange(record.createdAtMs, query.createdAfterMs, query.createdBeforeMs)
  ) {
    return false;
  }

  if (
    !matchesNullableTimestampRange(
      record.modifiedAtMs,
      query.modifiedAfterMs,
      query.modifiedBeforeMs,
    )
  ) {
    return false;
  }

  if (!matchesNumberRange(record.indexedAtMs, query.indexedAfterMs, query.indexedBeforeMs)) {
    return false;
  }

  return true;
}

/**
 * Compares nullable timestamps while always placing unknown values last.
 */
function compareNullableTimestamps(
  left: number | null,
  right: number | null,
  direction: SortDirection,
): number {
  if (left === null && right === null) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  const multiplier = direction === 'descending' ? -1 : 1;

  return (left - right) * multiplier;
}

/**
 * Compares two persistence records using a supported domain field.
 */
function compareRecords(
  left: FileEntryRecord,
  right: FileEntryRecord,
  sortField: FileEntrySortField,
  sortDirection: SortDirection,
): number {
  const multiplier = sortDirection === 'descending' ? -1 : 1;

  switch (sortField) {
    case 'name':
      return fileNameCollator.compare(left.name, right.name) * multiplier;

    case 'kind':
      if (left.kind === right.kind) {
        return 0;
      }

      return (left.kind === 'directory' ? -1 : 1) * multiplier;

    case 'sizeBytes':
      return (left.sizeBytes - right.sizeBytes) * multiplier;

    case 'createdAtMs':
      return compareNullableTimestamps(left.createdAtMs, right.createdAtMs, sortDirection);

    case 'modifiedAtMs':
      return compareNullableTimestamps(left.modifiedAtMs, right.modifiedAtMs, sortDirection);

    case 'indexedAtMs':
      return (left.indexedAtMs - right.indexedAtMs) * multiplier;
  }
}

/**
 * Sorts records without mutating data returned by Dexie.
 *
 * Stable fallback comparisons make pagination deterministic when multiple
 * records share the same primary sort value.
 */
function sortRecords(
  records: readonly FileEntryRecord[],
  sortField: FileEntrySortField,
  sortDirection: SortDirection,
): FileEntryRecord[] {
  return [...records].sort((left, right) => {
    const primaryComparison = compareRecords(left, right, sortField, sortDirection);

    if (primaryComparison !== 0) {
      return primaryComparison;
    }

    const nameComparison = fileNameCollator.compare(left.name, right.name);

    if (nameComparison !== 0) {
      return nameComparison;
    }

    return left.id.localeCompare(right.id);
  });
}

/**
 * Uses the most selective available IndexedDB index before applying the
 * remaining portable filters in memory.
 */
async function loadCandidateRecords(
  database: FilePilotDatabase,
  query: FileEntryQuery,
): Promise<FileEntryRecord[]> {
  if (query.sourceId !== undefined && query.parentId !== undefined) {
    const parentKey = query.parentId ?? ROOT_PARENT_KEY;

    return database.fileEntries
      .where('[sourceId+parentKey]')
      .equals([query.sourceId, parentKey])
      .toArray();
  }

  if (query.sourceId !== undefined) {
    return database.fileEntries.where('sourceId').equals(query.sourceId).toArray();
  }

  return database.fileEntries.toArray();
}

/**
 * Filters candidate records using normalized query values.
 */
function filterRecords(
  records: readonly FileEntryRecord[],
  query: FileEntryQuery,
): FileEntryRecord[] {
  const normalizedExtensions = normalizeExtensions(query.extensions);
  const normalizedTags = normalizeTags(query.tags);
  const normalizedSearchText = query.text ? normalizeIndexedText(query.text) : '';

  return records.filter((record) =>
    matchesQuery(record, query, normalizedExtensions, normalizedTags, normalizedSearchText),
  );
}

/**
 * IndexedDB implementation of the FileEntry persistence contract.
 *
 * The database is injectable so tests can create isolated temporary
 * databases without touching the user's real FilePilot library.
 */
export class IndexedDbFileEntryRepository implements FileEntryRepository {
  public constructor(private readonly database: FilePilotDatabase = filePilotDatabase) {}

  public async getById(id: string): Promise<FileEntry | null> {
    const record = await this.database.fileEntries.get(id);

    return record ? fromFileEntryRecord(record) : null;
  }

  public async find(query: FileEntryQuery = {}): Promise<FileEntryPage> {
    const { offset, limit } = resolvePagination(query);
    const candidateRecords = await loadCandidateRecords(this.database, query);
    const filteredRecords = filterRecords(candidateRecords, query);

    const sortedRecords = sortRecords(
      filteredRecords,
      query.sortBy ?? 'name',
      query.sortDirection ?? 'ascending',
    );

    return {
      items: sortedRecords
        .slice(offset, offset + limit)
        .map((record) => fromFileEntryRecord(record)),
      total: sortedRecords.length,
      offset,
      limit,
    };
  }

  public async save(entry: FileEntry): Promise<void> {
    await this.database.fileEntries.put(toFileEntryRecord(entry));
  }

  public async saveMany(entries: readonly FileEntry[]): Promise<void> {
    if (entries.length === 0) {
      return;
    }

    const records = entries.map((entry) => toFileEntryRecord(entry));

    await this.database.transaction('rw', this.database.fileEntries, async () => {
      await this.database.fileEntries.bulkPut(records);
    });
  }

  public async replaceForSource(sourceId: string, entries: readonly FileEntry[]): Promise<void> {
    if (!sourceId.trim()) {
      throw new Error('A source identifier is required when replacing indexed entries.');
    }

    if (entries.some((entry) => entry.sourceId !== sourceId)) {
      throw new Error('Every replacement entry must belong to the requested library source.');
    }

    /*
     * Convert and validate every entity before opening the transaction.
     * Invalid data therefore cannot delete an existing source index.
     */
    const records = entries.map((entry) => toFileEntryRecord(entry));

    await this.database.transaction('rw', this.database.fileEntries, async () => {
      await this.database.fileEntries.where('sourceId').equals(sourceId).delete();

      if (records.length > 0) {
        await this.database.fileEntries.bulkPut(records);
      }
    });
  }

  public async deleteById(id: string): Promise<void> {
    await this.database.fileEntries.delete(id);
  }

  public async deleteBySourceId(sourceId: string): Promise<void> {
    await this.database.fileEntries.where('sourceId').equals(sourceId).delete();
  }

  public async count(query: Omit<FileEntryQuery, 'offset' | 'limit'> = {}): Promise<number> {
    const candidateRecords = await loadCandidateRecords(this.database, query);

    return filterRecords(candidateRecords, query).length;
  }
}
