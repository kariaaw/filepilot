/**
 * Public exports for Tauri-specific file-system infrastructure.
 */
export {
  createTauriDirectoryAccessKey,
  TauriDirectorySelectionAdapter,
  type TauriDirectorySelectionDependencies,
} from './tauri-directory-selection-adapter';

export { TauriNativePathRegistry } from './tauri-native-path-registry';
