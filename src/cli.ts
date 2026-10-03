import { program } from 'commander';
import { intro, outro, select, text, isCancel } from '@clack/prompts';
import pc from 'picocolors';
import { dev } from './core/dev.js';
import { build, buildLibraryMode } from './core/build.js';
import { clean } from './core/clean.js';
import { serveShowcase } from './showcase/server.js';
import { resolveConfig, readPackageJson } from './core/config.js';
import { detectFrameworks, describeFrameworks } from './adapters/detect.js';
import { createProject } from './create.js';
import { logger } from './core/logger.js';
import type { CliOptions, FrameworkName } from './types.js';

const VERSION = '0.1.0';

function parseFramework(value: string | undefined): CliOptions['framework'] {
  if (!value) return undefined;
  const parts = value.split(',').map((p) => p.trim()) as FrameworkName[];
  return parts.length === 1 ? parts[0] : parts;
}

export async function run(): Promise<void> {
  program.name('unibits').description('Unified build framework for Vue 3, React 18+ and Solid.js').version(VERSION);

  program
    .command('dev')
    .argument('[entry]', 'entry file (default: auto-detected)')
    .option('-p, --port <port>', 'dev server port', (v) => parseInt(v, 10))
    .option('--framework <frameworks>', 'force framework: vue | react | solid | vue,react')
    .option('--host <host>', 'bind host')
    .option('--https', 'enable HTTPS')
    .action(async (entry, opts: { port?: number; framework?: string; host?: string; https?: boolean }) => {
      const cwd = process.cwd();
      const pkg = await readPackageJson(cwd);
      const detected = detectFrameworks(pkg);
      if (detected.length === 0 && !opts.framework) {
        logger.warn('No framework detected in package.json. Install one and retry:');
        logger.raw('  npm install vue            # or react react-dom, or solid-js');
      }
      logger.info(`frameworks: ${opts.framework ?? (describeFrameworks(detected) || 'none')}`);
      await dev({ entry, port: opts.port, framework: parseFramework(opts.framework), host: opts.host, https: opts.https });
    });

  program
    .command('build')
    .argument('[entry]', 'entry file (default: auto-detected)')
    .option('--lib', 'library mode (CJS + ESM + .d.ts)')
    .option('--ssr', 'SSR/SSG dual-end build')
    .option('--routes <routes>', 'comma-separated routes to prerender (with --ssr)')
    .option('--analyze', 'emit a bundle analysis report')
    .option('--no-cache', 'disable compilation cache')
    .option('-o, --outDir <dir>', 'output directory')
    .action(async (entry, opts: { lib?: boolean; ssr?: boolean; routes?: string; analyze?: boolean; cache?: boolean; outDir?: string }) => {
      const routes = opts.routes ? opts.routes.split(',').map((r) => r.trim()).filter(Boolean) : [];
      if (opts.lib) {
        await buildLibraryMode({ entry, outDir: opts.outDir, noCache: opts.cache === false });
      } else {
        await build({ entry, outDir: opts.outDir, ssr: opts.ssr, routes, analyze: opts.analyze, noCache: opts.cache === false });
      }
    });

  program
    .command('showcase')
    .argument('[action]', 'build | generate | (serve by default)')
    .option('-p, --port <port>', 'port', (v) => parseInt(v, 10))
    .option('-o, --outDir <dir>', 'output directory (for build/generate)')
    .action(async (action, opts: { port?: number; outDir?: string }) => {
      const config = await resolveConfig({ entry: '.', outDir: opts.outDir });
      const buildOnly = action === 'build' || action === 'generate';
      await serveShowcase(config, opts.port ?? config.port, buildOnly);
    });

  program
    .command('clean')
    .option('-o, --outDir <dir>', 'custom output directory')
    .action(async (opts: { outDir?: string }) => {
      const config = await resolveConfig({});
      const outDir = opts.outDir ?? config.outDir;
      await clean(config.cacheDir, outDir);
    });

  program
    .command('create')
    .argument('<template>', 'vue-starter | react-starter | solid-starter | multi-framework')
    .argument('[target]', 'target directory', '.')
    .action(async (template: string, target: string) => {
      await createProject(template, target);
    });

  // Interactive mode: no subcommand provided.
  if (process.argv.length <= 2) {
    await interactive();
    return;
  }

  await program.parseAsync(process.argv);
}

async function interactive(): Promise<void> {
  intro(pc.green('UniBits — Vue · React · Solid in one build'));
  const action = await select({
    message: 'What do you want to do?',
    options: [
      { value: 'dev', label: 'Start dev server', hint: 'HMR + proxy + type-check' },
      { value: 'build', label: 'Build for production', hint: 'bundled + tree-shaken' },
      { value: 'lib', label: 'Build library', hint: 'CJS + ESM + .d.ts' },
      { value: 'create', label: 'Create new project', hint: 'scaffold a starter' },
      { value: 'clean', label: 'Clean cache & output' },
    ],
  });
  if (isCancel(action)) return;

  const entry = await text({ message: 'Entry file (blank for auto-detect)', placeholder: 'src/index.ts' });
  if (isCancel(entry)) return;

  if (action === 'create') {
    const template = await select({
      message: 'Choose a starter template',
      options: [
        { value: 'vue-starter', label: 'Vue 3' },
        { value: 'react-starter', label: 'React 18' },
        { value: 'solid-starter', label: 'Solid.js' },
        { value: 'multi-framework', label: 'Multi-framework' },
      ],
    });
    if (isCancel(template)) return;
    const target = await text({ message: 'Project directory', initialValue: 'my-unibits-app' });
    if (isCancel(target)) return;
    await createProject(String(template), String(target));
    outro(pc.green('Done — run: cd ' + target + ' && npm install && npx unibits dev'));
    return;
  }

  const portStr = await text({ message: 'Port', initialValue: '3000' });
  if (isCancel(portStr)) return;
  const port = parseInt(portStr, 10) || 3000;

  const cli: CliOptions = { entry: entry || undefined, port };
  if (action === 'dev') await dev(cli);
  else if (action === 'lib') await buildLibraryMode(cli);
  else if (action === 'clean') {
    const config = await resolveConfig(cli);
    await clean(config.cacheDir, config.outDir);
  } else await build(cli);

  outro(pc.green('Done!'));
}
