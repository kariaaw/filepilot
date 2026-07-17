import { describe, expect, it } from 'vitest';

import type { DiscoveredFileSystemEntry } from '@/core/ports/file-system-adapter';
import {
  TauriDirectoryScanAdapter,
  type TauriDirectoryScanDependencies,
  type TauriNativeDirectoryEntry,
  type TauriNativeFileInfo,
} from '@/infrastructure/file-system/tauri/tauri-directory-scan-adapter';
import { TauriNativePathRegistry } from '@/infrastructure/file-system/tauri/tauri-native-path-registry';

interface NativeFileSystemFixture {
  directories: Readonly<Record<string, readonly TauriNativeDirectoryEntry[]>>;
  metadata: Readonly<Record<string, TauriNativeFileInfo>>;
}

const DEFAULT_OPTIONS = {
  includeHiddenFiles: false,
  excludedPatterns: [],
} as const;

function createDependencies(fixture: NativeFileSystemFixture): TauriDirectoryScanDependencies {
  return {
    async readDirectory(nativePath) {
      const entries = fixture.directories[nativePath];

      if (!entries) {
        throw new Error(`Missing directory fixture for ${nativePath}`);
      }

      return entries;
    },

    async readMetadata(nativePath) {
      const metadata = fixture.metadata[nativePath];

      if (!metadata) {
        throw new Error(`Missing metadata fixture for ${nativePath}`);
      }

      return metadata;
    },

    async joinPath(...segments) {
      return segments.join('/').replace(/\/{2,}/g, '/');
    },
  };
}

function createRegistry(): TauriNativePathRegistry {
  const registry = new TauriNativePathRegistry();

  registry.register('tauri-directory:documents', '/home/karya/Documents');

  return registry;
}

function fileEntry(name: string): TauriNativeDirectoryEntry {
  return {
    name,
    isDirectory: false,
    isFile: true,
    isSymlink: false,
  };
}

function directoryEntry(name: string): TauriNativeDirectoryEntry {
  return {
    name,
    isDirectory: true,
    isFile: false,
    isSymlink: false,
  };
}

function symlinkEntry(name: string): TauriNativeDirectoryEntry {
  return {
    name,
    isDirectory: false,
    isFile: false,
    isSymlink: true,
  };
}

function fileInfo(overrides: Partial<TauriNativeFileInfo> = {}): TauriNativeFileInfo {
  return {
    isDirectory: false,
    isFile: true,
    isSymlink: false,
    size: 100,
    mtime: new Date(2_000),
    birthtime: new Date(1_000),
    ...overrides,
  };
}

function directoryInfo(): TauriNativeFileInfo {
  return {
    isDirectory: true,
    isFile: false,
    isSymlink: false,
    size: 4_096,
    mtime: new Date(2_000),
    birthtime: new Date(1_000),
  };
}

async function collectEntries(
  entries: AsyncIterable<DiscoveredFileSystemEntry>,
): Promise<DiscoveredFileSystemEntry[]> {
  const collectedEntries: DiscoveredFileSystemEntry[] = [];

  for await (const entry of entries) {
    collectedEntries.push(entry);
  }

  return collectedEntries;
}

describe('TauriDirectoryScanAdapter', () => {
  it('identifies itself as the Tauri platform adapter', () => {
    const adapter = new TauriDirectoryScanAdapter(
      createRegistry(),
      createDependencies({
        directories: {
          '/home/karya/Documents': [],
        },
        metadata: {},
      }),
    );

    expect(adapter.platform).toBe('tauri');
  });

  it('rejects scans whose native path is not registered', async () => {
    const adapter = new TauriDirectoryScanAdapter(
      new TauriNativePathRegistry(),
      createDependencies({
        directories: {},
        metadata: {},
      }),
    );

    await expect(
      collectEntries(adapter.scanDirectory('tauri-directory:missing', DEFAULT_OPTIONS)),
    ).rejects.toThrow(
      'No native directory path is registered for access key "tauri-directory:missing".',
    );
  });

  it('discovers sorted root entries with portable metadata', async () => {
    const adapter = new TauriDirectoryScanAdapter(
      createRegistry(),
      createDependencies({
        directories: {
          '/home/karya/Documents': [
            fileEntry('report.pdf'),
            directoryEntry('Archives'),
            fileEntry('photo.JPG'),
          ],
          '/home/karya/Documents/Archives': [],
        },
        metadata: {
          '/home/karya/Documents/Archives': directoryInfo(),
          '/home/karya/Documents/photo.JPG': fileInfo({
            size: 2_048,
          }),
          '/home/karya/Documents/report.pdf': fileInfo({
            size: 4_096,
          }),
        },
      }),
    );

    const entries = await collectEntries(
      adapter.scanDirectory('tauri-directory:documents', {
        ...DEFAULT_OPTIONS,
        maximumDepth: 0,
      }),
    );

    expect(entries).toEqual([
      {
        name: 'Archives',
        relativePath: 'Archives',
        kind: 'directory',
        extension: null,
        mimeType: null,
        category: 'other',
        sizeBytes: 0,
        createdAtMs: 1_000,
        modifiedAtMs: 2_000,
      },
      {
        name: 'photo.JPG',
        relativePath: 'photo.JPG',
        kind: 'file',
        extension: 'jpg',
        mimeType: 'image/jpeg',
        category: 'image',
        sizeBytes: 2_048,
        createdAtMs: 1_000,
        modifiedAtMs: 2_000,
      },
      {
        name: 'report.pdf',
        relativePath: 'report.pdf',
        kind: 'file',
        extension: 'pdf',
        mimeType: 'application/pdf',
        category: 'document',
        sizeBytes: 4_096,
        createdAtMs: 1_000,
        modifiedAtMs: 2_000,
      },
    ]);
  });

  it('recursively scans nested directories with normalized paths', async () => {
    const adapter = new TauriDirectoryScanAdapter(
      createRegistry(),
      createDependencies({
        directories: {
          '/home/karya/Documents': [directoryEntry('Projects')],
          '/home/karya/Documents/Projects': [directoryEntry('FilePilot')],
          '/home/karya/Documents/Projects/FilePilot': [fileEntry('README.md')],
        },
        metadata: {
          '/home/karya/Documents/Projects': directoryInfo(),
          '/home/karya/Documents/Projects/FilePilot': directoryInfo(),
          '/home/karya/Documents/Projects/FilePilot/README.md': fileInfo({
            size: 512,
          }),
        },
      }),
    );

    const entries = await collectEntries(
      adapter.scanDirectory('tauri-directory:documents', DEFAULT_OPTIONS),
    );

    expect(entries.map((entry) => entry.relativePath)).toEqual([
      'Projects',
      'Projects/FilePilot',
      'Projects/FilePilot/README.md',
    ]);

    expect(entries[entries.length - 1]).toMatchObject({
      extension: 'md',
      mimeType: 'text/markdown',
      category: 'text',
      sizeBytes: 512,
    });
  });

  it('skips hidden entries unless they are explicitly enabled', async () => {
    const fixture: NativeFileSystemFixture = {
      directories: {
        '/home/karya/Documents': [
          directoryEntry('.private'),
          fileEntry('.env'),
          fileEntry('visible.txt'),
        ],
        '/home/karya/Documents/.private': [],
      },
      metadata: {
        '/home/karya/Documents/.private': directoryInfo(),
        '/home/karya/Documents/.env': fileInfo(),
        '/home/karya/Documents/visible.txt': fileInfo(),
      },
    };

    const adapter = new TauriDirectoryScanAdapter(createRegistry(), createDependencies(fixture));

    const hiddenDisabled = await collectEntries(
      adapter.scanDirectory('tauri-directory:documents', DEFAULT_OPTIONS),
    );

    const hiddenEnabled = await collectEntries(
      adapter.scanDirectory('tauri-directory:documents', {
        ...DEFAULT_OPTIONS,
        includeHiddenFiles: true,
      }),
    );

    expect(hiddenDisabled.map((entry) => entry.name)).toEqual(['visible.txt']);

    expect(hiddenEnabled.map((entry) => entry.name)).toEqual(['.env', '.private', 'visible.txt']);
  });

  it('skips excluded directory names at every depth', async () => {
    const adapter = new TauriDirectoryScanAdapter(
      createRegistry(),
      createDependencies({
        directories: {
          '/home/karya/Documents': [directoryEntry('Projects'), directoryEntry('node_modules')],
          '/home/karya/Documents/Projects': [
            directoryEntry('node_modules'),
            fileEntry('source.ts'),
          ],
        },
        metadata: {
          '/home/karya/Documents/Projects': directoryInfo(),
          '/home/karya/Documents/Projects/source.ts': fileInfo(),
        },
      }),
    );

    const entries = await collectEntries(
      adapter.scanDirectory('tauri-directory:documents', {
        ...DEFAULT_OPTIONS,
        excludedPatterns: ['node_modules'],
      }),
    );

    expect(entries.map((entry) => entry.relativePath)).toEqual(['Projects', 'Projects/source.ts']);
  });

  it('respects the configured maximum traversal depth', async () => {
    const adapter = new TauriDirectoryScanAdapter(
      createRegistry(),
      createDependencies({
        directories: {
          '/home/karya/Documents': [directoryEntry('LevelOne')],
          '/home/karya/Documents/LevelOne': [directoryEntry('LevelTwo'), fileEntry('first.txt')],
          '/home/karya/Documents/LevelOne/LevelTwo': [fileEntry('second.txt')],
        },
        metadata: {
          '/home/karya/Documents/LevelOne': directoryInfo(),
          '/home/karya/Documents/LevelOne/LevelTwo': directoryInfo(),
          '/home/karya/Documents/LevelOne/first.txt': fileInfo(),
          '/home/karya/Documents/LevelOne/LevelTwo/second.txt': fileInfo(),
        },
      }),
    );

    const entries = await collectEntries(
      adapter.scanDirectory('tauri-directory:documents', {
        ...DEFAULT_OPTIONS,
        maximumDepth: 1,
      }),
    );

    expect(entries.map((entry) => entry.relativePath)).toEqual([
      'LevelOne',
      'LevelOne/LevelTwo',
      'LevelOne/first.txt',
    ]);
  });

  it('skips symbolic links without reading their metadata', async () => {
    const adapter = new TauriDirectoryScanAdapter(
      createRegistry(),
      createDependencies({
        directories: {
          '/home/karya/Documents': [symlinkEntry('external-drive'), fileEntry('safe.txt')],
        },
        metadata: {
          '/home/karya/Documents/safe.txt': fileInfo(),
        },
      }),
    );

    const entries = await collectEntries(
      adapter.scanDirectory('tauri-directory:documents', DEFAULT_OPTIONS),
    );

    expect(entries.map((entry) => entry.name)).toEqual(['safe.txt']);
  });

  it('stops scanning when the AbortSignal is cancelled', async () => {
    const controller = new AbortController();

    controller.abort();

    const adapter = new TauriDirectoryScanAdapter(
      createRegistry(),
      createDependencies({
        directories: {
          '/home/karya/Documents': [],
        },
        metadata: {},
      }),
    );

    await expect(
      collectEntries(
        adapter.scanDirectory('tauri-directory:documents', {
          ...DEFAULT_OPTIONS,
          signal: controller.signal,
        }),
      ),
    ).rejects.toMatchObject({
      name: 'AbortError',
      message: 'Directory scan was cancelled.',
    });
  });

  it('rejects invalid maximum-depth values', async () => {
    const adapter = new TauriDirectoryScanAdapter(
      createRegistry(),
      createDependencies({
        directories: {
          '/home/karya/Documents': [],
        },
        metadata: {},
      }),
    );

    await expect(
      collectEntries(
        adapter.scanDirectory('tauri-directory:documents', {
          ...DEFAULT_OPTIONS,
          maximumDepth: -1,
        }),
      ),
    ).rejects.toThrow('Directory scan maximum depth must be a non-negative integer.');
  });
});
