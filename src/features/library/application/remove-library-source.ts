import type { LibrarySource } from '@/core/entities/library-source';
import type { FileSystemAdapter } from '@/core/ports/file-system-adapter';
import type { LibraryIndexRepository } from '@/core/ports/library-index-repository';
import type { LibrarySourceRepository } from '@/core/ports/library-source-repository';

/**
 * Narrow source lookup capability required before deletion.
 */
export type LibrarySourceRemovalLookupRepository = Pick<LibrarySourceRepository, 'getById'>;

/**
 * Atomic persistence capability used to remove source metadata and entries.
 */
export type LibrarySourceIndexRemovalRepository = Pick<LibraryIndexRepository, 'deleteSourceIndex'>;

/**
 * Narrow platform capability used to forget adapter-specific source access.
 */
export type LibrarySourceAccessForgetter = Pick<FileSystemAdapter, 'forgetDirectory'>;

export interface RemoveLibrarySourceDependencies {
  librarySourceRepository: LibrarySourceRemovalLookupRepository;
  libraryIndexRepository: LibrarySourceIndexRemovalRepository;
  sourceAccessForgetter: LibrarySourceAccessForgetter;
}

export interface RemoveLibrarySourceResult {
  source: LibrarySource;
}

/**
 * Disconnects one folder from FilePilot and removes its local metadata index.
 *
 * This workflow never deletes, moves, or modifies real files on disk.
 */
export class RemoveLibrarySource {
  constructor(private readonly dependencies: RemoveLibrarySourceDependencies) {}

  async execute(sourceId: string): Promise<RemoveLibrarySourceResult> {
    const normalizedSourceId = sourceId.trim();

    if (!normalizedSourceId) {
      throw new Error('A library source identifier is required.');
    }

    const source = await this.dependencies.librarySourceRepository.getById(normalizedSourceId);

    if (!source) {
      throw new Error('The requested library source does not exist.');
    }

    /*
     * Durable source metadata and indexed entries are removed first inside
     * one database transaction. Adapter-specific in-memory access is then
     * forgotten so disconnected native paths cannot remain registered.
     */
    await this.dependencies.libraryIndexRepository.deleteSourceIndex(normalizedSourceId);

    await this.dependencies.sourceAccessForgetter.forgetDirectory(source.id);

    return {
      source,
    };
  }
}
