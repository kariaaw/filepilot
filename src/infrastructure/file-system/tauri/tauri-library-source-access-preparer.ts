import type { LibrarySource } from '@/core/entities/library-source';
import type { LibrarySourceAccessPreparer } from '@/features/library/application/index-library-source';
import { TauriNativePathRegistry } from '@/infrastructure/file-system/tauri/tauri-native-path-registry';

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
 * Restores the infrastructure-only native path association for a persisted
 * Tauri library source before file-system operations begin.
 *
 * Operating-system permissions are restored separately by Tauri's persisted
 * scope plugin. This preparer restores FilePilot's access-key-to-path mapping.
 */
export class TauriLibrarySourceAccessPreparer implements LibrarySourceAccessPreparer {
  readonly platform = 'tauri' as const;

  constructor(private readonly nativePathRegistry: TauriNativePathRegistry) {}

  async prepareSource(source: LibrarySource, signal?: AbortSignal): Promise<void> {
    throwIfCancelled(signal);

    if (source.platform !== this.platform) {
      throw new Error('Only Tauri library sources can be prepared by the Tauri access preparer.');
    }

    this.nativePathRegistry.register(source.id, source.displayPath);

    throwIfCancelled(signal);
  }
}
