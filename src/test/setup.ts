/**
 * Installs an in-memory IndexedDB implementation inside Node.js.
 *
 * This allows Dexie repositories to be tested without opening or modifying
 * the user's real browser database.
 */
import 'fake-indexeddb/auto';
