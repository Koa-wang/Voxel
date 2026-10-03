import { spawn, type ChildProcess } from 'node:child_process';
import * as babel from '@babel/core';
import tsPreset from '@babel/preset-typescript';
import solidPreset from 'babel-preset-solid';
import type { FrameworkAdapter } from './interface.js';
import type { TransformPlugin, TransformArgs, TransformPluginContext } from './transform.js';
import { compileShowcaseCode } from '../showcase/compiler.js';

const SOLID_IMPORT_RE = /from\s+['"](solid-js|solid-js\/web|solid-js\/store|solid-js\/dom|solid-js\/universal)['"]/;

/**
 * Compile a Solid JSX/TSX file into plain ESM using babel-preset-solid.
 * Solid's JSX compiles to fine-grained DOM instructions (createComponent /
 * insert / delegateEvents), not a virtual DOM — so it must never pass through
 * esbuild's React-oriented JSX transform.
 */
export async function compileSolidJsx(
  filename: string,
  code: string,
): Promise<string> {
  const result = await babel.transformAsync(code, {
    filename,
    babelrc: false,
    configFile: false,
    sourceMaps: false,
    presets: [
      [tsPreset, { isTSX: /\.tsx$/.test(filename), allExtensions: true, onlyRemoveTypeImports: true }],
      [solidPreset, { generate: 'dom', hydratable: false }],
    ],
    // Solid's preset must run its JSX plugin before TS strips types.
    parserOpts: { plugins: ['jsx', 'typescript'] },
  });
  if (!result?.code) throw new Error(`[@unibits/solid] failed to compile ${filename}`);
  return result.code;
}

class SolidTransformPlugin implements TransformPlugin {
  name = 'unibits:solid-jsx';
  filter = /\.(jsx|tsx)$/;

  constructor(private routeByImport: boolean) {}

  async transform({ path, code }: TransformArgs, _ctx: TransformPluginContext) {
    // Multi-framework routing (C5): when React is also active, only files
    // importing from solid-js are treated as Solid; everything else falls
    // through to esbuild's React JSX transform. In a Solid-only project every
    // JSX/TSX file is Solid.
    if (this.routeByImport && !SOLID_IMPORT_RE.test(code)) return null;
    const compiled = await compileSolidJsx(path, code);
    return { code: compiled, loader: 'js' };
  }
}

export class SolidAdapter implements FrameworkAdapter {
  name = 'solid' as const;

  detect(pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }): boolean {
    return !!(pkg.dependencies?.['solid-js'] || pkg.devDependencies?.['solid-js']);
  }

  getTransformPlugins(_config: import('../types.js').ResolvedConfig, frameworks: import('../types.js').FrameworkName[]): TransformPlugin[] {
    return [new SolidTransformPlugin(frameworks.includes('react'))];
  }

  setupHMR(ctx: import('../types.js').DevContext): void {
    // solid-refresh follows the same accept/re-render flow as React Fast
    // Refresh. The dev client handles updates and preserves signal state where
    // the solid-refresh runtime is available; otherwise it reloads.
    ctx.send({ type: 'connected', framework: 'solid' });
  }

  async ssrRender(app: unknown, _url: string): Promise<string> {
    const { renderToString } = await import('solid-js/web');
    return renderToString(() => app as never);
  }

  typeCheck(options: { cwd: string; onMessage(message: string): void }): ChildProcess {
    const child = spawn('tsc', ['--noEmit', '--watch'], {
      cwd: options.cwd,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', (d: Buffer) => options.onMessage(d.toString()));
    child.stderr?.on('data', (d: Buffer) => options.onMessage(d.toString()));
    return child;
  }

  getShowcaseRuntime(): import('../types.js').ShowcaseRuntime {
    return {
      async compile(code: string) {
        return compileShowcaseCode(code, 'solid');
      },
      mount(el: HTMLElement, compiledCode: string, props: Record<string, unknown>): () => void {
        const sandbox = (globalThis as Record<string, unknown>).__unibits_sandbox as
          | { mountSolid(el: HTMLElement, code: string, props: unknown): () => void }
          | undefined;
        if (!sandbox?.mountSolid) throw new Error('Solid sandbox runtime not initialized');
        return sandbox.mountSolid(el, compiledCode, props);
      },
      unmount(): void {
        const sandbox = (globalThis as Record<string, unknown>).__unibits_sandbox as
          | { unmountAll(): void }
          | undefined;
        sandbox?.unmountAll();
      },
    };
  }
}
