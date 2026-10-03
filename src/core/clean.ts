import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { logger } from './logger.js';

/**
 * `unibits clean` — removes the cache directory and build output.
 */
export async function clean(cacheDir: string, outDir: string): Promise<void> {
  const dirs = [cacheDir, outDir].filter(Boolean);
  await Promise.all(
    dirs.map(async (dir) => {
      try {
        await rm(resolve(dir), { recursive: true, force: true });
        logger.success(`removed ${dir}`);
      } catch (err) {
        logger.warn(`failed to remove ${dir}: ${(err as Error).message}`);
      }
    }),
  );
  // Ensure output dir exists again for a clean state.
  await mkdir(resolve(outDir), { recursive: true }).catch(() => undefined);
}
