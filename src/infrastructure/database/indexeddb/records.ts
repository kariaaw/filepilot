import { parseFileEntry, type FileEntry } from '@/core/entities/file-entry';
import { parseLibrarySource, type LibrarySource } from '@/core/entities/library-source';

/**
 * IndexedDB keys cannot reliably use null inside compound indexes.
 *
 * Root-level entries therefore use this internal value while the domain
 * entity continues to expose parentId as null.
 */
export const ROOT_PARENT_KEY = '__filepilot_root__';

/**
 * Persistence representation of a FileEntry.
 *
 * The additional properties are derived values used only for database
 * indexing. They must never leak into the core domain model.
 */
export type FileEntryRecord = FileEntry & {
  /**
   * Index-safe representation of parentId.
   */
  parentKey: string;

  /**
   * Normalized values used for case-insensitive metadata searches.
   */
  normalizedName: string;
  normalizedRelativePath: string;

  /**
   * Flat hash value used by duplicate-detection indexes.
   *
   * Keeping it flat avoids coupling database queries to the nested
   * ContentHash structure.
   */
  hashValue: string | null;
};

/**
 * Persistence representation of a LibrarySource.
 *
 * Searchable text is stored in normalized form so repository adapters
 * do not repeatedly normalize every record during each query.
 */
export type LibrarySourceRecord = LibrarySource & {
  normalizedName: string;
  normalizedDisplayPath: string;
};

/**
 * Produces a stable, Unicode-normalized value for database indexes.
 *
 * NFKC reduces visually equivalent Unicode forms to a consistent
 * representation. Language-specific Persian and English normalization
 * will later be handled by the dedicated search service.
 */
export function normalizeIndexedText(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase();
}

/**
 * Converts a validated domain entity into its IndexedDB representation.
 */
export function toFileEntryRecord(entry: FileEntry): FileEntryRecord {
  const validatedEntry = parseFileEntry(entry);

  return {
    ...validatedEntry,
    parentKey: validatedEntry.parentId ?? ROOT_PARENT_KEY,
    normalizedName: normalizeIndexedText(validatedEntry.name),
    normalizedRelativePath: normalizeIndexedText(validatedEntry.relativePath),
    hashValue: validatedEntry.contentHash?.value ?? null,
  };
}

/**
 * Removes persistence-only fields and validates the resulting domain entity.
 *
 * Database records are treated as untrusted input because they may originate
 * from an older schema version, an import, or manual browser modification.
 */
export function fromFileEntryRecord(record: FileEntryRecord): FileEntry {
  const {
    parentKey: _parentKey,
    normalizedName: _normalizedName,
    normalizedRelativePath: _normalizedRelativePath,
    hashValue: _hashValue,
    ...entry
  } = record;

  return parseFileEntry(entry);
}

/**
 * Converts a validated library source into its IndexedDB representation.
 */
export function toLibrarySourceRecord(source: LibrarySource): LibrarySourceRecord {
  const validatedSource = parseLibrarySource(source);

  return {
    ...validatedSource,
    normalizedName: normalizeIndexedText(validatedSource.name),
    normalizedDisplayPath: normalizeIndexedText(validatedSource.displayPath),
  };
}

/**
 * Removes persistence-only fields and validates the resulting source entity.
 */
export function fromLibrarySourceRecord(record: LibrarySourceRecord): LibrarySource {
  const {
    normalizedName: _normalizedName,
    normalizedDisplayPath: _normalizedDisplayPath,
    ...source
  } = record;

  return parseLibrarySource(source);
}
