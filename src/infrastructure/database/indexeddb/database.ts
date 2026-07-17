import { Dexie, type EntityTable } from 'dexie';

import type {
  FileEntryRecord,
  LibrarySourceRecord,
} from '@/infrastructure/database/indexeddb/records';

/**
 * Stable browser database name used by FilePilot.
 *
 * Changing this value would create a separate IndexedDB database and make
 * previously indexed libraries appear missing, so it must remain stable.
 */
export const FILEPILOT_DATABASE_NAME = 'filepilot-local';

/**
 * Current IndexedDB schema version.
 *
 * Future schema changes must increment this number and use Dexie's
 * migration API instead of silently modifying an existing version.
 */
export const FILEPILOT_DATABASE_VERSION = 1;

/**
 * Typed IndexedDB database used by the browser version of FilePilot.
 *
 * Only persistence records are stored here. Domain entities are converted
 * at repository boundaries so infrastructure-specific fields never leak
 * into application services.
 */
export class FilePilotDatabase extends Dexie {
  /**
   * User-selected root folders and their scan configuration.
   */
  librarySources!: EntityTable<LibrarySourceRecord, 'id'>;

  /**
   * Files and directories discovered inside registered library sources.
   */
  fileEntries!: EntityTable<FileEntryRecord, 'id'>;

  constructor(databaseName = FILEPILOT_DATABASE_NAME) {
    super(databaseName);

    this.version(FILEPILOT_DATABASE_VERSION).stores({
      /*
       * Only fields used by repository queries are indexed.
       *
       * Boolean fields such as includeHiddenFiles are deliberately omitted
       * because IndexedDB does not support booleans as valid index keys.
       */
      librarySources: [
        'id',
        'normalizedName',
        'normalizedDisplayPath',
        'platform',
        'access',
        'syncMode',
        'addedAtMs',
        'updatedAtMs',
        'lastScannedAtMs',
      ].join(', '),

      /*
       * Compound indexes accelerate the most common FilePilot operations:
       *
       * - Browsing one directory inside a selected source
       * - Locating a file by its portable relative path
       * - Detecting duplicate hashes within a library
       * - Filtering categories inside a particular source
       *
       * The tags field uses a multi-entry index so every tag can be queried
       * independently without duplicating the complete file record.
       */
      fileEntries: [
        'id',
        'sourceId',
        'parentKey',
        '[sourceId+parentKey]',
        '[sourceId+normalizedRelativePath]',
        '[sourceId+hashValue]',
        '[sourceId+category]',
        'normalizedName',
        'normalizedRelativePath',
        'kind',
        'category',
        'extension',
        'mimeType',
        'sizeBytes',
        'createdAtMs',
        'modifiedAtMs',
        'indexedAtMs',
        'availability',
        'securityLevel',
        'hashValue',
        '*tags',
      ].join(', '),
    });
  }
}

/**
 * Shared database instance used by browser persistence adapters.
 *
 * Keeping creation in one module prevents accidental duplicate connections
 * and gives future tests the option to construct isolated database instances.
 */
export const filePilotDatabase = new FilePilotDatabase();
