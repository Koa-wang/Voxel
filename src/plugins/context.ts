import type { FrameworkName, ResolvedConfig } from '../types.js';

/**
 * D1 — Plugin lifecycle contract.
 * A plugin may hook into four phases: setup, beforeBuild, transform and
 * afterBuild. `frameworks` scopes a plugin to specific framework builds.
 */
export interface Plugin {
  name: string;
  /** Limit this plugin to specific frameworks. Omit for all frameworks. */
  frameworks?: FrameworkName[];
  /** Execution order for serial hooks (ascending). */
  order?: number;

  /** Parallel initialization. */
  setup?(ctx: PluginContext): Promise<void> | void;
  /** Serial pre-build hook, ordered by `order`. */
  beforeBuild?(ctx: PluginContext): Promise<void> | void;
  /** Serial per-asset transform pipeline. */
  transform?(asset: Asset): Promise<Asset>;
  /** Parallel post-build hook. */
  afterBuild?(ctx: PluginContext): Promise<void> | void;
}

export interface Asset {
  fileName: string;
  filePath: string;
  code: string;
  type: 'js' | 'css' | 'html' | 'json' | string;
}

export interface PluginContext {
  assets: Asset[];
  readAsset(fileName: string): Promise<string>;
  emitFile(fileName: string, content: string): Promise<void>;
  emittedFiles: string[];
  errors: Error[];
  config: ResolvedConfig;
}

export function createPluginContext(config: ResolvedConfig): PluginContext {
  const emittedFiles: string[] = [];
  const assets: Asset[] = [];
  const errors: Error[] = [];
  const assetMap = new Map<string, Asset>();

  return {
    assets,
    errors,
    emittedFiles,
    config,
    async readAsset(fileName) {
      const found = assetMap.get(fileName);
      if (found) return found.code;
      const { readFile } = await import('node:fs/promises');
      const { resolve } = await import('node:path');
      return readFile(resolve(config.cwd, fileName), 'utf8');
    },
    async emitFile(fileName, content) {
      emittedFiles.push(fileName);
      assetMap.set(fileName, {
        fileName,
        filePath: fileName,
        code: content,
        type: fileName.split('.').pop() ?? 'txt',
      });
    },
  };
}
