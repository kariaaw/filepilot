import { isTauri } from '@tauri-apps/api/core';
import { basename } from '@tauri-apps/api/path';
import { open } from '@tauri-apps/plugin-dialog';

import type {
  DirectorySelectionAdapter,
  SelectedDirectory,
} from '@/core/ports/file-system-adapter';
import { TauriNativePathRegistry } from '@/infrastructure/file-system/tauri/tauri-native-path-registry';

const ACCESS_KEY_PREFIX = 'tauri-directory:';

type DirectoryDialogResult = string | string[] | null;

/**
 * Replaceable native dependencies keep the adapter independently testable
 * without opening real operating-system dialogs.
 */
export interface TauriDirectorySelectionDependencies {
  isTauriEnvironment: () => boolean;
  openDirectory: () => Promise<DirectoryDialogResult>;
  getBasename: (nativePath: string) => Promise<string>;
  createAccessKey: (nativePath: string) => Promise<string>;
}

/**
 * Produces a stable opaque identifier for a native directory path.
 *
 * FilePilot stores and passes this key instead of exposing the native path
 * as an infrastructure access token.
 */
export async function createTauriDirectoryAccessKey(nativePath: string): Promise<string> {
  const encodedPath = new TextEncoder().encode(nativePath);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encodedPath);

  const hexadecimalDigest = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');

  return `${ACCESS_KEY_PREFIX}${hexadecimalDigest}`;
}

const defaultDependencies: TauriDirectorySelectionDependencies = {
  isTauriEnvironment: isTauri,

  openDirectory: () =>
    open({
      directory: true,
      multiple: false,
    }),

  getBasename: basename,
  createAccessKey: createTauriDirectoryAccessKey,
};

/**
 * Tauri implementation of FilePilot's directory-selection capability.
 *
 * Native paths remain inside infrastructure. Application and domain layers
 * receive a stable opaque key plus user-facing metadata.
 */
export class TauriDirectorySelectionAdapter implements DirectorySelectionAdapter {
  readonly platform = 'tauri' as const;

  constructor(
    private readonly dependencies: TauriDirectorySelectionDependencies = defaultDependencies,
    private readonly nativePathRegistry = new TauriNativePathRegistry(),
  ) {}

  async selectDirectory(): Promise<SelectedDirectory | null> {
    if (!this.dependencies.isTauriEnvironment()) {
      throw new Error('Native directory selection is available only inside the Tauri application.');
    }

    const selection = await this.dependencies.openDirectory();

    if (selection === null) {
      return null;
    }

    if (Array.isArray(selection)) {
      throw new Error('The native directory dialog unexpectedly returned multiple paths.');
    }

    if (selection.length === 0) {
      throw new Error('The native directory dialog returned an empty path.');
    }

    const [selectedBasename, accessKey] = await Promise.all([
      this.dependencies.getBasename(selection),
      this.dependencies.createAccessKey(selection),
    ]);

    const name = selectedBasename.trim() || 'Root directory';

    this.nativePathRegistry.register(accessKey, selection);

    return {
      accessKey,
      name,
      displayPath: selection,
      platform: this.platform,
      access: 'available',
    };
  }

  /**
   * Restores a path association from locally persisted LibrarySource metadata.
   *
   * The Tauri persisted-scope plugin separately restores operating-system
   * permissions for paths previously selected through the native dialog.
   */
  restoreNativePath(accessKey: string, nativePath: string): void {
    this.nativePathRegistry.register(accessKey, nativePath);
  }

  resolveNativePath(accessKey: string): string | null {
    return this.nativePathRegistry.resolve(accessKey);
  }

  forgetNativePath(accessKey: string): void {
    this.nativePathRegistry.forget(accessKey);
  }
}
