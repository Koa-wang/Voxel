import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FrameworkName, ResolvedConfig } from '../types.js';
import type { Plugin, PluginContext } from './context.js';
import { createPluginContext } from './context.js';
import { logger } from '../core/logger.js';

/**
 * D1 — PluginManager.
 * Runs the four lifecycle hooks with the specified concurrency semantics:
 *   setup        → parallel
 *   beforeBuild  → serial, sorted by `order`
 *   transform    → serial per-asset pipeline
 *   afterBuild   → parallel
 * Plugins declared with `frameworks` are skipped for inactive frameworks.
 */
export class PluginManager {
  private plugins: Plugin[];

  constructor(
    plugins: Plugin[],
    private frameworks: FrameworkName[],
  ) {
    this.plugins = plugins;
  }

  private scoped(): Plugin[] {
    return this.plugins.filter((p) => !p.frameworks || p.frameworks.some((f) => this.frameworks.includes(f)));
  }

  async setup(ctx: PluginContext): Promise<void> {
    await Promise.allSettled(this.scoped().map((p) => (p.setup ? p.setup(ctx) : Promise.resolve())));
  }

  async beforeBuild(ctx: PluginContext): Promise<void> {
    const sorted = [...this.scoped()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    for (const p of sorted) {
      if (p.beforeBuild) await p.beforeBuild(ctx);
    }
  }

  async transform(asset: import('./context.js').Asset): Promise<import('./context.js').Asset> {
    let current = asset;
    for (const p of this.scoped()) {
      if (!p.transform) continue;
      current = await p.transform(current);
    }
    return current;
  }

  async afterBuild(ctx: PluginContext): Promise<void> {
    await Promise.allSettled(this.scoped().map((p) => (p.afterBuild ? p.afterBuild(ctx) : Promise.resolve())));
  }

  /** Flush emitted files (D2 — asset emission) to disk. */
  async writeEmitted(ctx: PluginContext, config: ResolvedConfig): Promise<void> {
    await Promise.all(
      ctx.emittedFiles.map(async (fileName) => {
        const content = await ctx.readAsset(fileName);
        const target = resolve(config.outDir, fileName);
        await writeFile(target, content, 'utf8');
        logger.debug(`emitted ${fileName}`);
      }),
    );
  }
}

export function createManager(
  config: ResolvedConfig,
  frameworks: FrameworkName[],
): {
  manager: PluginManager;
  ctx: PluginContext;
} {
  const ctx = createPluginContext(config);
  const manager = new PluginManager(config.plugins as Plugin[], frameworks);
  return { manager, ctx };
}
