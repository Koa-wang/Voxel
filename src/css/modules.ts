import type { Plugin } from 'esbuild';
import type { ResolvedConfig } from '../types.js';
import { processCss } from './lightning.js';

export interface CssModulesTransform {
  css: string;
  exports: Record<string, string>;
}

/**
 * Compile a CSS Modules file and return the scoped CSS plus the class-name
 * mapping that gets exposed as a JS default export.
 */
export function transformCssModules(code: string, filename: string, config: ResolvedConfig): CssModulesTransform {
  const result = processCss(code, {
    filename,
    minify: false, // final minification happens post-build
    browsers: config.browsers,
    cssModules: true,
  });

  const exports: Record<string, string> = {};
  const raw = (result.exports ?? {}) as Record<string, { name?: string; isReferenced?: boolean; composes?: unknown }>;
  for (const [local, value] of Object.entries(raw)) {
    exports[local] = typeof value === 'string' ? value : (value.name ?? local);
  }
  return { css: result.code, exports };
}

/**
 * esbuild plugin that transforms `*.module.css` imports into JS modules
 * exporting the scoped class map, while emitting the scoped stylesheet.
 */
export function createCssModulesPlugin(config: ResolvedConfig, styles: Map<string, string>): Plugin {
  return {
    name: 'unibits:css-modules',
    setup(build) {
      build.onLoad({ filter: /\.module\.css$/ }, async (args) => {
        const { readFile } = await import('node:fs/promises');
        const { createHash } = await import('node:crypto');
        const code = await readFile(args.path, 'utf8');
        const { css, exports } = transformCssModules(code, args.path, config);
        const id = `module-${createHash('sha256').update(args.path).digest('hex').slice(0, 8)}`;
        styles.set(id, css);
        return {
          contents: `import "virtual:unibits-style:${id}";\nexport default ${JSON.stringify(exports)};`,
          loader: 'js',
        };
      });
    },
  };
}
