import type { FileEntry } from '@/core/entities/file-entry';
import type { LibrarySource } from '@/core/entities/library-source';

/**
 * Persists a completed library scan as one atomic operation.
 *
 * Indexed entries and cached source statistics must either both be committed
 * or both remain unchanged when storage fails.
 */
export interface LibraryIndexRepository {
  replaceSourceIndex(source: LibrarySource, entries: readonly FileEntry[]): Promise<void>;
}
