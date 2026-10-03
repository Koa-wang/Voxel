import type { FrameworkName } from '../types.js';
import * as esbuild from 'esbuild';
import { compileVueSfc } from '../adapters/vue.js';
import { compileSolidJsx } from '../adapters/solid.js';

/**
 * Server-side showcase compiler. Compiles a component snippet into a plain ESM
 * module for the requested framework. The result is evaluated inside the
 * sandbox iframe (which preloads the matching framework runtime via an import
 * map).
 */
export async function compileShowcaseCode(
  code: string,
  framework: FrameworkName,
): Promise<string> {
  switch (framework) {
    case 'vue':
      return compileVueSfc('Component.vue', code).js;
    case 'react': {
      const result = await esbuild.transform(code, {
        loader: 'tsx',
        jsx: 'automatic',
        format: 'esm',
        target: 'es2020',
      });
      return result.code;
    }
    case 'solid':
      return compileSolidJsx('Component.tsx', code);
    default:
      throw new Error(`Unknown showcase framework: ${String(framework)}`);
  }
}
