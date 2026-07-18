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

export {
  MAXIMUM_NATIVE_PREVIEW_BYTES,
  TauriIndexedEntryContentAdapter,
  type NativeContentPathJoiner,
  type NativeEntryByteReader,
  type TauriIndexedEntryContentAdapterDependencies,
  type TauriReadLibraryEntryResponse,
} from './tauri-indexed-entry-content-adapter';

export {
  TauriIndexedEntryHashAdapter,
  type NativeEntryHasher,
  type NativeHashPathJoiner,
  type TauriHashLibraryEntryResponse,
  type TauriIndexedEntryHashAdapterDependencies,
} from './tauri-indexed-entry-hash-adapter';
