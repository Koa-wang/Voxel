import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export function hashContent(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

export async function hashFile(path: string): Promise<string | null> {
  try {
    const content = await readFile(path);
    return hashContent(content);
  } catch {
    return null;
  }
}

/**
 * A8/E4 — Content-addressed incremental compilation cache.
 * Keys are `namespace:identifier:contentHash` so stale entries are never
 * reused after a source file changes.
 */
export class FileCache {
  constructor(private dir: string) {}

  private keyPath(key: string): string {
    const safe = key.replace(/[^a-zA-Z0-9._-]/g, '_');
    return resolve(this.dir, `${safe}.json`);
  }

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const raw = await readFile(this.keyPath(key), 'utf8');
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    const path = this.keyPath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(value), 'utf8');
  }

  async has(key: string): Promise<boolean> {
    try {
      await access(this.keyPath(key));
      return true;
    } catch {
      return false;
    }
  }
}

/** Build a cache key from a file path and its current content hash. */
export async function cacheKeyForFile(cacheDir: string, filePath: string): Promise<string | null> {
  const hash = await hashFile(filePath);
  if (!hash) return null;
  return `${filePath}:${hash}`;
}
