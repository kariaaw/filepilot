import { ConnectLibrarySource, LibraryWorkspace } from '@/features/library/application';
import { IndexedDbLibrarySourceRepository } from '@/infrastructure/database/indexeddb/indexeddb-library-source-repository';
import { TauriDirectorySelectionAdapter } from '@/infrastructure/file-system/tauri';

/**
 * Application composition root.
 *
 * Concrete infrastructure dependencies are created only in this module.
 * Features and React components consume the resulting application services
 * through their portable interfaces.
 */
const librarySourceRepository = new IndexedDbLibrarySourceRepository();

const directorySelectionAdapter = new TauriDirectorySelectionAdapter();

const connectLibrarySource = new ConnectLibrarySource({
  directorySelectionAdapter,
  librarySourceRepository,
});

export const libraryWorkspace = new LibraryWorkspace({
  connectLibrarySource,
  librarySourceRepository,
});
