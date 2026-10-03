import type { FrameworkName, PackageJSON, ResolvedConfig } from '../types.js';
import type { FrameworkAdapter } from './interface.js';
import { VueAdapter } from './vue.js';
import { ReactAdapter } from './react.js';
import { SolidAdapter } from './solid.js';
import { detectFrameworks } from './detect.js';

export { VueAdapter } from './vue.js';
export { ReactAdapter } from './react.js';
export { SolidAdapter } from './solid.js';
export { detectFrameworks, describeFrameworks, isMultiFramework } from './detect.js';
export type { FrameworkAdapter } from './interface.js';
export type { TransformPlugin, TransformResult, TransformArgs } from './transform.js';

const REGISTRY: Record<FrameworkName, () => FrameworkAdapter> = {
  vue: () => new VueAdapter(),
  react: () => new ReactAdapter(),
  solid: () => new SolidAdapter(),
};

/**
 * Resolve the active framework list for a project.
 * Explicit config wins over auto-detection; 'auto' reads package.json.
 */
export function resolveFrameworks(
  pkg: PackageJSON,
  configured: ResolvedConfig['framework'],
): FrameworkName[] {
  if (configured !== 'auto') return configured;
  const detected = detectFrameworks(pkg);
  if (detected.length === 0) {
    // Nothing detected — warn and default to a "framework-less" build that
    // still works for plain JS/TS. The CLI surfaces a helpful install hint.
    return [];
  }
  return detected;
}

export function createAdapters(frameworks: FrameworkName[]): FrameworkAdapter[] {
  return frameworks.map((f) => REGISTRY[f]());
}
