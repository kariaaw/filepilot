import { describe, expect, it } from 'vitest';

import type { FileAvailability, FileEntry } from '@/core/entities/file-entry';
import type { LibrarySource, LibrarySourcePlatform } from '@/core/entities/library-source';
import type { IndexedEntryOpenAdapter } from '@/core/ports/file-system-adapter';
import {
  OpenIndexedEntry,
  type IndexedEntryAccessPreparer,
  type IndexedEntryOpeningRepository,
  type IndexedEntrySourceRepository,
} from '@/features/library/application/open-indexed-entry';
import { createFileEntry, createLibrarySource } from '@/test/factories';

class StubEntryRepository implements IndexedEntryOpeningRepository {
  readonly requestedIds: string[] = [];

  constructor(private readonly entry: FileEntry | null) {}

  async getById(id: string): Promise<FileEntry | null> {
    this.requestedIds.push(id);

    return this.entry?.id === id ? this.entry : null;
  }
}

class StubSourceRepository implements IndexedEntrySourceRepository {
  readonly requestedIds: string[] = [];

  constructor(private readonly source: LibrarySource | null) {}

  async getById(id: string): Promise<LibrarySource | null> {
    this.requestedIds.push(id);

    return this.source?.id === id ? this.source : null;
  }
}

class StubAccessPreparer implements IndexedEntryAccessPreparer {
  readonly preparedSources: LibrarySource[] = [];

  constructor(
    readonly platform: LibrarySourcePlatform = 'tauri',
    private readonly onPrepare?: () => void,
  ) {}

  async prepareSource(source: LibrarySource, signal?: AbortSignal): Promise<void> {
    this.preparedSources.push(source);
    this.onPrepare?.();

    if (signal?.aborted) {
      const error = new Error('Library source access preparation was cancelled.');

      error.name = 'AbortError';

      throw error;
    }
  }
}

class StubOpenAdapter implements IndexedEntryOpenAdapter {
  readonly openCalls: Array<{
    accessKey: string;
    relativePath: string;
  }> = [];

  readonly revealCalls: Array<{
    accessKey: string;
    relativePath: string;
  }> = [];

  constructor(readonly platform: LibrarySourcePlatform = 'tauri') {}

  async openEntry(accessKey: string, relativePath: string): Promise<void> {
    this.openCalls.push({
      accessKey,
      relativePath,
    });
  }

  async revealEntry(accessKey: string, relativePath: string): Promise<void> {
    this.revealCalls.push({
      accessKey,
      relativePath,
    });
  }
}

function createFixture(
  options: {
    entry?: FileEntry | null;
    source?: LibrarySource | null;
    preparerPlatform?: LibrarySourcePlatform;
    adapterPlatform?: LibrarySourcePlatform;
    onPrepare?: () => void;
  } = {},
) {
  const source =
    options.source === undefined
      ? createLibrarySource({
          id: 'tauri-directory:documents',
          platform: 'tauri',
          displayPath: '/home/karya/Documents',
        })
      : options.source;

  const entry =
    options.entry === undefined
      ? createFileEntry({
          id: 'entry-report',
          sourceId: 'tauri-directory:documents',
          name: 'report.pdf',
          relativePath: 'Reports/report.pdf',
          kind: 'file',
          availability: 'available',
        })
      : options.entry;

  const fileEntryRepository = new StubEntryRepository(entry);
  const librarySourceRepository = new StubSourceRepository(source);

  const sourceAccessPreparer = new StubAccessPreparer(options.preparerPlatform, options.onPrepare);

  const indexedEntryOpenAdapter = new StubOpenAdapter(options.adapterPlatform);

  const useCase = new OpenIndexedEntry({
    fileEntryRepository,
    librarySourceRepository,
    sourceAccessPreparer,
    indexedEntryOpenAdapter,
  });

  return {
    source,
    entry,
    fileEntryRepository,
    librarySourceRepository,
    sourceAccessPreparer,
    indexedEntryOpenAdapter,
    useCase,
  };
}

describe('OpenIndexedEntry', () => {
  it('opens an available indexed file using the default operation', async () => {
    const fixture = createFixture();

    const result = await fixture.useCase.execute({
      entryId: '  entry-report  ',
    });

    expect(fixture.fileEntryRepository.requestedIds).toEqual(['entry-report']);

    expect(fixture.librarySourceRepository.requestedIds).toEqual(['tauri-directory:documents']);

    expect(fixture.sourceAccessPreparer.preparedSources).toEqual([fixture.source]);

    expect(fixture.indexedEntryOpenAdapter.openCalls).toEqual([
      {
        accessKey: 'tauri-directory:documents',
        relativePath: 'Reports/report.pdf',
      },
    ]);

    expect(fixture.indexedEntryOpenAdapter.revealCalls).toEqual([]);

    expect(result).toEqual({
      operation: 'open',
      entry: fixture.entry,
      source: fixture.source,
    });
  });

  it('reveals an indexed directory in the operating-system file manager', async () => {
    const directory = createFileEntry({
      id: 'entry-projects',
      sourceId: 'tauri-directory:documents',
      name: 'Projects',
      relativePath: 'Projects',
      kind: 'directory',
      extension: null,
      mimeType: null,
      availability: 'available',
    });

    const fixture = createFixture({
      entry: directory,
    });

    const result = await fixture.useCase.execute({
      entryId: directory.id,
      operation: 'reveal',
    });

    expect(fixture.indexedEntryOpenAdapter.revealCalls).toEqual([
      {
        accessKey: 'tauri-directory:documents',
        relativePath: 'Projects',
      },
    ]);

    expect(fixture.indexedEntryOpenAdapter.openCalls).toEqual([]);

    expect(result.operation).toBe('reveal');
  });

  it('rejects an empty indexed entry identifier', async () => {
    const fixture = createFixture();

    await expect(
      fixture.useCase.execute({
        entryId: '   ',
      }),
    ).rejects.toThrow('An indexed entry identifier is required.');

    expect(fixture.fileEntryRepository.requestedIds).toEqual([]);
  });

  it('rejects an unsupported operation before loading metadata', async () => {
    const fixture = createFixture();

    await expect(
      fixture.useCase.execute({
        entryId: 'entry-report',
        operation: 'delete' as 'open',
      }),
    ).rejects.toThrow('Indexed entry operation must be either "open" or "reveal".');

    expect(fixture.fileEntryRepository.requestedIds).toEqual([]);
  });

  it('rejects an indexed entry that no longer exists', async () => {
    const fixture = createFixture({
      entry: null,
    });

    await expect(
      fixture.useCase.execute({
        entryId: 'missing-entry',
      }),
    ).rejects.toThrow('The selected indexed entry no longer exists.');

    expect(fixture.librarySourceRepository.requestedIds).toEqual([]);
  });

  it.each<FileAvailability>(['missing', 'permission-denied'])(
    'rejects an indexed entry whose availability is %s',
    async (availability) => {
      const entry = createFileEntry({
        id: `entry-${availability}`,
        sourceId: 'tauri-directory:documents',
        availability,
      });

      const fixture = createFixture({
        entry,
      });

      await expect(
        fixture.useCase.execute({
          entryId: entry.id,
        }),
      ).rejects.toThrow('The selected indexed entry is not currently available.');

      expect(fixture.librarySourceRepository.requestedIds).toEqual([]);

      expect(fixture.sourceAccessPreparer.preparedSources).toEqual([]);
    },
  );

  it('rejects an entry whose library source no longer exists', async () => {
    const fixture = createFixture({
      source: null,
    });

    await expect(
      fixture.useCase.execute({
        entryId: 'entry-report',
      }),
    ).rejects.toThrow('The library source containing the selected entry no longer exists.');

    expect(fixture.sourceAccessPreparer.preparedSources).toEqual([]);
  });

  it('rejects sources unsupported by the active native adapters', async () => {
    const browserSource = createLibrarySource({
      id: 'browser-source',
      platform: 'browser',
      displayPath: 'Browser Documents',
    });

    const browserEntry = createFileEntry({
      id: 'browser-entry',
      sourceId: browserSource.id,
      availability: 'available',
    });

    const fixture = createFixture({
      source: browserSource,
      entry: browserEntry,
    });

    await expect(
      fixture.useCase.execute({
        entryId: browserEntry.id,
      }),
    ).rejects.toThrow(
      'The selected indexed entry is not supported by the active file-system adapter.',
    );

    expect(fixture.sourceAccessPreparer.preparedSources).toEqual([]);

    expect(fixture.indexedEntryOpenAdapter.openCalls).toEqual([]);
  });

  it('stops before repository access when already cancelled', async () => {
    const controller = new AbortController();

    controller.abort();

    const fixture = createFixture();

    await expect(
      fixture.useCase.execute({
        entryId: 'entry-report',
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({
      name: 'AbortError',
    });

    expect(fixture.fileEntryRepository.requestedIds).toEqual([]);
  });

  it('does not invoke native operations when cancellation occurs during access preparation', async () => {
    const controller = new AbortController();

    const fixture = createFixture({
      onPrepare: () => {
        controller.abort();
      },
    });

    await expect(
      fixture.useCase.execute({
        entryId: 'entry-report',
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({
      name: 'AbortError',
    });

    expect(fixture.indexedEntryOpenAdapter.openCalls).toEqual([]);

    expect(fixture.indexedEntryOpenAdapter.revealCalls).toEqual([]);
  });
});
