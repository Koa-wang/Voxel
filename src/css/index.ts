import { readFile, writeFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import type { Plugin } from 'esbuild';
import type { ResolvedConfig } from '../types.js';
import { createCssModulesPlugin } from './modules.js';
import { createAtomicCssProcessor } from './atomic.js';
import { processCss } from './lightning.js';
import { logger } from '../core/logger.js';

/**
 * Virtual CSS registry. Transform plugins (e.g. the Vue SFC compiler) register
 * extracted styles under an id; the bundle imports them via
 * `virtual:unibits-style:<id>` and this plugin serves them to esbuild as CSS.
 */
export function createStyleRegistryPlugin(styles: Map<string, string>): Plugin {
  return {
    name: 'unibits:style-registry',
    setup(build) {
      build.onResolve({ filter: /^virtual:unibits-style:/ }, (args) => ({
        path: args.path.slice('virtual:unibits-style:'.length),
        namespace: 'unibits-css',
      }));
      build.onLoad({ filter: /.*/, namespace: 'unibits-css' }, (args) => {
        const css = styles.get(args.path);
        return css !== undefined
          ? { contents: css, loader: 'css', resolveDir: process.cwd() }
          : { contents: '', loader: 'css', resolveDir: process.cwd() };
      });
    },
  };
}

/** All CSS-related esbuild plugins, wired with a shared style registry. */
export function createCssPlugins(config: ResolvedConfig, styles: Map<string, string>): Plugin[] {
  return [createStyleRegistryPlugin(styles), createCssModulesPlugin(config, styles)];
}

async function* walk(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

/**
 * Post-build pass: run every emitted `.css` file through Lightning CSS for
 * autoprefixer + minification, and optionally through the detected Tailwind /
 * UnoCSS PostCSS processor.
 */
export async function postProcessCss(config: ResolvedConfig): Promise<void> {
  const atomic = await createAtomicCssProcessor(config.cwd);
  let count = 0;
  for await (const file of walk(config.outDir)) {
    if (extname(file) !== '.css') continue;
    let code = await readFile(file, 'utf8');
    if (atomic.active) code = await atomic.process(code, file);
    const result = processCss(code, {
      filename: file,
      minify: config.minify,
      browsers: config.browsers,
    });
    await writeFile(file, result.code, 'utf8');
    count++;
  }
  if (count > 0) logger.debug(`processed ${count} css file(s)`);
}
