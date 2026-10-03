import type { ChildProcess } from 'node:child_process';
import type {
  DevContext,
  FrameworkName,
  PackageJSON,
  ResolvedConfig,
  ShowcaseRuntime,
  TypeCheckOptions,
} from '../types.js';
import type { TransformPlugin } from './transform.js';

/**
 * Unified adapter contract. Every supported framework implements this
 * interface so the build engine, dev server and showcase can treat them as
 * first-class citizens without any framework-specific branching.
 */
export interface FrameworkAdapter {
  name: FrameworkName;

  /** Detect whether the current project uses this framework. */
  detect(pkgJson: PackageJSON): boolean;

  /** Transform plugins this framework contributes to the unified pipeline. */
  getTransformPlugins(config: ResolvedConfig, frameworks: FrameworkName[]): TransformPlugin[];

  /** Register framework-specific HMR handling. */
  setupHMR?(ctx: DevContext): void;

  /** Framework-specific server-side render function. */
  ssrRender?(app: unknown, url: string): Promise<string>;

  /** Launch framework-specific type checking (tsc / vue-tsc). */
  typeCheck?(options: TypeCheckOptions): ChildProcess;

  /** Runtime used by the component showcase sandbox. */
  getShowcaseRuntime(): ShowcaseRuntime;
}
