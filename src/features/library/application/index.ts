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
  LibraryWorkspace,
  type LibraryConnectionSnapshot,
  type LibrarySourceConnectionWorkflow,
  type LibrarySourceListingRepository,
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
