import { parseFileEntry, type FileEntry } from '@/core/entities/file-entry';
import { parseLibrarySource, type LibrarySource } from '@/core/entities/library-source';

/**
 * Fixed timestamps keep tests deterministic across different machines,
 * locales, and execution times.
 */
const TEST_TIMESTAMP_MS = 1_700_000_000_000;

/**
 * Creates a valid FileEntry for unit and repository tests.
 *
 * Each test can override only the properties relevant to its scenario,
 * which keeps test cases focused and readable.
 */
export function createFileEntry(overrides: Partial<FileEntry> = {}): FileEntry {
  const entry: FileEntry = {
    id: 'entry-1',
    sourceId: 'source-1',
    parentId: null,
    name: 'example.pdf',
    extension: 'pdf',
    relativePath: 'example.pdf',
    kind: 'file',
    mimeType: 'application/pdf',
    category: 'document',
    sizeBytes: 1_024,
    createdAtMs: TEST_TIMESTAMP_MS,
    modifiedAtMs: TEST_TIMESTAMP_MS,
    indexedAtMs: TEST_TIMESTAMP_MS,
    lastSeenAtMs: TEST_TIMESTAMP_MS,
    availability: 'available',
    securityLevel: 'standard',
    contentHash: null,
    tags: ['document', 'example'],
    ...overrides,
  };

  return parseFileEntry(entry);
}

/**
 * Allows individual statistics fields to be overridden without requiring
 * every test to repeat the complete statistics object.
 */
type LibrarySourceOverrides = Omit<Partial<LibrarySource>, 'statistics'> & {
  statistics?: Partial<LibrarySource['statistics']>;
};

/**
 * Creates a valid LibrarySource for unit and repository tests.
 */
export function createLibrarySource(overrides: LibrarySourceOverrides = {}): LibrarySource {
  const defaultStatistics: LibrarySource['statistics'] = {
    fileCount: 10,
    directoryCount: 2,
    totalSizeBytes: 8_192,
  };

  /*
   * Statistics must be separated from the remaining overrides.
   *
   * Spreading a partial statistics object over the complete source object
   * would allow required fields such as fileCount to become undefined.
   */
  const { statistics: statisticsOverrides, ...sourceOverrides } = overrides;

  const source: LibrarySource = {
    id: 'source-1',
    name: 'Documents',
    platform: 'browser',
    displayPath: 'Documents',
    access: 'available',
    syncMode: 'manual',
    includeHiddenFiles: false,
    excludedPatterns: ['node_modules', '.git'],
    addedAtMs: TEST_TIMESTAMP_MS,
    lastScannedAtMs: null,
    updatedAtMs: TEST_TIMESTAMP_MS,

    ...sourceOverrides,

    statistics: {
      ...defaultStatistics,
      ...statisticsOverrides,
    },
  };

  return parseLibrarySource(source);
}
