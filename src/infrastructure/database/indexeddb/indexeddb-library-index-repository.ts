import type { FileEntry } from '@/core/entities/file-entry';
import type { LibrarySource } from '@/core/entities/library-source';
import type { LibraryIndexRepository } from '@/core/ports/library-index-repository';
import {
  filePilotDatabase,
  type FilePilotDatabase,
} from '@/infrastructure/database/indexeddb/database';
import {
  toFileEntryRecord,
  toLibrarySourceRecord,
} from '@/infrastructure/database/indexeddb/records';

/**
 * IndexedDB transaction that commits a completed source scan.
 *
 * File records and LibrarySource statistics share one Dexie transaction so
 * consumers never observe a new index paired with stale source metadata.
 */
export class IndexedDbLibraryIndexRepository implements LibraryIndexRepository {
  constructor(private readonly database: FilePilotDatabase = filePilotDatabase) {}

  async replaceSourceIndex(source: LibrarySource, entries: readonly FileEntry[]): Promise<void> {
    /*
     * Validate and convert every entity before opening the transaction.
     * Invalid scan output therefore cannot remove the existing index.
     */
    const sourceRecord = toLibrarySourceRecord(source);

    if (entries.some((entry) => entry.sourceId !== sourceRecord.id)) {
      throw new Error('Every indexed entry must belong to the committed library source.');
    }

    const entryRecords = entries.map((entry) => toFileEntryRecord(entry));

    await this.database.transaction(
      'rw',
      this.database.fileEntries,
      this.database.librarySources,
      async () => {
        await this.database.fileEntries.where('sourceId').equals(sourceRecord.id).delete();

        if (entryRecords.length > 0) {
          await this.database.fileEntries.bulkPut(entryRecords);
        }

        await this.database.librarySources.put(sourceRecord);
      },
    );
  }
}
