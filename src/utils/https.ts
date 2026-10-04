import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ResolvedConfig } from '../types.js';
import { logger } from '../core/logger.js';

export interface HttpsCredentials {
  key: string;
  cert: string;
}

/**
 * Resolve HTTPS credentials for the dev server.
 * - `{ key, cert }` config → read those PEM files (relative to project root).
 * - `true` → generate a self-signed certificate once and cache it in
 *   `<cacheDir>/dev-cert.pem` / `dev-key.pem` so restarts reuse the same cert.
 */
export async function resolveHttpsCredentials(config: ResolvedConfig): Promise<HttpsCredentials | null> {
  const setting = config.https;
  if (!setting) return null;

  if (typeof setting === 'object') {
    const keyPath = resolve(config.cwd, setting.key);
    const certPath = resolve(config.cwd, setting.cert);
    const [key, cert] = await Promise.all([readFile(keyPath, 'utf8'), readFile(certPath, 'utf8')]);
    return { key, cert };
  }

  const keyPath = resolve(config.cacheDir, 'dev-key.pem');
  const certPath = resolve(config.cacheDir, 'dev-cert.pem');
  if (existsSync(keyPath) && existsSync(certPath)) {
    const [key, cert] = await Promise.all([readFile(keyPath, 'utf8'), readFile(certPath, 'utf8')]);
    return { key, cert };
  }

  logger.info('generating self-signed certificate for HTTPS (cached in ' + config.cacheDir + ')');
  const selfsigned = (await import('selfsigned')).default;
  const attrs = [{ name: 'commonName', value: 'localhost' }];
  const pems = await selfsigned.generate(attrs, {
    algorithm: 'sha256',
    notAfterDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    keySize: 2048,
    extensions: [
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 2, value: '127.0.0.1' },
          { type: 7, ip: '127.0.0.1' },
        ],
      },
    ],
  });
  await mkdir(config.cacheDir, { recursive: true });
  await Promise.all([writeFile(keyPath, pems.private, 'utf8'), writeFile(certPath, pems.cert, 'utf8')]);
  return { key: pems.private, cert: pems.cert };
}
