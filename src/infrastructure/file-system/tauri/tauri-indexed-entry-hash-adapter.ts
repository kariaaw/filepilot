import { invoke } from '@tauri-apps/api/core';
import { join } from '@tauri-apps/api/path';

import type {
  IndexedEntryHashAdapter,
  IndexedEntryHashResult,
} from '@/core/ports/file-system-adapter';
import type { TauriNativePathRegistry } from '@/infrastructure/file-system/tauri/tauri-native-path-registry';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export type NativeHashPathJoiner = (...paths: string[]) => Promise<string>;

export interface TauriHashLibraryEntryResponse {
  algorithm: string;
  value: string;
  sizeBytes: number;
}

export type NativeEntryHasher = (path: string) => Promise<TauriHashLibraryEntryResponse>;

export interface TauriIndexedEntryHashAdapterDependencies {
  joinPath?: NativeHashPathJoiner;
  hashNativeEntry?: NativeEntryHasher;
}

const defaultHashNativeEntry: NativeEntryHasher = (path) =>
  invoke<TauriHashLibraryEntryResponse>('hash_library_entry_sha256', {
    path,
  });

function createCancellationError(): Error {
  const error = new Error('Duplicate analysis was cancelled.');

  error.name = 'AbortError';

  return error;
}

function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createCancellationError();
  }
}

function normalizeAccessKey(accessKey: string): string {
  const normalizedAccessKey = accessKey.trim();

  if (!normalizedAccessKey) {
    throw new Error('A native source access key is required to hash an indexed entry.');
  }

  return normalizedAccessKey;
}

function resolveSafeRelativeSegments(relativePath: string): readonly string[] {
  const normalizedRelativePath = relativePath.trim().replace(/\\/g, '/');

  if (!normalizedRelativePath) {
    throw new Error('An indexed relative path is required for content hashing.');
  }

  if (
    normalizedRelativePath.startsWith('/') ||
    /^[a-zA-Z]:\//.test(normalizedRelativePath) ||
    normalizedRelativePath.includes('\0')
  ) {
    throw new Error('An indexed hashing path must remain relative to its library source.');
  }

  const segments = normalizedRelativePath.split('/');

  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('An indexed hashing path contains an unsafe path segment.');
  }

  return segments;
}

function parseNativeHashResponse(response: TauriHashLibraryEntryResponse): IndexedEntryHashResult {
  if (response.algorithm !== 'sha256') {
    throw new Error('The native hashing operation returned an unsupported algorithm.');
  }

  if (!SHA256_PATTERN.test(response.value)) {
    throw new Error('The native hashing operation returned an invalid SHA-256 value.');
  }

  if (!Number.isSafeInteger(response.sizeBytes) || response.sizeBytes < 0) {
    throw new Error('The native hashing operation returned an invalid file size.');
  }

  return {
    algorithm: 'sha256',
    value: response.value,
    sizeBytes: response.sizeBytes,
  };
}

/**
 * Streams SHA-256 hashing through the native Rust command.
 *
 * Native source paths remain inside infrastructure, while Rust performs final
 * scope validation and reads the file using a fixed-size buffer.
 */
export class TauriIndexedEntryHashAdapter implements IndexedEntryHashAdapter {
  readonly platform = 'tauri' as const;

  private readonly joinPath: NativeHashPathJoiner;
  private readonly hashNativeEntry: NativeEntryHasher;

  constructor(
    private readonly nativePathRegistry: TauriNativePathRegistry,
    dependencies: TauriIndexedEntryHashAdapterDependencies = {},
  ) {
    this.joinPath = dependencies.joinPath ?? join;
    this.hashNativeEntry = dependencies.hashNativeEntry ?? defaultHashNativeEntry;
  }

  async hashEntry(
    accessKey: string,
    relativePath: string,
    signal?: AbortSignal,
  ): Promise<IndexedEntryHashResult> {
    throwIfCancelled(signal);

    const normalizedAccessKey = normalizeAccessKey(accessKey);
    const sourcePath = this.nativePathRegistry.resolve(normalizedAccessKey);

    if (sourcePath === null) {
      throw new Error(`No native path is registered for library source "${normalizedAccessKey}".`);
    }

    const relativeSegments = resolveSafeRelativeSegments(relativePath);
    const nativePath = await this.joinPath(sourcePath, ...relativeSegments);

    throwIfCancelled(signal);

    const response = await this.hashNativeEntry(nativePath);

    throwIfCancelled(signal);

    return parseNativeHashResponse(response);
  }
}
