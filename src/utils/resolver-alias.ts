import { isAbsolute, resolve } from 'node:path';
import type { Plugin } from 'esbuild';
import type { AliasMap } from '../types.js';

/**
 * A7 — Path alias resolver.
 * Implements `{ '@': './src', '@components': './src/components' }` as an
 * esbuild `onResolve` hook that rewrites matching module specifiers at
 * resolution time. Longer keys win so nested aliases work predictably.
 */
export function createAliasPlugin(alias: AliasMap, cwd: string): Plugin {
  const entries = Object.entries(alias).sort((a, b) => b[0].length - a[0].length);
  return {
    name: 'unibits:alias',
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.namespace !== 'file' || args.path.startsWith('.')) return undefined;
        for (const [key, value] of entries) {
          const matches = args.path === key || args.path.startsWith(`${key}/`);
          if (!matches) continue;
          const target = isAbsolute(value) ? value : resolve(cwd, value);
          const rest = args.path.slice(key.length).replace(/^[/\\]/, '');
          const path = rest ? resolve(target, rest) : target;
          return { path };
        }
        return undefined;
      });
    },
  };
}
