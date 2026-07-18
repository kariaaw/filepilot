/**
 * Public exports for the Library presentation layer.
 */
export { useLibraryWorkspace, type LibraryWorkspaceViewState } from './use-library-workspace';

export {
  useIndexedFileBrowser,
  type IndexedFileBrowserViewState,
} from './use-indexed-file-browser';

export {
  useIndexedEntrySearch,
  type IndexedEntrySearchViewState,
} from './use-indexed-entry-search';

export {
  useIndexedEntryOperations,
  type IndexedEntryOperationViewState,
} from './use-indexed-entry-operations';

export {
  useIndexedTextPreview,
  type IndexedTextPreviewViewState,
} from './use-indexed-text-preview';

export { useDuplicateAnalysis, type DuplicateAnalysisViewState } from './use-duplicate-analysis';
