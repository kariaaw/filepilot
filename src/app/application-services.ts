import {
  BuildIndexedFileEntry,
  ConnectLibrarySource,
  IndexLibrarySource,
  LibraryWorkspace,
} from '@/features/library/application';
import { IndexedDbFileEntryRepository } from '@/infrastructure/database/indexeddb/indexeddb-file-entry-repository';
import { IndexedDbLibraryIndexRepository } from '@/infrastructure/database/indexeddb/indexeddb-library-index-repository';
import { IndexedDbLibrarySourceRepository } from '@/infrastructure/database/indexeddb/indexeddb-library-source-repository';
import {
  TauriDirectoryScanAdapter,
  TauriDirectorySelectionAdapter,
  TauriLibrarySourceAccessPreparer,
  TauriNativePathRegistry,
} from '@/infrastructure/file-system/tauri';

/**
 * Application composition root.
 *
 * Concrete infrastructure dependencies are created only in this module.
 * Features and React components consume the resulting application services
 * through their portable interfaces.
 */
const librarySourceRepository = new IndexedDbLibrarySourceRepository();

const fileEntryRepository = new IndexedDbFileEntryRepository();

const libraryIndexRepository = new IndexedDbLibraryIndexRepository();

const nativePathRegistry = new TauriNativePathRegistry();

const directorySelectionAdapter = new TauriDirectorySelectionAdapter(undefined, nativePathRegistry);

const directoryScanAdapter = new TauriDirectoryScanAdapter(nativePathRegistry);

const sourceAccessPreparer = new TauriLibrarySourceAccessPreparer(nativePathRegistry);

const buildIndexedFileEntry = new BuildIndexedFileEntry();

const connectLibrarySource = new ConnectLibrarySource({
  directorySelectionAdapter,
  librarySourceRepository,
});

const indexLibrarySource = new IndexLibrarySource({
  librarySourceRepository,
  existingFileEntryRepository: fileEntryRepository,
  libraryIndexRepository,
  directoryScanAdapter,
  sourceAccessPreparer,
  buildIndexedFileEntry,
});

export const libraryWorkspace = new LibraryWorkspace({
  connectLibrarySource,
  indexLibrarySource,
  librarySourceRepository,
});
