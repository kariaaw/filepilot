import { invoke } from '@tauri-apps/api/core';

import type { LibrarySource } from '@/core/entities/library-source';
import type { LibrarySourceAccessPreparer } from '@/features/library/application/index-library-source';
import { TauriNativePathRegistry } from '@/infrastructure/file-system/tauri/tauri-native-path-registry';

export interface TauriLibrarySourceAccessDependencies {
  restoreRecursiveScope: (nativePath: string) => Promise<void>;
}

const defaultDependencies: TauriLibrarySourceAccessDependencies = {
  restoreRecursiveScope: (nativePath) =>
    invoke<void>('restore_library_source_scope', {
      path: nativePath,
    }),
};

function createCancellationError(): Error {
  const error = new Error('Library source access preparation was cancelled.');

  error.name = 'AbortError';

  return error;
}

function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createCancellationError();
  }
}

/**
 * Restores both the native path association and recursive Tauri file-system
 * scope before indexing a persisted library source.
 */
export class TauriLibrarySourceAccessPreparer implements LibrarySourceAccessPreparer {
  readonly platform = 'tauri' as const;

  constructor(
    private readonly nativePathRegistry: TauriNativePathRegistry,
    private readonly dependencies: TauriLibrarySourceAccessDependencies = defaultDependencies,
  ) {}

  async prepareSource(source: LibrarySource, signal?: AbortSignal): Promise<void> {
    throwIfCancelled(signal);

    if (source.platform !== this.platform) {
      throw new Error('Only Tauri library sources can be prepared by the Tauri access preparer.');
    }

    await this.dependencies.restoreRecursiveScope(source.displayPath);

    throwIfCancelled(signal);

    this.nativePathRegistry.register(source.id, source.displayPath);
  }
}
