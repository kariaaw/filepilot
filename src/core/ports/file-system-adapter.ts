import type { FileCategory, FileEntryKind } from '@/core/entities/file-entry';
import type { LibrarySourceAccess, LibrarySourcePlatform } from '@/core/entities/library-source';

/**
 * Metadata returned immediately after the user selects a folder.
 *
 * Native directory handles, operating-system paths, and permission tokens
 * remain private inside infrastructure adapters. The core receives only
 * portable metadata that is safe to store and export.
 */
export interface SelectedDirectory {
  /**
   * Adapter-generated identifier used to reconnect to the selected folder.
   *
   * Browser adapters can associate this key with a FileSystemDirectoryHandle,
   * while Tauri adapters can associate it with a native directory path.
   */
  accessKey: string;

  name: string;
  displayPath: string;
  platform: LibrarySourcePlatform;
  access: LibrarySourceAccess;
}

/**
 * Options controlling how a library source is scanned.
 */
export interface DirectoryScanOptions {
  /**
   * Includes files and directories whose names begin with a dot.
   */
  includeHiddenFiles: boolean;

  /**
   * Relative paths or directory names that must not be indexed.
   *
   * Examples include node_modules, .git, target, and generated output.
   */
  excludedPatterns: readonly string[];

  /**
   * Prevents accidental traversal of unexpectedly deep directory trees.
   */
  maximumDepth?: number;

  /**
   * Allows a scan operation to be cancelled without leaving the
   * application in an inconsistent state.
   */
  signal?: AbortSignal;
}

/**
 * Portable representation of an entry discovered during directory scanning.
 *
 * This structure contains raw file-system metadata. Application services
 * later validate and transform it into the canonical FileEntry entity.
 */
export interface DiscoveredFileSystemEntry {
  name: string;

  /**
   * Relative path from the selected library root.
   *
   * All adapters must normalize path separators to forward slashes.
   */
  relativePath: string;

  kind: FileEntryKind;

  /**
   * Extension without a leading dot and normalized to lowercase.
   */
  extension: string | null;

  mimeType: string | null;
  category: FileCategory;
  sizeBytes: number;

  createdAtMs: number | null;
  modifiedAtMs: number | null;
}

/**
 * Access state returned when FilePilot reconnects to a saved source.
 */
export interface FileSystemAccessStatus {
  accessKey: string;
  access: LibrarySourceAccess;
}

/**
 * Options used when reading file content.
 *
 * Byte ranges allow preview, hashing, and metadata extraction to process
 * large files without loading the entire file into memory.
 */
export interface ReadFileOptions {
  startByte?: number;
  endByteExclusive?: number;
  signal?: AbortSignal;
}

/**
 * Platform-independent contract for local file-system access.
 *
 * Browser and Tauri implementations must keep files on the user's device.
 * No method in this interface uploads file content to a remote server.
 */
export interface FileSystemAdapter {
  /**
   * Identifies the platform implemented by the current adapter.
   */
  readonly platform: LibrarySourcePlatform;

  /**
   * Opens the platform folder picker and registers the selected directory.
   *
   * Returns null when the user closes the picker without selecting a folder.
   */
  selectDirectory(): Promise<SelectedDirectory | null>;

  /**
   * Checks whether a previously selected source is still accessible.
   */
  checkAccess(accessKey: string): Promise<FileSystemAccessStatus>;

  /**
   * Requests access again when browser permissions expired or the operating
   * system requires the user to reconnect a directory.
   */
  requestAccess(accessKey: string): Promise<FileSystemAccessStatus>;

  /**
   * Traverses a selected directory incrementally.
   *
   * AsyncIterable allows the indexing service to process large libraries
   * without storing every discovered entry in memory at once.
   */
  scanDirectory(
    accessKey: string,
    options: DirectoryScanOptions,
  ): AsyncIterable<DiscoveredFileSystemEntry>;

  /**
   * Reads the entire file or a selected byte range.
   */
  readFile(
    accessKey: string,
    relativePath: string,
    options?: ReadFileOptions,
  ): Promise<ArrayBuffer>;

  /**
   * Opens a local file using the platform's default application.
   *
   * Browser implementations may return false when the environment does
   * not support opening local files outside FilePilot.
   */
  openFile(accessKey: string, relativePath: string): Promise<boolean>;

  /**
   * Reveals a file inside its containing operating-system folder.
   *
   * This is normally available in Tauri and may be unsupported in browsers.
   */
  revealFile(accessKey: string, relativePath: string): Promise<boolean>;

  /**
   * Removes adapter-specific access information for a library source.
   *
   * This does not delete the user's real folder or files.
   */
  forgetDirectory(accessKey: string): Promise<void>;
}
