import { describe, expect, it } from 'vitest';

import type { LibrarySource } from '@/core/entities/library-source';
import {
  RemoveLibrarySource,
  type LibrarySourceAccessForgetter,
  type LibrarySourceIndexRemovalRepository,
  type LibrarySourceRemovalLookupRepository,
} from '@/features/library/application/remove-library-source';
import { createLibrarySource } from '@/test/factories';

class StubSourceRepository implements LibrarySourceRemovalLookupRepository {
  readonly requestedIds: string[] = [];

  constructor(private readonly source: LibrarySource | null) {}

  async getById(id: string): Promise<LibrarySource | null> {
    this.requestedIds.push(id);

    return this.source;
  }
}

class StubIndexRepository implements LibrarySourceIndexRemovalRepository {
  readonly deletedSourceIds: string[] = [];

  constructor(private readonly failure?: Error) {}

  async deleteSourceIndex(sourceId: string): Promise<void> {
    this.deletedSourceIds.push(sourceId);

    if (this.failure) {
      throw this.failure;
    }
  }
}

class StubSourceAccessForgetter implements LibrarySourceAccessForgetter {
  readonly forgottenAccessKeys: string[] = [];

  async forgetDirectory(accessKey: string): Promise<void> {
    this.forgottenAccessKeys.push(accessKey);
  }
}

describe('RemoveLibrarySource', () => {
  it('removes an existing source index and forgets its native access', async () => {
    const source = createLibrarySource({
      id: 'source-documents',
      name: 'Documents',
    });

    const sourceRepository = new StubSourceRepository(source);
    const indexRepository = new StubIndexRepository();
    const accessForgetter = new StubSourceAccessForgetter();

    const removeSource = new RemoveLibrarySource({
      librarySourceRepository: sourceRepository,
      libraryIndexRepository: indexRepository,
      sourceAccessForgetter: accessForgetter,
    });

    await expect(removeSource.execute('  source-documents  ')).resolves.toEqual({
      source,
    });

    expect(sourceRepository.requestedIds).toEqual(['source-documents']);
    expect(indexRepository.deletedSourceIds).toEqual(['source-documents']);
    expect(accessForgetter.forgottenAccessKeys).toEqual(['source-documents']);
  });

  it('rejects an empty source identifier before reading persistence', async () => {
    const sourceRepository = new StubSourceRepository(null);
    const indexRepository = new StubIndexRepository();
    const accessForgetter = new StubSourceAccessForgetter();

    const removeSource = new RemoveLibrarySource({
      librarySourceRepository: sourceRepository,
      libraryIndexRepository: indexRepository,
      sourceAccessForgetter: accessForgetter,
    });

    await expect(removeSource.execute('   ')).rejects.toThrow(
      'A library source identifier is required.',
    );

    expect(sourceRepository.requestedIds).toEqual([]);
    expect(indexRepository.deletedSourceIds).toEqual([]);
    expect(accessForgetter.forgottenAccessKeys).toEqual([]);
  });

  it('rejects a missing source without running deletion or access cleanup', async () => {
    const sourceRepository = new StubSourceRepository(null);
    const indexRepository = new StubIndexRepository();
    const accessForgetter = new StubSourceAccessForgetter();

    const removeSource = new RemoveLibrarySource({
      librarySourceRepository: sourceRepository,
      libraryIndexRepository: indexRepository,
      sourceAccessForgetter: accessForgetter,
    });

    await expect(removeSource.execute('missing-source')).rejects.toThrow(
      'The requested library source does not exist.',
    );

    expect(sourceRepository.requestedIds).toEqual(['missing-source']);
    expect(indexRepository.deletedSourceIds).toEqual([]);
    expect(accessForgetter.forgottenAccessKeys).toEqual([]);
  });

  it('does not forget native access when the deletion transaction fails', async () => {
    const source = createLibrarySource({
      id: 'source-documents',
    });

    const persistenceError = new Error('IndexedDB transaction failed.');
    const accessForgetter = new StubSourceAccessForgetter();

    const removeSource = new RemoveLibrarySource({
      librarySourceRepository: new StubSourceRepository(source),
      libraryIndexRepository: new StubIndexRepository(persistenceError),
      sourceAccessForgetter: accessForgetter,
    });

    await expect(removeSource.execute(source.id)).rejects.toThrow('IndexedDB transaction failed.');

    expect(accessForgetter.forgottenAccessKeys).toEqual([]);
  });
});
