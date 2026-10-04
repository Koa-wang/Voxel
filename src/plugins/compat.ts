import type { Plugin } from './context.js';

/**
 * D4 — Vite / Rollup plugin compatibility shim.
 *
 * The UniBits engine exposes its own 4-hook lifecycle; these adapters map the
 * most common Vite/Rollup plugin hooks onto it. Full hook parity is out of
 * scope for the MVP, but `config`, `transform` and `generateBundle`-style
 * plugins can be reused with minimal changes.
 */

type ViteLikePlugin = {
  name?: string;
  transform?(
    code: string,
    id: string,
  ): { code: string; map?: unknown } | null | Promise<{ code: string; map?: unknown } | null>;
  configResolved?(config: unknown): void;
  [key: string]: unknown;
};

export function adaptVitePlugin(plugin: ViteLikePlugin): Plugin {
  return {
    name: plugin.name ?? 'unibits:vite-compat',
    async transform(asset) {
      if (!plugin.transform) return asset;
      const result = await plugin.transform(asset.code, asset.filePath);
      if (!result || typeof result !== 'object') return asset;
      return { ...asset, code: result.code ?? asset.code };
    },
    setup(ctx) {
      plugin.configResolved?.(ctx.config);
    },
  };
}

type RollupLikePlugin = {
  name?: string;
  transform?(
    code: string,
    id: string,
  ): { code: string; map?: unknown } | null | Promise<{ code: string; map?: unknown } | null>;
  [key: string]: unknown;
};

export function adaptRollupPlugin(plugin: RollupLikePlugin): Plugin {
  return adaptVitePlugin(plugin);
}
