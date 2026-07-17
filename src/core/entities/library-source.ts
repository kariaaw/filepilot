import { z } from 'zod';

/**
 * Describes the platform that owns and provides access to a library.
 *
 * FilePilot uses this value to select the correct file-system adapter
 * without leaking browser or Tauri details into the domain layer.
 */
export const LibrarySourcePlatformSchema = z.enum(['browser', 'tauri']);

export type LibrarySourcePlatform = z.infer<typeof LibrarySourcePlatformSchema>;

/**
 * Represents the current access state of a selected library folder.
 *
 * Browser permissions can expire between sessions, while desktop folders
 * can become unavailable when a drive is disconnected or a path is moved.
 */
export const LibrarySourceAccessSchema = z.enum([
  'available',
  'permission-required',
  'unavailable',
]);

export type LibrarySourceAccess = z.infer<typeof LibrarySourceAccessSchema>;

/**
 * Controls whether FilePilot should automatically rescan a library.
 *
 * Native desktop sources can eventually use real-time file watching.
 * Browser sources may rely on manual or scheduled rescans instead.
 */
export const LibrarySyncModeSchema = z.enum(['manual', 'scheduled', 'watch']);

export type LibrarySyncMode = z.infer<typeof LibrarySyncModeSchema>;

/**
 * A user-selected root folder indexed by FilePilot.
 *
 * A source represents only the library root and its indexing state.
 * Individual files and directories are represented by FileEntry entities.
 */
export const LibrarySourceSchema = z.object({
  /**
   * Stable FilePilot identifier used by every FileEntry inside this source.
   */
  id: z.string().min(1),

  /**
   * User-facing name shown in the sidebar.
   *
   * It can initially match the folder name and later be customized
   * without changing the real file-system path.
   */
  name: z.string().trim().min(1).max(100),

  platform: LibrarySourcePlatformSchema,

  /**
   * Platform-neutral display path.
   *
   * This field is suitable for the UI and exported metadata. Sensitive
   * native handles or permission tokens must be stored by infrastructure
   * adapters rather than inside this domain entity.
   */
  displayPath: z.string().trim().min(1),

  access: LibrarySourceAccessSchema,
  syncMode: LibrarySyncModeSchema,

  /**
   * Determines whether hidden files should be included during indexing.
   */
  includeHiddenFiles: z.boolean(),

  /**
   * Folder names or relative paths excluded from indexing.
   *
   * Examples include node_modules, target, .git, and generated build output.
   */
  excludedPatterns: z.array(z.string().trim().min(1).max(255)).max(500),

  /**
   * Time when the source was first added to FilePilot.
   */
  addedAtMs: z.number().int().nonnegative(),

  /**
   * Time of the most recently completed successful scan.
   *
   * A newly added source uses null until its first scan finishes.
   */
  lastScannedAtMs: z.number().int().nonnegative().nullable(),

  /**
   * Time when the source metadata was last updated.
   */
  updatedAtMs: z.number().int().nonnegative(),

  /**
   * Cached statistics updated after a successful library scan.
   */
  statistics: z.object({
    fileCount: z.number().int().nonnegative(),
    directoryCount: z.number().int().nonnegative(),
    totalSizeBytes: z.number().int().nonnegative(),
  }),
});

export type LibrarySource = z.infer<typeof LibrarySourceSchema>;

/**
 * Validates external source metadata before it enters the domain layer.
 *
 * Database records, imports, plugins, and file-system adapters must pass
 * through this boundary to keep invalid state out of application services.
 */
export function parseLibrarySource(value: unknown): LibrarySource {
  return LibrarySourceSchema.parse(value);
}
