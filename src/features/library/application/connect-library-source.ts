import { parseLibrarySource, type LibrarySource } from '@/core/entities/library-source';
import type { DirectorySelectionAdapter } from '@/core/ports/file-system-adapter';
import type { LibrarySourceRepository } from '@/core/ports/library-source-repository';

/**
 * Default folders excluded from initial indexing.
 *
 * These directories normally contain generated files, dependency caches,
 * or repository internals that provide little value in a personal library.
 */
export const DEFAULT_LIBRARY_EXCLUDED_PATTERNS = [
  '.git',
  'node_modules',
  'target',
  'dist',
  'build',
] as const;

/**
 * Narrow persistence capability required by this application workflow.
 */
export type LibrarySourceConnectionRepository = Pick<LibrarySourceRepository, 'getById' | 'save'>;

export type ConnectLibrarySourceResult =
  | {
      status: 'cancelled';
    }
  | {
      status: 'created' | 'reconnected';
      source: LibrarySource;
    };

export interface ConnectLibrarySourceDependencies {
  directorySelectionAdapter: DirectorySelectionAdapter;
  librarySourceRepository: LibrarySourceConnectionRepository;

  /**
   * Injectable clock keeps timestamps deterministic in automated tests.
   */
  now?: () => number;
}

/**
 * Selects a local directory and persists it as a FilePilot library source.
 *
 * Selecting an already registered access key reconnects the existing source
 * rather than creating a duplicate. User-customized settings and statistics
 * are preserved during reconnection.
 */
export class ConnectLibrarySource {
  private readonly now: () => number;

  constructor(private readonly dependencies: ConnectLibrarySourceDependencies) {
    this.now = dependencies.now ?? Date.now;
  }

  async execute(): Promise<ConnectLibrarySourceResult> {
    const selectedDirectory = await this.dependencies.directorySelectionAdapter.selectDirectory();

    if (selectedDirectory === null) {
      return {
        status: 'cancelled',
      };
    }

    if (selectedDirectory.platform !== this.dependencies.directorySelectionAdapter.platform) {
      throw new Error(
        'The selected directory platform does not match the active file-system adapter.',
      );
    }

    const timestamp = this.getCurrentTimestamp();

    const existingSource = await this.dependencies.librarySourceRepository.getById(
      selectedDirectory.accessKey,
    );

    if (existingSource) {
      if (existingSource.platform !== selectedDirectory.platform) {
        throw new Error('The selected directory access key belongs to a different platform.');
      }

      const reconnectedSource = parseLibrarySource({
        ...existingSource,
        displayPath: selectedDirectory.displayPath,
        access: selectedDirectory.access,
        updatedAtMs: timestamp,
      });

      await this.dependencies.librarySourceRepository.save(reconnectedSource);

      return {
        status: 'reconnected',
        source: reconnectedSource,
      };
    }

    const source = parseLibrarySource({
      /*
       * Adapter access keys are stable, opaque identifiers and therefore
       * also serve as the source identifier required by related FileEntry
       * records.
       */
      id: selectedDirectory.accessKey,
      name: selectedDirectory.name,
      platform: selectedDirectory.platform,
      displayPath: selectedDirectory.displayPath,
      access: selectedDirectory.access,
      syncMode: 'manual',
      includeHiddenFiles: false,
      excludedPatterns: [...DEFAULT_LIBRARY_EXCLUDED_PATTERNS],
      addedAtMs: timestamp,
      lastScannedAtMs: null,
      updatedAtMs: timestamp,
      statistics: {
        fileCount: 0,
        directoryCount: 0,
        totalSizeBytes: 0,
      },
    });

    await this.dependencies.librarySourceRepository.save(source);

    return {
      status: 'created',
      source,
    };
  }

  private getCurrentTimestamp(): number {
    const timestamp = this.now();

    if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
      throw new Error('The library connection clock must return a non-negative integer timestamp.');
    }

    return timestamp;
  }
}
