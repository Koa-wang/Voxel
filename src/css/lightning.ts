import { browserslistToTargets, transform } from 'lightningcss';

export interface ProcessCssOptions {
  filename: string;
  minify: boolean;
  browsers: string[];
  cssModules?: boolean;
}

/**
 * A6 — Lightning CSS integration.
 * Used as the bottom engine for CSS parsing, autoprefixer (via browserslist
 * targets) and minification.
 */
export function processCss(
  code: string,
  { filename, minify, browsers, cssModules }: ProcessCssOptions,
): { code: string; exports?: Record<string, unknown> } {
  const result = transform({
    filename,
    code: Buffer.from(code),
    minify,
    targets: browserslistToTargets(browsers),
    errorRecovery: true,
    drafts: { customMedia: true },
    sourceMap: false,
    cssModules: cssModules ? { pattern: '[local]_[hash]' } : undefined,
  });
  return {
    code: result.code.toString(),
    exports: result.exports ? { ...result.exports } : undefined,
  };
}

export { browserslistToTargets };
