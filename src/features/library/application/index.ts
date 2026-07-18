/**
 * Public exports for FilePilot library application workflows.
 */
export {
  ConnectLibrarySource,
  DEFAULT_LIBRARY_EXCLUDED_PATTERNS,
  type ConnectLibrarySourceDependencies,
  type ConnectLibrarySourceResult,
  type LibrarySourceConnectionRepository,
} from './connect-library-source';

export {
  BrowseLibraryDirectory,
  type BrowseLibraryDirectoryDependencies,
  type BrowseLibraryDirectoryInput,
  type BrowseLibraryDirectoryResult,
  type LibraryDirectoryBrowsingRepository,
} from './browse-library-directory';

export {
  LibraryWorkspace,
  type LibraryConnectionSnapshot,
  type LibraryDirectoryBrowsingWorkflow,
  type LibraryDuplicateAnalysisWorkflow,
  type LibraryIndexedEntryOpeningWorkflow,
  type LibraryIndexedEntrySearchWorkflow,
  type LibraryIndexedTextPreviewWorkflow,
  type LibraryRemovalSnapshot,
  type LibrarySourceConnectionWorkflow,
  type LibrarySourceListingRepository,
  type LibrarySourceRemovalWorkflow,
  type LibraryWorkspaceDependencies,
  type LibraryWorkspaceSnapshot,
} from './library-workspace';

export {
  BuildIndexedFileEntry,
  createStableFileEntryId,
  type BuildIndexedFileEntryDependencies,
  type BuildIndexedFileEntryInput,
  type FileEntryIdFactory,
} from './build-indexed-file-entry';

export {
  IndexLibrarySource,
  type ExistingFileEntryRepository,
  type IndexedFileEntryBuilder,
  type IndexLibrarySourceDependencies,
  type IndexLibrarySourceOptions,
  type IndexLibrarySourceResult,
  type LibraryIndexCommitRepository,
  type LibrarySourceAccessPreparer,
  type LibrarySourceIndexingRepository,
} from './index-library-source';

export {
  OpenIndexedEntry,
  type IndexedEntryAccessPreparer,
  type IndexedEntryOpeningRepository,
  type IndexedEntryOpenOperation,
  type IndexedEntrySourceRepository,
  type OpenIndexedEntryDependencies,
  type OpenIndexedEntryInput,
  type OpenIndexedEntryResult,
} from './open-indexed-entry';

export {
  SearchIndexedEntries,
  type IndexedEntrySearchRepository,
  type SearchIndexedEntriesDependencies,
  type SearchIndexedEntriesInput,
  type SearchIndexedEntriesResult,
} from './search-indexed-entries';

export {
  RemoveLibrarySource,
  type LibrarySourceAccessForgetter,
  type LibrarySourceIndexRemovalRepository,
  type LibrarySourceRemovalLookupRepository,
  type RemoveLibrarySourceDependencies,
  type RemoveLibrarySourceResult,
} from './remove-library-source';

export {
  DEFAULT_TEXT_PREVIEW_BYTES,
  MAXIMUM_TEXT_PREVIEW_BYTES,
  PreviewIndexedTextEntry,
  type IndexedTextPreviewAccessPreparer,
  type IndexedTextPreviewEntryRepository,
  type IndexedTextPreviewSourceRepository,
  type PreviewIndexedTextEntryDependencies,
  type PreviewIndexedTextEntryInput,
  type PreviewIndexedTextEntryResult,
} from './preview-indexed-text-entry';

export {
  AnalyzeDuplicateFiles,
  type AnalyzeDuplicateFilesDependencies,
  type AnalyzeDuplicateFilesOptions,
  type AnalyzeDuplicateFilesResult,
  type DuplicateAnalysisFileRepository,
  type DuplicateAnalysisPhase,
  type DuplicateAnalysisProgress,
  type DuplicateAnalysisSourceRepository,
  type DuplicateFileGroup,
} from './analyze-duplicate-files';
