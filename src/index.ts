import type { CliOptions, FrameworkName, ResolvedConfig, ShowcaseConfig, UserConfig } from './types.js';
import type { FrameworkAdapter } from './adapters/interface.js';
import type { TransformPlugin, TransformResult, TransformArgs } from './adapters/transform.js';
import type { Plugin, PluginContext, Asset } from './plugins/context.js';

export { build, buildLibraryMode } from './core/build.js';
export { dev } from './core/dev.js';
export { clean } from './core/clean.js';
export { resolveConfig, loadConfig, detectEntry } from './core/config.js';
export { logger } from './core/logger.js';
export { VueAdapter } from './adapters/vue.js';
export { ReactAdapter } from './adapters/react.js';
export { SolidAdapter } from './adapters/solid.js';
export { detectFrameworks, describeFrameworks, isMultiFramework } from './adapters/detect.js';
export { adaptVitePlugin, adaptRollupPlugin } from './plugins/compat.js';
export { scanComponents, generateManifest } from './showcase/generator.js';
export { compileShowcaseCode } from './showcase/compiler.js';

export type {
  CliOptions,
  FrameworkName,
  ResolvedConfig,
  ShowcaseConfig,
  UserConfig,
  FrameworkAdapter,
  TransformPlugin,
  TransformResult,
  TransformArgs,
  Plugin,
  PluginContext,
  Asset,
};

/** Identity helper for typed `unibits.config.ts` files. */
export function defineConfig(config: UserConfig): UserConfig {
  return config;
}
