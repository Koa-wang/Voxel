import { existsSync, readdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import * as esbuild from 'esbuild';
import type { BuildResult, FrameworkName, ResolvedConfig } from '../types.js';
import type { TransformPlugin } from '../adapters/transform.js';
import { createEsbuildOptions, resolveHtmlEntry } from '../core/build.js';
import { logger } from '../core/logger.js';

function findServerEntry(cwd: string): string | null {
  const candidates = [
    'src/entry-server.ts',
    'src/entry-server.tsx',
    'src/entry-server.js',
    'src/entry-server.jsx',
    'src/server.ts',
    'src/server.tsx',
  ];
  for (const c of candidates) {
    if (existsSync(resolve(cwd, c))) return c;
  }
  return null;
}

/**
 * E3 — SSR / SSG dual-end build.
 *
 *   Client build → dist/client/   (ESM, splitting, browser)
 *   Server build → dist/server/   (CJS, node, node_modules external)
 *   Prerender    → dynamic import of the server bundle, render({ url }) per
 *                  route, injected into the client HTML template.
 */
export async function buildSSR(
  config: ResolvedConfig,
  frameworks: FrameworkName[],
  transformPlugins: TransformPlugin[],
  styles: Map<string, string>,
  routes: string[] = [],
): Promise<BuildResult> {
  const start = Date.now();
  const clientDir = resolve(config.outDir, 'client');
  const serverDir = resolve(config.outDir, 'server');
  await mkdir(clientDir, { recursive: true });
  await mkdir(serverDir, { recursive: true });

  const { jsEntry, html } = await resolveHtmlEntry(config);

  logger.info('SSR: building client bundle → dist/client');
  await esbuild.build(
    createEsbuildOptions({
      config,
      frameworks,
      styles,
      transformPlugins,
      entryPoints: [jsEntry],
      write: true,
      outdir: clientDir,
      splitting: true,
      metafile: false,
    }),
  );

  const serverEntry = findServerEntry(config.cwd);
  if (serverEntry) {
    logger.info('SSR: building server bundle → dist/server');
    await esbuild.build(
      createEsbuildOptions({
        config,
        frameworks,
        styles,
        transformPlugins,
        entryPoints: [resolve(config.cwd, serverEntry)],
        write: true,
        outdir: serverDir,
        format: 'cjs',
        platform: 'node',
        splitting: false,
        packages: 'external',
        metafile: false,
      }),
    );

    if (routes.length > 0 && html) {
      await prerender(config, serverDir, html, routes);
    }
  } else {
    logger.warn('SSR: no src/entry-server.* found — server bundle skipped.');
  }

  logger.success(`SSR built in ${Date.now() - start}ms`);
  return { outDir: config.outDir, outputFiles: [], duration: Date.now() - start };
}

async function prerender(
  config: ResolvedConfig,
  serverDir: string,
  html: { path: string; content: string; src: string },
  routes: string[],
): Promise<void> {
  const entryFile = resolve(serverDir, `${basename(html.path).replace('.html', '')}.js`);
  const serverEntryName = findFirstJs(serverDir);
  const bundlePath = serverEntryName ? resolve(serverDir, serverEntryName) : entryFile;

  let render: (url: string) => Promise<string | { html: string }>;
  try {
    const mod = (await import(bundlePath)) as {
      default?: (url: string) => Promise<string | { html: string }> | string | { html: string };
      render?: (url: string) => Promise<string | { html: string }> | string | { html: string };
    };
    render = (mod.default ?? mod.render) as typeof render;
    if (typeof render !== 'function') throw new Error('server entry must export a default `render(url)` function');
  } catch (err) {
    logger.warn(`SSG: cannot load server bundle: ${(err as Error).message}`);
    return;
  }

  for (const route of routes) {
    const result = await render(route);
    const rendered = typeof result === 'string' ? result : result.html;
    const injected = html.content.replace('<div id="app"></div>', (match) => `${match}\n${rendered}`);
    const file = route === '/' ? 'index.html' : `${route.replace(/^\/+|\/+$/g, '').replace(/\//g, '-')}.html`;
    await writeFile(resolve(config.outDir, file), injected, 'utf8');
    logger.info(`SSG: prerendered ${route} → ${file}`);
  }
}

function findFirstJs(dir: string): string | null {
  try {
    const entries = readdirSync(dir);
    const js = entries.filter((e) => e.endsWith('.js') && !e.endsWith('.map'));
    return js.length === 1 ? js[0] : js.find((e) => e.startsWith('entry-server') || e.startsWith('server')) ?? null;
  } catch {
    return null;
  }
}
