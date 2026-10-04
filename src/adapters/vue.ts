import { createHash } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { parse, compileScript, compileTemplate, compileStyle } from '@vue/compiler-sfc';
import type { FrameworkAdapter } from './interface.js';
import type { TransformPlugin, TransformArgs, TransformPluginContext } from './transform.js';
import { formatCodeFrame } from '../utils/codeframe.js';

interface CompilerErrorLike {
  message?: string;
  loc?: { start?: { line?: number; column?: number } };
}

function describeCompilerErrors(label: string, filename: string, source: string, errors: unknown[]): string {
  const parts = errors.map((raw) => {
    const e = raw as CompilerErrorLike;
    const message = typeof raw === 'string' ? raw : (e.message ?? String(raw));
    const line = e.loc?.start?.line;
    const column = e.loc?.start?.column;
    if (line == null) return `  ${message}`;
    const frame = formatCodeFrame(source, line, column);
    return `  ${message}\n  ${filename}:${line}${column != null ? ':' + column : ''}\n${frame}`;
  });
  return `[@unibits/vue] ${label} error in ${filename}:\n` + parts.join('\n');
}

export function hashId(source: string, length = 8): string {
  return createHash('sha256').update(source).digest('hex').slice(0, length);
}

/** <style lang="…"> → the npm package that provides the preprocessor. */
const PREPROCESSOR_PKGS: Record<string, string> = {
  scss: 'sass',
  sass: 'sass',
  less: 'less',
  styl: 'stylus',
  stylus: 'stylus',
};

/**
 * Ensure the requested style preprocessor is installed, returning the language
 * to hand to @vue/compiler-sfc. Fails fast with an actionable message instead
 * of the compiler's cryptic "Cannot find module" from deep inside.
 */
function assertPreprocessor(lang: string | undefined, filename: string): string | undefined {
  if (!lang || lang === 'css') return undefined;
  const pkg = PREPROCESSOR_PKGS[lang];
  if (!pkg) {
    throw new Error(
      `[@unibits/vue] unsupported <style lang="${lang}"> in ${filename}.\n` +
        `  Supported languages: css, scss, sass, less, stylus.`,
    );
  }
  const require = createRequire(filename);
  try {
    require.resolve(pkg);
  } catch {
    throw new Error(
      `[@unibits/vue] <style lang="${lang}"> in ${filename} requires the "${pkg}" package.\n` +
        `  Install it with: npm i -D ${pkg}`,
    );
  }
  return lang;
}

/**
 * Compile a single-file component into a self-contained ESM module.
 * The result is ready to be handed to the bundler (esbuild) for tree-shaking
 * and minification.
 */
export function compileVueSfc(
  filename: string,
  code: string,
): {
  js: string;
  styles: Array<{ id: string; code: string }>;
} {
  const { descriptor, errors } = parse(code, { filename });
  if (errors.length > 0) {
    throw new Error(describeCompilerErrors('parse', filename, code, errors));
  }

  const id = hashId(filename);
  const hasScoped = descriptor.styles.some((s) => s.scoped);
  const scopeId = hasScoped ? `data-v-${id}` : undefined;

  // --- script ----------------------------------------------------------
  const scriptResult = descriptor.script || descriptor.scriptSetup ? compileScript(descriptor, { id }) : null;
  let scriptCode: string;
  if (scriptResult) {
    scriptCode = scriptResult.content;
    // compileScript emits a top-level `export default {...}` statement; convert
    // it to a named binding so we can attach render / scopeId before the final
    // export. Anchor at line start so string literals containing the text
    // "export default" inside user code are never rewritten.
    const rewritten = scriptCode.replace(/^export\s+default\s+/m, 'const _sfc_main = ');
    if (rewritten === scriptCode) {
      throw new Error(
        `[@unibits/vue] internal error: could not locate the default export in compiled output of ${filename}`,
      );
    }
    scriptCode = rewritten;
  } else {
    scriptCode = 'const _sfc_main = {}';
  }

  // --- template ---------------------------------------------------------
  let renderCode = '';
  if (descriptor.template) {
    const tpl = compileTemplate({
      id,
      filename,
      source: descriptor.template.content,
      scoped: hasScoped,
      compilerOptions: {
        scopeId,
        bindingMetadata: scriptResult?.bindings,
      },
    });
    if (tpl.errors.length > 0) {
      throw new Error(describeCompilerErrors('template', filename, descriptor.template.content, tpl.errors));
    }
    renderCode = tpl.code.replace(/\bexport\s+function\s+render\b/, 'function render');
  }

  // --- styles -----------------------------------------------------------
  const styles: Array<{ id: string; code: string }> = [];
  const styleImports: string[] = [];
  descriptor.styles.forEach((style, index) => {
    if (style.src) {
      throw new Error(
        `[@unibits/vue] <style src="${style.src}"> in ${filename} is not supported.\n` +
          `  Inline the CSS directly in the .vue file or move it to a separate .css file and import it.`,
      );
    }
    const compiled = compileStyle({
      id,
      filename,
      source: style.content,
      scoped: style.scoped,
      preprocessLang: assertPreprocessor(style.lang, filename) as never,
    });
    if (compiled.errors.length > 0) {
      throw new Error(
        `[@unibits/vue] style error in ${filename}:\n` +
          compiled.errors.map((e) => (typeof e === 'string' ? e : (e.message ?? String(e)))).join('\n'),
      );
    }
    const styleId = `${id}-${index}`;
    styles.push({ id: styleId, code: compiled.code });
    styleImports.push(`import "virtual:unibits-style:${styleId}"`);
  });

  const js = [
    scriptCode,
    '',
    renderCode,
    '',
    styleImports.join('\n'),
    styleImports.length ? '' : '',
    renderCode ? `_sfc_main.render = render` : '',
    `_sfc_main.__scopeId = ${JSON.stringify(scopeId)}`,
    `_sfc_main.__file = ${JSON.stringify(filename)}`,
    `_sfc_main.__hmrId = ${JSON.stringify(id)}`,
    '',
    'export default _sfc_main',
    '',
  ]
    .filter((line, i, arr) => !(line === '' && i === arr.length - 1))
    .join('\n');

  return { js, styles };
}

class VueTransformPlugin implements TransformPlugin {
  name = 'unibits:vue-sfc';
  filter = /\.vue$/;

  async transform({ path, code }: TransformArgs, ctx: TransformPluginContext) {
    const { js, styles } = compileVueSfc(path, code);
    for (const s of styles) ctx.registerStyle(s.id, s.code);
    return { code: js, loader: 'js' };
  }
}

export class VueAdapter implements FrameworkAdapter {
  name = 'vue' as const;

  detect(pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }): boolean {
    return !!(pkg.dependencies?.vue || pkg.devDependencies?.vue);
  }

  getTransformPlugins(
    _config: import('../types.js').ResolvedConfig,
    _frameworks: import('../types.js').FrameworkName[],
  ): TransformPlugin[] {
    return [new VueTransformPlugin()];
  }

  setupHMR(ctx: import('../types.js').DevContext): void {
    // Vue HMR works at the bundler level: the SFC module is registered with a
    // __hmrId and @vue/runtime-core's HMR API performs component hot-replacement
    // while preserving reactive state. The client runtime (injected by the dev
    // server) accepts updates for modules with an accept callback.
    ctx.send({ type: 'connected', framework: 'vue' });
  }

  async ssrRender(app: unknown, _url: string): Promise<string> {
    // Lazy-load so the consuming project does not need vue installed unless SSR is used.
    const { renderToString } = await import('vue/server-renderer');
    return renderToString(app as never);
  }

  typeCheck(options: { cwd: string; onMessage(message: string): void }): ChildProcess {
    const child = spawn('vue-tsc', ['--noEmit', '--watch'], {
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
        const { compileVueSfc } = await import('./vue.js');
        return compileVueSfc('Component.vue', code).js;
      },
      mount(el: HTMLElement, compiledCode: string, props: Record<string, unknown>): () => void {
        // Evaluated inside the sandbox iframe which preloads the Vue runtime.
        const sandbox = (globalThis as Record<string, unknown>).__unibits_sandbox as
          { mountVue(el: HTMLElement, code: string, props: unknown): () => void } | undefined;
        if (!sandbox?.mountVue) throw new Error('Vue sandbox runtime not initialized');
        return sandbox.mountVue(el, compiledCode, props);
      },
      unmount(): void {
        const sandbox = (globalThis as Record<string, unknown>).__unibits_sandbox as { unmountAll(): void } | undefined;
        sandbox?.unmountAll();
      },
    };
  }
}
