import { spawn, type ChildProcess } from 'node:child_process';
import * as esbuild from 'esbuild';
import type { FrameworkAdapter } from './interface.js';
import type { TransformPlugin } from './transform.js';
import { compileShowcaseCode } from '../showcase/compiler.js';

/**
 * React adapter.
 *
 * JSX/TSX compilation is performed by esbuild's native `jsx: 'automatic'`
 * transform (React 17+ runtime), which the build engine enables whenever the
 * React adapter is active. No per-file transform plugin is required for the
 * happy path; in multi-framework mode the Solid adapter takes precedence for
 * files that import from `solid-js`, everything else falls through to esbuild.
 */
export class ReactAdapter implements FrameworkAdapter {
  name = 'react' as const;

  detect(pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }): boolean {
    return !!(
      pkg.dependencies?.react ||
      pkg.dependencies?.['react-dom'] ||
      pkg.devDependencies?.react ||
      pkg.devDependencies?.['react-dom']
    );
  }

  getTransformPlugins(_config: import('../types.js').ResolvedConfig, _frameworks: import('../types.js').FrameworkName[]): TransformPlugin[] {
    // esbuild handles .jsx/.tsx via its automatic JSX runtime; a dedicated
    // plugin is only needed for Fast Refresh registrations (see setupHMR).
    return [];
  }

  setupHMR(ctx: import('../types.js').DevContext): void {
    // React Fast Refresh requires injecting $RefreshReg$ / $RefreshSig$ at
    // transform time plus the react-refresh runtime on the client. The dev
    // client injected by the dev server performs a lightweight refresh flow:
    // on update it re-imports the changed module and calls the refresh runtime
    // when available, otherwise it falls back to a full reload.
    ctx.send({ type: 'connected', framework: 'react' });
  }

  async ssrRender(app: unknown, _url: string): Promise<string> {
    const { renderToString } = await import('react-dom/server');
    return renderToString(app as never);
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
        return compileShowcaseCode(code, 'react');
      },
      mount(el: HTMLElement, compiledCode: string, props: Record<string, unknown>): () => void {
        const sandbox = (globalThis as Record<string, unknown>).__unibits_sandbox as
          | { mountReact(el: HTMLElement, code: string, props: unknown): () => void }
          | undefined;
        if (!sandbox?.mountReact) throw new Error('React sandbox runtime not initialized');
        return sandbox.mountReact(el, compiledCode, props);
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

export { esbuild };
