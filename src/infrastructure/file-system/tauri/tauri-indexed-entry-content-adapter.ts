import { invoke } from '@tauri-apps/api/core';
import { join } from '@tauri-apps/api/path';

import type {
  IndexedEntryContentAdapter,
  IndexedEntryContentReadResult,
} from '@/core/ports/file-system-adapter';
import type { TauriNativePathRegistry } from '@/infrastructure/file-system/tauri/tauri-native-path-registry';

export const MAXIMUM_NATIVE_PREVIEW_BYTES = 256 * 1024;

export type NativeContentPathJoiner = (...paths: string[]) => Promise<string>;

export interface TauriReadLibraryEntryResponse {
  bytes: readonly number[];
  truncated: boolean;
}

export type NativeEntryByteReader = (
  path: string,
  maximumBytes: number,
) => Promise<TauriReadLibraryEntryResponse>;

export interface TauriIndexedEntryContentAdapterDependencies {
  joinPath?: NativeContentPathJoiner;
  readNativeBytes?: NativeEntryByteReader;
}

const defaultReadNativeBytes: NativeEntryByteReader = (path, maximumBytes) =>
  invoke<TauriReadLibraryEntryResponse>('read_library_entry_bytes', {
    path,
    maximumBytes,
  });

function normalizeAccessKey(accessKey: string): string {
  const normalizedAccessKey = accessKey.trim();

  if (!normalizedAccessKey) {
    throw new Error('A native source access key is required to preview an indexed entry.');
  }

  return normalizedAccessKey;
}

function resolveMaximumBytes(maximumBytes: number): number {
  if (
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes < 1 ||
    maximumBytes > MAXIMUM_NATIVE_PREVIEW_BYTES
  ) {
    throw new Error(
      `Preview size must be an integer between 1 and ${MAXIMUM_NATIVE_PREVIEW_BYTES} bytes.`,
    );
  }

  return maximumBytes;
}

function resolveSafeRelativeSegments(relativePath: string): readonly string[] {
  const normalizedRelativePath = relativePath.trim().replace(/\\/g, '/');

  if (!normalizedRelativePath) {
    throw new Error('An indexed relative path is required for a file preview.');
  }

  if (
    normalizedRelativePath.startsWith('/') ||
    /^[a-zA-Z]:\//.test(normalizedRelativePath) ||
    normalizedRelativePath.includes('\0')
  ) {
    throw new Error('An indexed preview path must remain relative to its library source.');
  }

  const segments = normalizedRelativePath.split('/');

  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('An indexed preview path contains an unsafe path segment.');
  }

  return segments;
}

/**
 * Reads a bounded byte prefix from an indexed local file.
 *
 * The adapter resolves opaque source identifiers through the infrastructure
 * registry and delegates final scope validation and bounded reading to Rust.
 */
export class TauriIndexedEntryContentAdapter implements IndexedEntryContentAdapter {
  readonly platform = 'tauri' as const;

  private readonly joinPath: NativeContentPathJoiner;
  private readonly readNativeBytes: NativeEntryByteReader;

  constructor(
    private readonly nativePathRegistry: TauriNativePathRegistry,
    dependencies: TauriIndexedEntryContentAdapterDependencies = {},
  ) {
    this.joinPath = dependencies.joinPath ?? join;
    this.readNativeBytes = dependencies.readNativeBytes ?? defaultReadNativeBytes;
  }

  async readEntry(
    accessKey: string,
    relativePath: string,
    maximumBytes: number,
  ): Promise<IndexedEntryContentReadResult> {
    const normalizedAccessKey = normalizeAccessKey(accessKey);
    const resolvedMaximumBytes = resolveMaximumBytes(maximumBytes);

    const sourcePath = this.nativePathRegistry.resolve(normalizedAccessKey);

    if (sourcePath === null) {
      throw new Error(`No native path is registered for library source "${normalizedAccessKey}".`);
    }

    const relativeSegments = resolveSafeRelativeSegments(relativePath);

    const nativePath = await this.joinPath(sourcePath, ...relativeSegments);

    const response = await this.readNativeBytes(nativePath, resolvedMaximumBytes);

    return {
      bytes: Uint8Array.from(response.bytes).buffer,
      truncated: response.truncated,
    };
  }
}
