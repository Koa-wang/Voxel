import type { ResolvedConfig } from '../types.js';

export type Loader = 'js' | 'jsx' | 'ts' | 'tsx' | 'css' | 'local-css' | 'json' | string;

export interface TransformArgs {
  /** Absolute path of the file being transformed. */
  path: string;
  /** Raw file contents. */
  code: string;
  /** Directory used to resolve relative imports from this file. */
  resolveDir: string;
}

export interface TransformResult {
  code: string;
  loader?: Loader;
  /** Additional CSS emitted by this transform (e.g. Vue SFC styles). */
  css?: Array<{ id: string; code: string }>;
}

export interface TransformPluginContext {
  config: ResolvedConfig;
  /** Register a virtual CSS chunk that can be imported as `virtual:unibits-style:<id>`. */
  registerStyle(id: string, code: string): void;
}

/**
 * A single framework-aware transform step in the unified compile pipeline.
 * Plugins are matched by `filter` (a RegExp tested against the file path),
 * then their `transform` runs before esbuild bundles the resulting code.
 */
export interface TransformPlugin {
  name: string;
  filter: RegExp;
  /** Return `null` to decline the file and let the next plugin / default loader handle it. */
  transform(args: TransformArgs, ctx: TransformPluginContext): Promise<TransformResult | null>;
}
