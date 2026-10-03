import type { FrameworkName, PackageJSON } from '../types.js';

const ALL: FrameworkName[] = ['vue', 'react', 'solid'];

/**
 * A1/A2 — Framework auto detection.
 * Reads package.json dependencies / devDependencies and activates the matching
 * adapters. Multiple matches activate multi-framework mode.
 */
export function detectFrameworks(pkgJson: PackageJSON): FrameworkName[] {
  const deps = {
    ...(pkgJson.dependencies ?? {}),
    ...(pkgJson.devDependencies ?? {}),
  };
  const found: FrameworkName[] = [];
  if (deps.vue) found.push('vue');
  if (deps.react || deps['react-dom']) found.push('react');
  if (deps['solid-js']) found.push('solid');
  return found;
}

export function detectFrameworksFromLock(deps: Record<string, string> = {}): FrameworkName[] {
  return detectFrameworks({ dependencies: deps });
}

/** Human readable detection report, used by the CLI. */
export function describeFrameworks(frameworks: FrameworkName[]): string {
  if (frameworks.length === 0) return 'none';
  return frameworks.join(' + ');
}

export function isMultiFramework(frameworks: FrameworkName[]): boolean {
  return frameworks.length > 1;
}

export const FRAMEWORK_ORDER: FrameworkName[] = ALL;
