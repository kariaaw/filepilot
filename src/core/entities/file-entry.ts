import { z } from 'zod';

/**
 * High-level categories used by FilePilot for filtering, grouping,
 * statistics, and automatic organization.
 *
 * Categories intentionally remain independent from MIME types because
 * some local files may not expose a reliable MIME type.
 */
export const FileCategorySchema = z.enum([
  'document',
  'image',
  'video',
  'audio',
  'archive',
  'code',
  'text',
  'other',
]);

export type FileCategory = z.infer<typeof FileCategorySchema>;

/**
 * Distinguishes regular files from directories while keeping both
 * inside the same searchable library tree.
 */
export const FileEntryKindSchema = z.enum(['file', 'directory']);

export type FileEntryKind = z.infer<typeof FileEntryKindSchema>;

/**
 * Describes whether FilePilot can currently access an indexed entry.
 *
 * A file can become unavailable when it is moved, deleted, or when
 * the operating system revokes access to its parent directory.
 */
export const FileAvailabilitySchema = z.enum(['available', 'missing', 'permission-denied']);

export type FileAvailability = z.infer<typeof FileAvailabilitySchema>;

/**
 * Identifies the privacy policy applied to a file.
 *
 * Encryption details are deliberately kept outside this entity so
 * the core model does not depend on a specific encryption provider.
 */
export const FileSecurityLevelSchema = z.enum(['standard', 'private']);

export type FileSecurityLevel = z.infer<typeof FileSecurityLevelSchema>;

/**
 * SHA-256 is used initially because it is stable across browsers,
 * Rust, and future import/export operations.
 */
export const ContentHashSchema = z.object({
  algorithm: z.literal('sha256'),
  value: z
    .string()
    .regex(/^[a-f0-9]{64}$/, 'The SHA-256 hash must contain 64 hexadecimal characters.'),
});

export type ContentHash = z.infer<typeof ContentHashSchema>;

/**
 * Canonical domain representation of a file-system entry.
 *
 * This entity is platform-independent. Browser and Tauri adapters
 * convert their native file metadata into this shared structure.
 */
export const FileEntrySchema = z.object({
  /**
   * Stable FilePilot identifier.
   *
   * It must not depend only on the file name because different folders
   * may contain files with identical names.
   */
  id: z.string().min(1),

  /**
   * Identifier of the selected library root containing this entry.
   */
  sourceId: z.string().min(1),

  /**
   * Identifier of the parent entry.
   *
   * Root-level entries use null because their parent is the selected
   * library source rather than another indexed entry.
   */
  parentId: z.string().min(1).nullable(),

  name: z.string().trim().min(1).max(255),

  /**
   * File extension without a leading dot, stored in lowercase.
   * Directories and extensionless files use null.
   */
  extension: z.string().trim().min(1).max(32).nullable(),

  /**
   * Platform-neutral path relative to the selected library root.
   *
   * Adapters must normalize separators to forward slashes so exported
   * indexes remain portable between operating systems.
   */
  relativePath: z.string().trim().min(1),

  kind: FileEntryKindSchema,

  /**
   * MIME type when it can be determined reliably.
   */
  mimeType: z.string().trim().min(1).nullable(),

  category: FileCategorySchema,

  /**
   * File size in bytes.
   *
   * Indexed directories contain the recursive total of every descendant file.
   * Empty directories use zero.
   */
  sizeBytes: z.number().int().nonnegative(),

  /**
   * File-system timestamps represented as Unix milliseconds.
   *
   * Some platforms do not expose creation time, so nullable values
   * are required for cross-platform compatibility.
   */
  createdAtMs: z.number().int().nonnegative().nullable(),
  modifiedAtMs: z.number().int().nonnegative().nullable(),

  /**
   * Time when FilePilot first indexed this entry.
   */
  indexedAtMs: z.number().int().nonnegative(),

  /**
   * Time when the entry was most recently confirmed to exist.
   */
  lastSeenAtMs: z.number().int().nonnegative(),

  availability: FileAvailabilitySchema,
  securityLevel: FileSecurityLevelSchema,

  /**
   * Content hash remains null until background hashing is completed.
   * Directories do not receive a content hash.
   */
  contentHash: ContentHashSchema.nullable(),

  /**
   * User-defined and automatically generated searchable tags.
   */
  tags: z.array(z.string().trim().min(1).max(64)).max(100),
});

export type FileEntry = z.infer<typeof FileEntrySchema>;

/**
 * Validates unknown data before it enters the FilePilot domain.
 *
 * This function will be used by database, import, plugin, and file-system
 * adapters so malformed external data never reaches application services.
 */
export function parseFileEntry(value: unknown): FileEntry {
  return FileEntrySchema.parse(value);
}
