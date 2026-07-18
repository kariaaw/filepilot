import { describe, expect, it } from 'vitest';

import type { FileAvailability, FileEntry } from '@/core/entities/file-entry';
import type { LibrarySource, LibrarySourcePlatform } from '@/core/entities/library-source';
import type {
  IndexedEntryContentAdapter,
  IndexedEntryContentReadResult,
} from '@/core/ports/file-system-adapter';
import {
  DEFAULT_TEXT_PREVIEW_BYTES,
  MAXIMUM_TEXT_PREVIEW_BYTES,
  PreviewIndexedTextEntry,
  type IndexedTextPreviewAccessPreparer,
  type IndexedTextPreviewEntryRepository,
  type IndexedTextPreviewSourceRepository,
} from '@/features/library/application/preview-indexed-text-entry';
import { createFileEntry, createLibrarySource } from '@/test/factories';

class StubEntryRepository implements IndexedTextPreviewEntryRepository {
  readonly requestedIds: string[] = [];

  constructor(private readonly entry: FileEntry | null) {}

  async getById(id: string): Promise<FileEntry | null> {
    this.requestedIds.push(id);

    return this.entry?.id === id ? this.entry : null;
  }
}

class StubSourceRepository implements IndexedTextPreviewSourceRepository {
  readonly requestedIds: string[] = [];

  constructor(private readonly source: LibrarySource | null) {}

  async getById(id: string): Promise<LibrarySource | null> {
    this.requestedIds.push(id);

    return this.source?.id === id ? this.source : null;
  }
}

class StubAccessPreparer implements IndexedTextPreviewAccessPreparer {
  readonly preparedSources: LibrarySource[] = [];

  constructor(
    readonly platform: LibrarySourcePlatform = 'tauri',
    private readonly onPrepare?: () => void,
  ) {}

  async prepareSource(source: LibrarySource, signal?: AbortSignal): Promise<void> {
    this.preparedSources.push(source);
    this.onPrepare?.();

    if (signal?.aborted) {
      const error = new Error('Access preparation was cancelled.');

      error.name = 'AbortError';

      throw error;
    }
  }
}

class StubContentAdapter implements IndexedEntryContentAdapter {
  readonly readCalls: Array<{
    accessKey: string;
    relativePath: string;
    maximumBytes: number;
  }> = [];

  constructor(
    readonly platform: LibrarySourcePlatform = 'tauri',
    private readonly result: IndexedEntryContentReadResult = {
      bytes: new TextEncoder().encode('FilePilot preview').buffer,
      truncated: false,
    },
  ) {}

  async readEntry(
    accessKey: string,
    relativePath: string,
    maximumBytes: number,
  ): Promise<IndexedEntryContentReadResult> {
    this.readCalls.push({
      accessKey,
      relativePath,
      maximumBytes,
    });

    return this.result;
  }
}

function createFixture(
  options: {
    entry?: FileEntry | null;
    source?: LibrarySource | null;
    preparerPlatform?: LibrarySourcePlatform;
    adapterPlatform?: LibrarySourcePlatform;
    content?: IndexedEntryContentReadResult;
    onPrepare?: () => void;
  } = {},
) {
  const source =
    options.source === undefined
      ? createLibrarySource({
          id: 'source-documents',
          platform: 'tauri',
          displayPath: '/home/karya/Documents',
        })
      : options.source;

  const entry =
    options.entry === undefined
      ? createFileEntry({
          id: 'entry-notes',
          sourceId: 'source-documents',
          name: 'notes.txt',
          relativePath: 'Notes/notes.txt',
          extension: 'txt',
          mimeType: 'text/plain',
          category: 'text',
          kind: 'file',
          availability: 'available',
        })
      : options.entry;

  const fileEntryRepository = new StubEntryRepository(entry);
  const librarySourceRepository = new StubSourceRepository(source);

  const sourceAccessPreparer = new StubAccessPreparer(options.preparerPlatform, options.onPrepare);

  const indexedEntryContentAdapter = new StubContentAdapter(
    options.adapterPlatform,
    options.content,
  );

  const useCase = new PreviewIndexedTextEntry({
    fileEntryRepository,
    librarySourceRepository,
    sourceAccessPreparer,
    indexedEntryContentAdapter,
  });

  return {
    source,
    entry,
    fileEntryRepository,
    librarySourceRepository,
    sourceAccessPreparer,
    indexedEntryContentAdapter,
    useCase,
  };
}

describe('PreviewIndexedTextEntry', () => {
  it('loads a bounded UTF-8 preview for an available text file', async () => {
    const fixture = createFixture();

    const result = await fixture.useCase.execute({
      entryId: '  entry-notes  ',
    });

    expect(fixture.fileEntryRepository.requestedIds).toEqual(['entry-notes']);

    expect(fixture.librarySourceRepository.requestedIds).toEqual(['source-documents']);

    expect(fixture.sourceAccessPreparer.preparedSources).toEqual([fixture.source]);

    expect(fixture.indexedEntryContentAdapter.readCalls).toEqual([
      {
        accessKey: 'source-documents',
        relativePath: 'Notes/notes.txt',
        maximumBytes: DEFAULT_TEXT_PREVIEW_BYTES,
      },
    ]);

    expect(result).toEqual({
      entry: fixture.entry,
      source: fixture.source,
      text: 'FilePilot preview',
      bytesRead: 17,
      maximumBytes: DEFAULT_TEXT_PREVIEW_BYTES,
      truncated: false,
    });
  });

  it('supports code files and a caller-provided byte limit', async () => {
    const codeEntry = createFileEntry({
      id: 'entry-config',
      sourceId: 'source-documents',
      name: 'config.json',
      relativePath: 'config.json',
      extension: 'json',
      mimeType: 'application/json',
      category: 'code',
      kind: 'file',
      availability: 'available',
    });

    const fixture = createFixture({
      entry: codeEntry,
      content: {
        bytes: new TextEncoder().encode('{"enabled":true}').buffer,
        truncated: false,
      },
    });

    const result = await fixture.useCase.execute({
      entryId: codeEntry.id,
      maximumBytes: 4_096,
    });

    expect(result.text).toBe('{"enabled":true}');
    expect(result.maximumBytes).toBe(4_096);

    expect(fixture.indexedEntryContentAdapter.readCalls[0]?.maximumBytes).toBe(4_096);
  });

  it('preserves the native truncation state', async () => {
    const fixture = createFixture({
      content: {
        bytes: new TextEncoder().encode('Partial content').buffer,
        truncated: true,
      },
    });

    const result = await fixture.useCase.execute({
      entryId: 'entry-notes',
    });

    expect(result.text).toBe('Partial content');
    expect(result.truncated).toBe(true);
  });

  it('rejects empty entry identifiers before repository access', async () => {
    const fixture = createFixture();

    await expect(
      fixture.useCase.execute({
        entryId: '   ',
      }),
    ).rejects.toThrow('An indexed entry identifier is required for preview.');

    expect(fixture.fileEntryRepository.requestedIds).toEqual([]);
  });

  it('rejects invalid preview byte limits before repository access', async () => {
    for (const maximumBytes of [0, -1, 1.5, MAXIMUM_TEXT_PREVIEW_BYTES + 1]) {
      const fixture = createFixture();

      await expect(
        fixture.useCase.execute({
          entryId: 'entry-notes',
          maximumBytes,
        }),
      ).rejects.toThrow(
        `Text preview size must be an integer between 1 and ${MAXIMUM_TEXT_PREVIEW_BYTES} bytes.`,
      );

      expect(fixture.fileEntryRepository.requestedIds).toEqual([]);
    }
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

  it('rejects indexed directories', async () => {
    const directory = createFileEntry({
      id: 'entry-folder',
      sourceId: 'source-documents',
      name: 'Notes',
      relativePath: 'Notes',
      extension: null,
      mimeType: null,
      category: 'other',
      kind: 'directory',
      availability: 'available',
    });

    const fixture = createFixture({
      entry: directory,
    });

    await expect(
      fixture.useCase.execute({
        entryId: directory.id,
      }),
    ).rejects.toThrow('Only indexed files can be previewed.');

    expect(fixture.librarySourceRepository.requestedIds).toEqual([]);
  });

  it.each<FileAvailability>(['missing', 'permission-denied'])(
    'rejects an indexed file whose availability is %s',
    async (availability) => {
      const entry = createFileEntry({
        id: `entry-${availability}`,
        sourceId: 'source-documents',
        name: 'notes.txt',
        relativePath: 'notes.txt',
        extension: 'txt',
        mimeType: 'text/plain',
        category: 'text',
        kind: 'file',
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
    },
  );

  it('rejects non-text file categories', async () => {
    const documentEntry = createFileEntry({
      id: 'entry-report',
      sourceId: 'source-documents',
      name: 'report.pdf',
      relativePath: 'report.pdf',
      extension: 'pdf',
      mimeType: 'application/pdf',
      category: 'document',
      kind: 'file',
      availability: 'available',
    });

    const fixture = createFixture({
      entry: documentEntry,
    });

    await expect(
      fixture.useCase.execute({
        entryId: documentEntry.id,
      }),
    ).rejects.toThrow('Only indexed text and code files can be previewed.');

    expect(fixture.librarySourceRepository.requestedIds).toEqual([]);
  });

  it('rejects an entry whose source no longer exists', async () => {
    const fixture = createFixture({
      source: null,
    });

    await expect(
      fixture.useCase.execute({
        entryId: 'entry-notes',
      }),
    ).rejects.toThrow('The library source containing the selected entry no longer exists.');

    expect(fixture.sourceAccessPreparer.preparedSources).toEqual([]);
    expect(fixture.indexedEntryContentAdapter.readCalls).toEqual([]);
  });

  it('rejects sources unsupported by the active content adapter', async () => {
    const browserSource = createLibrarySource({
      id: 'browser-source',
      platform: 'browser',
      displayPath: 'Browser Documents',
    });

    const browserEntry = createFileEntry({
      id: 'browser-entry',
      sourceId: browserSource.id,
      name: 'notes.txt',
      relativePath: 'notes.txt',
      extension: 'txt',
      mimeType: 'text/plain',
      category: 'text',
      kind: 'file',
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
    ).rejects.toThrow('The selected indexed entry is not supported by the active content adapter.');

    expect(fixture.sourceAccessPreparer.preparedSources).toEqual([]);
    expect(fixture.indexedEntryContentAdapter.readCalls).toEqual([]);
  });

  it('accepts an incomplete final UTF-8 character in a truncated preview', async () => {
    const fixture = createFixture({
      content: {
        /*
         * The Euro sign requires three UTF-8 bytes. This preview ends after
         * only its first two bytes, following one complete ASCII character.
         */
        bytes: new Uint8Array([0x41, 0xe2, 0x82]).buffer,
        truncated: true,
      },
    });

    const result = await fixture.useCase.execute({
      entryId: 'entry-notes',
    });

    expect(result.text).toBe('A');
    expect(result.bytesRead).toBe(3);
    expect(result.truncated).toBe(true);
  });

  it('still rejects invalid UTF-8 inside a truncated preview', async () => {
    const fixture = createFixture({
      content: {
        bytes: new Uint8Array([0x41, 0xff, 0x42, 0xe2, 0x82]).buffer,
        truncated: true,
      },
    });

    await expect(
      fixture.useCase.execute({
        entryId: 'entry-notes',
      }),
    ).rejects.toThrow('The selected file is not valid UTF-8 text and cannot be previewed safely.');
  });

  it('rejects invalid UTF-8 content', async () => {
    const fixture = createFixture({
      content: {
        bytes: new Uint8Array([0xff, 0xfe, 0xfd]).buffer,
        truncated: false,
      },
    });

    await expect(
      fixture.useCase.execute({
        entryId: 'entry-notes',
      }),
    ).rejects.toThrow('The selected file is not valid UTF-8 text and cannot be previewed safely.');
  });

  it('rejects content containing binary null bytes', async () => {
    const fixture = createFixture({
      content: {
        bytes: new Uint8Array([70, 105, 108, 101, 0, 80, 105, 108, 111, 116]).buffer,
        truncated: false,
      },
    });

    await expect(
      fixture.useCase.execute({
        entryId: 'entry-notes',
      }),
    ).rejects.toThrow(
      'The selected file appears to contain binary data and cannot be previewed as text.',
    );
  });

  it('stops before repository access when already cancelled', async () => {
    const controller = new AbortController();

    controller.abort();

    const fixture = createFixture();

    await expect(
      fixture.useCase.execute({
        entryId: 'entry-notes',
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({
      name: 'AbortError',
    });

    expect(fixture.fileEntryRepository.requestedIds).toEqual([]);
  });

  it('does not read bytes when cancelled during access preparation', async () => {
    const controller = new AbortController();

    const fixture = createFixture({
      onPrepare: () => {
        controller.abort();
      },
    });

    await expect(
      fixture.useCase.execute({
        entryId: 'entry-notes',
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({
      name: 'AbortError',
    });

    expect(fixture.indexedEntryContentAdapter.readCalls).toEqual([]);
  });
});
