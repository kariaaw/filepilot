/**
 * Public exports for Tauri-specific file-system infrastructure.
 */
export {
  createTauriDirectoryAccessKey,
  TauriDirectorySelectionAdapter,
  type TauriDirectorySelectionDependencies,
} from './tauri-directory-selection-adapter';

export {
  TauriDirectoryScanAdapter,
  type TauriDirectoryScanDependencies,
  type TauriNativeDirectoryEntry,
  type TauriNativeFileInfo,
} from './tauri-directory-scan-adapter';

export { TauriLibrarySourceAccessPreparer } from './tauri-library-source-access-preparer';

export { TauriNativePathRegistry } from './tauri-native-path-registry';

export {
  TauriIndexedEntryOpenAdapter,
  type NativeItemRevealer,
  type NativePathJoiner,
  type NativePathOpener,
  type TauriIndexedEntryOpenAdapterDependencies,
} from './tauri-indexed-entry-open-adapter';
