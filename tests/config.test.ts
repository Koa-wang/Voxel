import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { normalizeBase, resolveConfig } from '../src/core/config.js';

describe('normalizeBase', () => {
  it('normalizes to leading and trailing slash', () => {
    expect(normalizeBase(undefined)).toBe('/');
    expect(normalizeBase('/')).toBe('/');
    expect(normalizeBase('docs')).toBe('/docs/');
    expect(normalizeBase('/docs')).toBe('/docs/');
    expect(normalizeBase('docs/')).toBe('/docs/');
  });
});

describe('resolveConfig', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'unibits-config-'));
    await mkdir(join(dir, 'src'), { recursive: true });
    await writeFile(join(dir, 'src/index.ts'), 'export {}', 'utf8');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('applies zero-config defaults', async () => {
    const config = await resolveConfig({}, dir);
    expect(config.entry).toBe(join(dir, 'src/index.ts'));
    expect(config.outDir).toBe(join(dir, 'dist'));
    expect(config.port).toBe(3000);
    expect(config.framework).toBe('auto');
    expect(config.base).toBe('/');
    expect(config.open).toBe(false);
    expect(config.https).toBe(false);
    expect(config.mode).toBe('development');
  });

  it('CLI flags override config file values', async () => {
    await writeFile(
      join(dir, 'unibits.config.ts'),
      `export default { port: 5000, outDir: 'build', base: 'app' }`,
      'utf8',
    );
    const config = await resolveConfig({ port: 8080 }, dir);
    expect(config.port).toBe(8080);
    expect(config.outDir).toBe(join(dir, 'build'));
    expect(config.base).toBe('/app/');
  });

  it('merges showcase theme with defaults', async () => {
    await writeFile(
      join(dir, 'unibits.config.ts'),
      `export default { showcase: { theme: { primaryColor: '#ff0000' } } }`,
      'utf8',
    );
    const config = await resolveConfig({}, dir);
    expect(config.showcase.theme?.primaryColor).toBe('#ff0000');
    expect(config.showcase.theme?.darkMode).toBe(true);
    expect(config.showcase.title).toBe('UniBits Components');
  });

  it('throws when no entry can be detected', async () => {
    await rm(join(dir, 'src/index.ts'));
    await expect(resolveConfig({}, dir)).rejects.toThrow(/No entry point found/);
  });
});
