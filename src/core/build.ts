import { spawn } from 'node:child_process';
import { copyFile, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, relative, resolve } from 'node:path';
import * as esbuild from 'esbuild';
import { resolveConfig, readPackageJson } from './config.js';
import { createAdapters, resolveFrameworks } from '../adapters/index.js';
import type { FrameworkAdapter } from '../adapters/interface.js';
import type { TransformPlugin } from '../adapters/transform.js';
import { createAliasPlugin } from '../utils/resolver-alias.js';
import { createCssPlugins, postProcessCss } from '../css/index.js';
import { createManager, type PluginManager } from '../plugins/manager.js';
import type { PluginContext } from '../plugins/context.js';
import { logger } from './logger.js';
import { analyzeBundle } from './analyze.js';
import { buildFederationRemote } from '../enterprise/federation.js';
import { buildSSR } from '../enterprise/ssr.js';
import type { BuildResult, CliOptions, FrameworkName, ResolvedConfig } from '../types.js';

export interface EsbuildInput {
  config: ResolvedConfig;
  frameworks: FrameworkName[];
  styles: Map<string, string>;
  transformPlugins: TransformPlugin[];
  entryPoints: string[];
  write: boolean;
  outdir?: string;
  outfile?: string;
  format?: 'esm' | 'cjs' | 'iife';
  platform?: 'browser' | 'node' | 'neutral';
  splitting?: boolean;
  metafile?: boolean;
  external?: string[];
  define?: Record<string, string>;
  minify?: boolean;
  outbase?: string;
  packages?: 'external';
}

function defaultLoader(path: string): esbuild.Loader {
  if (path.endsWith('.tsx')) return 'tsx';
  if (path.endsWith('.ts')) return 'ts';
  if (path.endsWith('.jsx')) return 'jsx';
  if (path.endsWith('.json')) return 'json';
  return 'js';
}

/**
 * Bridge between the unified TransformPlugin pipeline and esbuild. Each
 * TransformPlugin becomes an `onLoad` hook; declined files (`null` result) fall
 * through to the next hook or esbuild's default loader.
 */
export function createTransformBridge(
  plugins: TransformPlugin[],
  config: ResolvedConfig,
  styles: Map<string, string>,
): esbuild.Plugin {
  return {
    name: 'unibits:transform',
    setup(build) {
      for (const plugin of plugins) {
        build.onLoad({ filter: plugin.filter }, async (args): Promise<esbuild.OnLoadResult | undefined> => {
          let code: string;
          try {
            code = await readFile(args.path, 'utf8');
          } catch (err) {
            return { errors: [{ text: `Cannot read ${args.path}: ${(err as Error).message}` }] };
          }
          try {
            const result = await plugin.transform(
              { path: args.path, code, resolveDir: dirname(args.path) },
              {
                config,
                registerStyle: (id, css) => styles.set(id, css),
              },
            );
            if (!result) return undefined;
            if (result.css) for (const s of result.css) styles.set(s.id, s.code);
            return {
              contents: result.code,
              loader: (result.loader ?? defaultLoader(args.path)) as esbuild.Loader,
              resolveDir: dirname(args.path),
            };
          } catch (err) {
            return { errors: [{ text: `[${plugin.name}] ${(err as Error).message}` }] };
          }
        });
      }
    },
  };
}

export function createBasePlugins(
  config: ResolvedConfig,
  frameworks: FrameworkName[],
  styles: Map<string, string>,
  transformPlugins: TransformPlugin[],
): esbuild.Plugin[] {
  return [
    createAliasPlugin(config.alias, config.cwd),
    createTransformBridge(transformPlugins, config, styles),
    ...createCssPlugins(config, styles),
  ];
}

export function createEsbuildOptions(input: EsbuildInput): esbuild.BuildOptions {
  const { config, frameworks, styles, transformPlugins } = input;
  const plugins: esbuild.Plugin[] = createBasePlugins(config, frameworks, styles, transformPlugins);

  const options: esbuild.BuildOptions = {
    entryPoints: input.entryPoints,
    bundle: true,
    plugins,
    write: input.write,
    format: input.format ?? 'esm',
    platform: input.platform ?? 'browser',
    splitting: input.splitting ?? (input.format ?? 'esm') === 'esm',
    metafile: input.metafile ?? false,
    sourcemap: config.sourcemap,
    minify: input.minify ?? config.minify,
    target: ['es2020'],
    legalComments: 'none',
    logLevel: 'info',
    define: {
      'process.env.NODE_ENV': JSON.stringify(config.mode),
      ...(input.define ?? {}),
    },
    resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.vue', '.mjs', '.cjs', '.css', '.json'],
    external: input.external,
    outbase: input.outbase,
    packages: input.packages,
  };

  if (input.outfile) options.outfile = input.outfile;
  else if (input.outdir) options.outdir = input.outdir;

  // React (and only React) uses esbuild's automatic JSX runtime. Solid files
  // are transformed to plain JS by the Solid adapter before esbuild sees them.
  if (frameworks.includes('react')) options.jsx = 'automatic';

  return options;
}

interface ResolvedEntry {
  jsEntry: string;
  html?: { path: string; content: string; src: string };
}

export async function resolveHtmlEntry(config: ResolvedConfig): Promise<ResolvedEntry> {
  if (!config.entry.endsWith('.html')) return { jsEntry: config.entry };
  const html = await readFile(config.entry, 'utf8');
  const match = html.match(/<script[^>]+src=["']([^"']+)["'][^>]*>/);
  if (!match) throw new Error(`HTML entry ${config.entry} must reference a <script src="...">`);
  const src = match[1];
  const jsEntry = src.startsWith('/')
    ? resolve(config.cwd, src.replace(/^[/\\]+/, ''))
    : resolve(dirname(config.entry), src);
  return { jsEntry, html: { path: config.entry, content: html, src } };
}

async function copyPublicDir(config: ResolvedConfig): Promise<void> {
  try {
    await cp(config.publicDir, config.outDir, { recursive: true });
    logger.debug(`copied public dir`);
  } catch {
    // public dir is optional
  }
}

export { copyPublicDir };

async function runTscDeclarations(config: ResolvedConfig): Promise<void> {
  const { existsSync } = await import('node:fs');
  if (!existsSync(resolve(config.cwd, 'tsconfig.json'))) {
    logger.warn('Library mode: no tsconfig.json found, skipping type declarations.');
    return;
  }
  await new Promise<void>((resolvePromise) => {
    const child = spawn(
      'npx',
      ['tsc', '-p', 'tsconfig.json', '--emitDeclarationOnly', '--declaration', '--outDir', config.outDir],
      { cwd: config.cwd, shell: process.platform === 'win32', stdio: 'inherit' },
    );
    child.on('exit', () => resolvePromise());
  });
}

async function buildLibrary(
  config: ResolvedConfig,
  entry: string,
  frameworks: FrameworkName[],
  styles: Map<string, string>,
  transformPlugins: TransformPlugin[],
): Promise<void> {
  const pkg = (await readPackageJson(config.cwd)) as Record<string, unknown>;
  const external = [
    ...Object.keys((pkg.dependencies as Record<string, string>) ?? {}),
    ...Object.keys((pkg.peerDependencies as Record<string, string>) ?? {}),
    ...Object.keys((pkg.devDependencies as Record<string, string>) ?? {}),
  ];

  const base: EsbuildInput = {
    config,
    frameworks,
    styles,
    transformPlugins,
    entryPoints: [entry],
    write: true,
    external,
    platform: 'neutral',
    splitting: false,
  };

  logger.info('building CJS → dist/index.js');
  await esbuild.build(createEsbuildOptions({ ...base, outfile: resolve(config.outDir, 'index.js'), format: 'cjs' }));
  logger.info('building ESM → dist/index.module.js');
  await esbuild.build(createEsbuildOptions({ ...base, outfile: resolve(config.outDir, 'index.module.js'), format: 'esm' }));
  logger.info('emitting type declarations → dist/index.d.ts');
  await runTscDeclarations(config);
}

/**
 * A4 — Library mode. Builds a publishable NPM package (CJS + ESM + .d.ts).
 */
export async function buildLibraryMode(cli: CliOptions, cwd: string = process.cwd()): Promise<BuildResult> {
  const start = Date.now();
  const config = await resolveConfig({ ...cli, lib: true }, cwd);
  const pkg = (await readPackageJson(cwd)) as Record<string, unknown>;
  const frameworks = resolveFrameworks(pkg, config.framework);
  const adapters = createAdapters(frameworks);
  const styles = new Map<string, string>();
  const transformPlugins = adapters.flatMap((a) => a.getTransformPlugins(config, frameworks));

  await mkdir(config.outDir, { recursive: true });
  const { jsEntry } = await resolveHtmlEntry(config);
  await buildLibrary(config, jsEntry, frameworks, styles, transformPlugins);
  await postProcessCss(config);

  logger.success(`library built in ${Date.now() - start}ms → ${relative(cwd, config.outDir)}`);
  return { outDir: config.outDir, outputFiles: [], duration: Date.now() - start };
}

/**
 * Main production build. Entry can be an HTML file (application) or a
 * JS/TS file (library, when combined with --lib).
 */
export async function build(cli: CliOptions = {}, cwd: string = process.cwd()): Promise<BuildResult> {
  const start = Date.now();
  const config = await resolveConfig(cli, cwd);
  const pkg = (await readPackageJson(cwd)) as Record<string, unknown>;
  const frameworks = resolveFrameworks(pkg, config.framework);
  const adapters: FrameworkAdapter[] = createAdapters(frameworks);

  if (frameworks.length === 0) {
    logger.warn('No framework detected — building as plain JS/TS. Install vue / react / solid-js to enable framework features.');
  }

  const styles = new Map<string, string>();
  const transformPlugins = adapters.flatMap((a) => a.getTransformPlugins(config, frameworks));
  const { manager, ctx } = createManager(config, frameworks);

  await mkdir(config.outDir, { recursive: true });
  await manager.setup(ctx);
  await manager.beforeBuild(ctx);

  if (cli.ssr) {
    const result = await buildSSR(config, frameworks, transformPlugins, styles);
    await manager.afterBuild(ctx);
    await manager.writeEmitted(ctx, config);
    return result;
  }

  const { jsEntry, html } = await resolveHtmlEntry(config);

  const input: EsbuildInput = {
    config,
    frameworks,
    styles,
    transformPlugins,
    entryPoints: [jsEntry],
    write: true,
    outdir: config.outDir,
    metafile: true,
  };

  const result = await esbuild.build(createEsbuildOptions(input));

  if (html) {
    const outName = basename(jsEntry).replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '');
    let content = html.content;
    content = content.replace(html.src, `/${outName}.js`);
    content = content.replace('</head>', `<link rel="stylesheet" href="/${outName}.css">\n</head>`);
    await writeFile(resolve(config.outDir, basename(config.entry)), content, 'utf8');
  }

  if (cli.analyze && result.metafile) {
    await analyzeBundle(result.metafile, config);
  }

  await postProcessCss(config);
  await copyPublicDir(config);

  if (config.federation) {
    await buildFederationRemote(config, frameworks, transformPlugins, styles);
  }

  await manager.afterBuild(ctx);
  await manager.writeEmitted(ctx, config);

  logger.success(`built in ${Date.now() - start}ms → ${relative(cwd, config.outDir)}`);
  return { outDir: config.outDir, outputFiles: Object.keys(result.metafile?.outputs ?? {}), duration: Date.now() - start };
}
