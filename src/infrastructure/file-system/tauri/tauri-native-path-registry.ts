/**
 * Maintains the infrastructure-only association between opaque FilePilot
 * access keys and real operating-system directory paths.
 *
 * LibrarySource entities store portable display metadata, while native file
 * operations resolve their actual paths through this registry.
 */
export class TauriNativePathRegistry {
  private readonly nativePathsByAccessKey = new Map<string, string>();

  register(accessKey: string, nativePath: string): void {
    const normalizedAccessKey = accessKey.trim();
    const normalizedNativePath = nativePath.trim();

    if (!normalizedAccessKey) {
      throw new Error('A native directory access key must not be empty.');
    }

    if (!normalizedNativePath) {
      throw new Error('A native directory path must not be empty.');
    }

    this.nativePathsByAccessKey.set(normalizedAccessKey, normalizedNativePath);
  }

  resolve(accessKey: string): string | null {
    return this.nativePathsByAccessKey.get(accessKey) ?? null;
  }

  forget(accessKey: string): void {
    this.nativePathsByAccessKey.delete(accessKey);
  }

  clear(): void {
    this.nativePathsByAccessKey.clear();
  }
}
