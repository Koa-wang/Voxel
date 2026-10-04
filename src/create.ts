import { cp, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { logger } from './core/logger.js';

const TEMPLATE_DIR = fileURLToPath(new URL('../templates/', import.meta.url));

/** The published version range written into scaffolded projects. */
function currentVersion(): string {
  const require = createRequire(import.meta.url);
  const pkg = require('../package.json') as { version: string };
  return pkg.version;
}

export async function createProject(template: string, target: string): Promise<void> {
  const src = resolve(TEMPLATE_DIR, template);
  if (!existsSync(src))
    throw new Error(
      `Unknown template '${template}' (available: vue-starter, react-starter, solid-starter, multi-framework)`,
    );

  const dest = resolve(target);
  await cp(src, dest, { recursive: true, errorOnExist: true });

  const pkgPath = resolve(dest, 'package.json');
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as {
    name?: string;
    devDependencies?: Record<string, string>;
  };
  pkg.name = basename(dest);
  // Templates reference the local workspace build; swap in the real version
  // when scaffolding a standalone project.
  if (pkg.devDependencies?.unibits === 'workspace:*') {
    pkg.devDependencies.unibits = `^${currentVersion()}`;
  }
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

  logger.success(`created ${template} project at ${dest}`);
  logger.info('next steps:');
  logger.raw('  cd ' + basename(dest));
  logger.raw('  npm install');
  logger.raw('  npx unibits dev');
}
