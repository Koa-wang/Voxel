import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as esbuild from 'esbuild';
import type { FrameworkName, ResolvedConfig } from '../types.js';
import type { TransformPlugin } from '../adapters/transform.js';
import { createBasePlugins } from '../core/build.js';
import { logger } from '../core/logger.js';

/**
 * E2 — Module federation.
 *
 * `unibits build` with a `federation` config bundles every exposed module into
 * a `remoteEntry.js` that registers itself on `globalThis.__unibits_federation__`.
 * Hosts load remotes via `loadRemote()` and consume shared dependencies via the
 * `loadShared()` / `registerShared()` runtime API.
 */
export async function buildFederationRemote(
  config: ResolvedConfig,
  frameworks: FrameworkName[],
  transformPlugins: TransformPlugin[],
  styles: Map<string, string>,
): Promise<void> {
  const fed = config.federation;
  if (!fed) return;
  const entries = Object.entries(fed.exposes ?? {});
  if (entries.length === 0) {
    logger.warn('federation configured without `exposes` — nothing to emit.');
    return;
  }

  const imports = entries.map(([, file], i) => `import * as m${i} from ${JSON.stringify(file)};`).join('\n');
  const assignments = entries.map(([key], i) => `reg[${JSON.stringify(key)}] = m${i};`).join('\n');
  const virtual = [
    imports,
    'const reg = (globalThis.__unibits_federation__ ||= {});',
    `(reg[${JSON.stringify(fed.name)}] ||= {});`,
    assignments,
  ].join('\n');

  const outfile = resolve(config.outDir, fed.filename ?? 'remoteEntry.js');
  await esbuild.build({
    stdin: { contents: virtual, resolveDir: config.cwd, loader: 'js' },
    bundle: true,
    write: true,
    outfile,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    minify: config.minify,
    define: { 'process.env.NODE_ENV': JSON.stringify(config.mode) },
    plugins: createBasePlugins(config, frameworks, styles, transformPlugins),
  });
  logger.success(`federation remote → ${fed.filename ?? 'remoteEntry.js'}`);
}

export interface RemoteRegistry {
  [expose: string]: unknown;
}

declare global {
  // eslint-disable-next-line no-var
  var __unibits_federation__: Record<string, RemoteRegistry>;
  // eslint-disable-next-line no-var
  var __unibits_shared__: Record<string, unknown>;
}

/**
 * Runtime API injected into host applications. Loads a remote entry script and
 * returns its exposed-module registry.
 */
export function federationClientRuntime(): string {
  return `
(function () {
  const g = globalThis;
  g.__unibits_federation__ = g.__unibits_federation__ || {};
  g.__unibits_shared__ = g.__unibits_shared__ || {};

  function loadRemote(remoteName, url) {
    if (g.__unibits_federation__[remoteName]) return Promise.resolve(g.__unibits_federation__[remoteName]);
    return new Promise((resolvePromise, reject) => {
      const s = document.createElement('script');
      s.src = url;
      s.onload = () => resolvePromise(g.__unibits_federation__[remoteName]);
      s.onerror = () => reject(new Error('Failed to load remote ' + remoteName + ' from ' + url));
      document.head.appendChild(s);
    });
  }

  function registerShared(name, factory) {
    if (!g.__unibits_shared__[name]) g.__unibits_shared__[name] = factory();
    return g.__unibits_shared__[name];
  }

  function loadShared(name) {
    if (!g.__unibits_shared__[name]) throw new Error('Shared module not registered: ' + name);
    return g.__unibits_shared__[name];
  }

  g.__unibits = Object.assign(g.__unibits || {}, { loadRemote, loadShared, registerShared });
})();
`;
}

export async function writeFederationRuntime(config: ResolvedConfig): Promise<void> {
  if (!config.federation) return;
  await writeFile(resolve(config.outDir, 'federation-runtime.js'), federationClientRuntime(), 'utf8');
}
