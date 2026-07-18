import { invoke } from '@tauri-apps/api/core';
import { join } from '@tauri-apps/api/path';
import { revealItemInDir } from '@tauri-apps/plugin-opener';

import type { IndexedEntryOpenAdapter } from '@/core/ports/file-system-adapter';
import type { TauriNativePathRegistry } from '@/infrastructure/file-system/tauri/tauri-native-path-registry';

export type NativePathJoiner = (...paths: string[]) => Promise<string>;
export type NativePathOpener = (path: string) => Promise<void>;
export type NativeItemRevealer = (path: string | string[]) => Promise<void>;

export interface TauriIndexedEntryOpenAdapterDependencies {
  joinPath?: NativePathJoiner;
  openNativePath?: NativePathOpener;
  revealNativeItem?: NativeItemRevealer;
}

const defaultOpenNativePath: NativePathOpener = (path) =>
  invoke<void>('open_library_entry', {
    path,
  });

function normalizeAccessKey(accessKey: string): string {
  const normalizedAccessKey = accessKey.trim();

  if (!normalizedAccessKey) {
    throw new Error('A native source access key is required to open an indexed entry.');
  }

  return normalizedAccessKey;
}

function resolveSafeRelativeSegments(relativePath: string): readonly string[] {
  const normalizedRelativePath = relativePath.trim().replace(/\\/g, '/');

  if (!normalizedRelativePath) {
    throw new Error('An indexed relative path is required for a native entry operation.');
  }

  if (
    normalizedRelativePath.startsWith('/') ||
    /^[a-zA-Z]:\//.test(normalizedRelativePath) ||
    normalizedRelativePath.includes('\0')
  ) {
    throw new Error('An indexed entry path must remain relative to its library source.');
  }

  const segments = normalizedRelativePath.split('/');

  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('An indexed entry path contains an unsafe path segment.');
  }

  return segments;
}

/**
 * Opens and reveals indexed entries using the operating system.
 *
 * The adapter resolves FilePilot's opaque source key through the native path
 * registry and joins the stored portable relative path using Tauri's
 * platform-aware path API.
 */
export class TauriIndexedEntryOpenAdapter implements IndexedEntryOpenAdapter {
  readonly platform = 'tauri' as const;

  private readonly joinPath: NativePathJoiner;
  private readonly openNativePath: NativePathOpener;
  private readonly revealNativeItem: NativeItemRevealer;

  constructor(
    private readonly nativePathRegistry: TauriNativePathRegistry,
    dependencies: TauriIndexedEntryOpenAdapterDependencies = {},
  ) {
    this.joinPath = dependencies.joinPath ?? join;
    this.openNativePath = dependencies.openNativePath ?? defaultOpenNativePath;
    this.revealNativeItem = dependencies.revealNativeItem ?? revealItemInDir;
  }

  async openEntry(accessKey: string, relativePath: string): Promise<void> {
    const nativePath = await this.resolveNativeEntryPath(accessKey, relativePath);

    await this.openNativePath(nativePath);
  }

  async revealEntry(accessKey: string, relativePath: string): Promise<void> {
    const nativePath = await this.resolveNativeEntryPath(accessKey, relativePath);

    await this.revealNativeItem(nativePath);
  }

  private async resolveNativeEntryPath(accessKey: string, relativePath: string): Promise<string> {
    const normalizedAccessKey = normalizeAccessKey(accessKey);

    const sourcePath = this.nativePathRegistry.resolve(normalizedAccessKey);

    if (sourcePath === null) {
      throw new Error(`No native path is registered for library source "${normalizedAccessKey}".`);
    }

    const relativeSegments = resolveSafeRelativeSegments(relativePath);

    return this.joinPath(sourcePath, ...relativeSegments);
  }
}
