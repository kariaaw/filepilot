import {
  BrowseLibraryDirectory,
  BuildIndexedFileEntry,
  ConnectLibrarySource,
  IndexLibrarySource,
  LibraryWorkspace,
  OpenIndexedEntry,
  RemoveLibrarySource,
  SearchIndexedEntries,
} from '@/features/library/application';
import { IndexedDbFileEntryRepository } from '@/infrastructure/database/indexeddb/indexeddb-file-entry-repository';
import { IndexedDbLibraryIndexRepository } from '@/infrastructure/database/indexeddb/indexeddb-library-index-repository';
import { IndexedDbLibrarySourceRepository } from '@/infrastructure/database/indexeddb/indexeddb-library-source-repository';
import {
  TauriDirectoryScanAdapter,
  TauriDirectorySelectionAdapter,
  TauriIndexedEntryOpenAdapter,
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

const indexedEntryOpenAdapter = new TauriIndexedEntryOpenAdapter(nativePathRegistry);

const openIndexedEntry = new OpenIndexedEntry({
  fileEntryRepository,
  librarySourceRepository,
  sourceAccessPreparer,
  indexedEntryOpenAdapter,
});

const buildIndexedFileEntry = new BuildIndexedFileEntry();

const connectLibrarySource = new ConnectLibrarySource({
  directorySelectionAdapter,
  librarySourceRepository,
});

const browseLibraryDirectory = new BrowseLibraryDirectory({
  fileEntryRepository,
});

const searchIndexedEntries = new SearchIndexedEntries({
  fileEntryRepository,
});

const indexLibrarySource = new IndexLibrarySource({
  librarySourceRepository,
  existingFileEntryRepository: fileEntryRepository,
  libraryIndexRepository,
  directoryScanAdapter,
  sourceAccessPreparer,
  buildIndexedFileEntry,
});

const removeLibrarySource = new RemoveLibrarySource({
  librarySourceRepository,
  libraryIndexRepository,
  sourceAccessForgetter: directorySelectionAdapter,
});

export const libraryWorkspace = new LibraryWorkspace({
  browseLibraryDirectory,
  connectLibrarySource,
  indexLibrarySource,
  librarySourceRepository,
  searchIndexedEntries,
  openIndexedEntry,
  removeLibrarySource,
});
