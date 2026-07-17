import { join } from '@tauri-apps/api/path';
import { readDir, stat } from '@tauri-apps/plugin-fs';

import type { FileCategory } from '@/core/entities/file-entry';
import type {
  DirectoryScanAdapter,
  DirectoryScanOptions,
  DiscoveredFileSystemEntry,
} from '@/core/ports/file-system-adapter';
import { TauriNativePathRegistry } from '@/infrastructure/file-system/tauri/tauri-native-path-registry';

export interface TauriNativeDirectoryEntry {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
  isSymlink: boolean;
}

export interface TauriNativeFileInfo {
  isDirectory: boolean;
  isFile: boolean;
  isSymlink: boolean;
  size: number;
  mtime: Date | null;
  birthtime: Date | null;
}

/**
 * Replaceable native dependencies keep traversal tests independent from the
 * real operating system and Tauri runtime.
 */
export interface TauriDirectoryScanDependencies {
  readDirectory: (nativePath: string) => Promise<readonly TauriNativeDirectoryEntry[]>;

  readMetadata: (nativePath: string) => Promise<TauriNativeFileInfo>;

  joinPath: (...segments: string[]) => Promise<string>;
}

interface PendingDirectory {
  nativePath: string;
  relativePath: string;
  entryDepth: number;
}

const CATEGORY_BY_EXTENSION: Readonly<Partial<Record<string, FileCategory>>> = {
  pdf: 'document',
  doc: 'document',
  docx: 'document',
  xls: 'document',
  xlsx: 'document',
  ppt: 'document',
  pptx: 'document',
  odt: 'document',
  ods: 'document',
  odp: 'document',

  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  bmp: 'image',
  tif: 'image',
  tiff: 'image',
  heic: 'image',

  mp4: 'video',
  mkv: 'video',
  mov: 'video',
  avi: 'video',
  webm: 'video',
  m4v: 'video',

  mp3: 'audio',
  wav: 'audio',
  flac: 'audio',
  aac: 'audio',
  ogg: 'audio',
  m4a: 'audio',

  zip: 'archive',
  rar: 'archive',
  '7z': 'archive',
  tar: 'archive',
  gz: 'archive',
  bz2: 'archive',
  xz: 'archive',

  js: 'code',
  jsx: 'code',
  ts: 'code',
  tsx: 'code',
  json: 'code',
  html: 'code',
  css: 'code',
  scss: 'code',
  py: 'code',
  rs: 'code',
  go: 'code',
  java: 'code',
  c: 'code',
  h: 'code',
  cpp: 'code',
  hpp: 'code',
  sh: 'code',
  sql: 'code',
  xml: 'code',
  yaml: 'code',
  yml: 'code',

  txt: 'text',
  md: 'text',
  markdown: 'text',
  log: 'text',
  csv: 'text',
  rtf: 'text',
};

const MIME_TYPE_BY_EXTENSION: Readonly<Partial<Record<string, string>>> = {
  pdf: 'application/pdf',
  json: 'application/json',
  xml: 'application/xml',
  zip: 'application/zip',
  gz: 'application/gzip',

  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  csv: 'text/csv',
  html: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  jsx: 'text/javascript',
  ts: 'text/typescript',
  tsx: 'text/typescript',

  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',

  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',

  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
};

const defaultDependencies: TauriDirectoryScanDependencies = {
  readDirectory: (nativePath) => readDir(nativePath),
  readMetadata: (nativePath) => stat(nativePath),
  joinPath: (...segments) => join(...segments),
};

function throwIfCancelled(signal?: AbortSignal): void {
  if (!signal?.aborted) {
    return;
  }

  const cancellationError = new Error('Directory scan was cancelled.');

  cancellationError.name = 'AbortError';

  throw cancellationError;
}

function resolveMaximumDepth(maximumDepth: number | undefined): number {
  if (maximumDepth === undefined) {
    return Number.POSITIVE_INFINITY;
  }

  if (!Number.isSafeInteger(maximumDepth) || maximumDepth < 0) {
    throw new Error('Directory scan maximum depth must be a non-negative integer.');
  }

  return maximumDepth;
}

function normalizeRelativePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/\/{2,}/g, '/');
}

function normalizeExcludedPatterns(patterns: readonly string[]): readonly string[] {
  return patterns
    .map((pattern) => normalizeRelativePath(pattern.trim()).replace(/\/+$/, ''))
    .filter(Boolean);
}

function isExcludedEntry(
  entryName: string,
  relativePath: string,
  excludedPatterns: readonly string[],
): boolean {
  const normalizedRelativePath = normalizeRelativePath(relativePath);

  const pathSegments = normalizedRelativePath.split('/');

  return excludedPatterns.some((pattern) => {
    if (pattern.includes('/')) {
      return normalizedRelativePath === pattern || normalizedRelativePath.startsWith(`${pattern}/`);
    }

    return entryName === pattern || pathSegments.includes(pattern);
  });
}

function resolveExtension(name: string): string | null {
  const finalDotIndex = name.lastIndexOf('.');

  if (finalDotIndex <= 0 || finalDotIndex === name.length - 1) {
    return null;
  }

  const extension = name
    .slice(finalDotIndex + 1)
    .trim()
    .toLowerCase();

  if (!extension || extension.length > 32) {
    return null;
  }

  return extension;
}

function resolveCategory(extension: string | null): FileCategory {
  if (extension === null) {
    return 'other';
  }

  return CATEGORY_BY_EXTENSION[extension] ?? 'other';
}

function resolveMimeType(extension: string | null): string | null {
  if (extension === null) {
    return null;
  }

  return MIME_TYPE_BY_EXTENSION[extension] ?? null;
}

function resolveTimestamp(value: Date | null): number | null {
  if (value === null) {
    return null;
  }

  const timestamp = value.getTime();

  if (!Number.isFinite(timestamp) || timestamp < 0) {
    return null;
  }

  return Math.trunc(timestamp);
}

function resolveSize(size: number, isDirectory: boolean): number {
  if (isDirectory) {
    return 0;
  }

  if (!Number.isFinite(size) || size < 0) {
    return 0;
  }

  return Math.trunc(size);
}

function compareDirectoryEntries(
  left: TauriNativeDirectoryEntry,
  right: TauriNativeDirectoryEntry,
): number {
  if (left.name === right.name) {
    return 0;
  }

  return left.name < right.name ? -1 : 1;
}

/**
 * Tauri implementation of FilePilot's incremental directory scanner.
 *
 * Traversal uses a queue instead of recursive function calls so deeply nested
 * directory trees cannot overflow the JavaScript call stack.
 */
export class TauriDirectoryScanAdapter implements DirectoryScanAdapter {
  readonly platform = 'tauri' as const;

  constructor(
    private readonly nativePathRegistry: TauriNativePathRegistry,
    private readonly dependencies: TauriDirectoryScanDependencies = defaultDependencies,
  ) {}

  async *scanDirectory(
    accessKey: string,
    options: DirectoryScanOptions,
  ): AsyncIterable<DiscoveredFileSystemEntry> {
    throwIfCancelled(options.signal);

    const rootNativePath = this.nativePathRegistry.resolve(accessKey);

    if (rootNativePath === null) {
      throw new Error(`No native directory path is registered for access key "${accessKey}".`);
    }

    const maximumDepth = resolveMaximumDepth(options.maximumDepth);

    const excludedPatterns = normalizeExcludedPatterns(options.excludedPatterns);

    const pendingDirectories: PendingDirectory[] = [
      {
        nativePath: rootNativePath,
        relativePath: '',
        entryDepth: 0,
      },
    ];

    for (let pendingIndex = 0; pendingIndex < pendingDirectories.length; pendingIndex += 1) {
      throwIfCancelled(options.signal);

      const pendingDirectory = pendingDirectories[pendingIndex];

      const nativeEntries = [
        ...(await this.dependencies.readDirectory(pendingDirectory.nativePath)),
      ].sort(compareDirectoryEntries);

      throwIfCancelled(options.signal);

      for (const nativeEntry of nativeEntries) {
        throwIfCancelled(options.signal);

        const entryName = nativeEntry.name.trim();

        if (!entryName || entryName === '.' || entryName === '..' || nativeEntry.isSymlink) {
          continue;
        }

        if (!options.includeHiddenFiles && entryName.startsWith('.')) {
          continue;
        }

        const relativePath = normalizeRelativePath(
          pendingDirectory.relativePath
            ? `${pendingDirectory.relativePath}/${entryName}`
            : entryName,
        );

        if (isExcludedEntry(entryName, relativePath, excludedPatterns)) {
          continue;
        }

        const nativePath = await this.dependencies.joinPath(pendingDirectory.nativePath, entryName);

        throwIfCancelled(options.signal);

        const metadata = await this.dependencies.readMetadata(nativePath);

        throwIfCancelled(options.signal);

        if (metadata.isSymlink) {
          continue;
        }

        const isDirectory = metadata.isDirectory;
        const isFile = metadata.isFile;

        if (!isDirectory && !isFile) {
          continue;
        }

        const extension = isFile ? resolveExtension(entryName) : null;

        yield {
          name: entryName,
          relativePath,
          kind: isDirectory ? 'directory' : 'file',
          extension,
          mimeType: isFile ? resolveMimeType(extension) : null,
          category: isFile ? resolveCategory(extension) : 'other',
          sizeBytes: resolveSize(metadata.size, isDirectory),
          createdAtMs: resolveTimestamp(metadata.birthtime),
          modifiedAtMs: resolveTimestamp(metadata.mtime),
        };

        if (isDirectory && pendingDirectory.entryDepth < maximumDepth) {
          pendingDirectories.push({
            nativePath,
            relativePath,
            entryDepth: pendingDirectory.entryDepth + 1,
          });
        }
      }
    }
  }
}
