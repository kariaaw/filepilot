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
