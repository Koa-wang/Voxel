#!/usr/bin/env node
/**
 * Template smoke test: builds every starter template with the local unibits
 * CLI and asserts the expected production files are emitted.
 *
 * Usage: pnpm build && pnpm verify:templates
 * (requires `pnpm install` first so template workspace deps are linked)
 */
import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const templatesDir = join(root, 'templates');
const cli = join(root, 'bin', 'unibits.js');

const templates = readdirSync(templatesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(templatesDir, d.name, 'package.json')))
  .map((d) => d.name);

let failed = 0;

for (const name of templates) {
  const dir = join(templatesDir, name);
  const label = `template:${name}`;
  try {
    if (!existsSync(join(dir, 'node_modules'))) {
      throw new Error('node_modules missing — run `pnpm install` at the repo root first');
    }
    await execFileAsync(process.execPath, [cli, 'build'], {
      cwd: dir,
      env: { ...process.env, NODE_ENV: 'production' },
    });

    const htmlPath = join(dir, 'dist', 'index.html');
    if (!existsSync(htmlPath)) throw new Error('dist/index.html not emitted');
    const html = readFileSync(htmlPath, 'utf8');
    if (!html.includes('<script')) throw new Error('dist/index.html has no <script> tag');

    const distFiles = readdirSync(dir + '/dist');
    if (!distFiles.some((f) => f.endsWith('.js'))) throw new Error('no JS bundle in dist/');
    console.log(`✔ ${label}`);
  } catch (err) {
    failed++;
    console.error(`✖ ${label}: ${err.message}`);
    if (err.stderr) console.error(err.stderr);
  }
}

if (failed > 0) {
  console.error(`\n${failed}/${templates.length} template(s) failed`);
  process.exit(1);
}
console.log(`\n${templates.length}/${templates.length} templates built successfully`);
