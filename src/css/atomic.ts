import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { logger } from '../core/logger.js';

export type AtomicCssKind = 'tailwind' | 'unocss' | null;

export interface AtomicCssProcessor {
  kind: AtomicCssKind;
  active: boolean;
  process(code: string, filename: string): Promise<string>;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * B6 — Atomic CSS auto-detection.
 * Detects tailwind.config.* / uno.config.* / unocss.config.* at the project
 * root and wires up the matching PostCSS plugin. Never overwrites an existing
 * PostCSS config; if the runtime packages are missing it warns with the
 * install command.
 */
export async function detectAtomicCss(cwd: string): Promise<AtomicCssKind> {
  const tailwindConfigs = ['tailwind.config.js', 'tailwind.config.ts', 'tailwind.config.cjs', 'tailwind.config.mjs'];
  const unoConfigs = ['uno.config.js', 'uno.config.ts', 'unocss.config.js', 'unocss.config.ts'];

  for (const name of tailwindConfigs) {
    if (await exists(resolve(cwd, name))) return 'tailwind';
  }
  for (const name of unoConfigs) {
    if (await exists(resolve(cwd, name))) return 'unocss';
  }
  return null;
}

export async function createAtomicCssProcessor(cwd: string): Promise<AtomicCssProcessor> {
  const kind = await detectAtomicCss(cwd);
  if (!kind) return { kind: null, active: false, process: async (c) => c };

  const hasPostcss = await (async () => {
    try {
      await import('postcss');
      return true;
    } catch {
      return false;
    }
  })();

  if (!hasPostcss) {
    logger.warn(
      `Detected ${kind} config but 'postcss' is not installed. ` +
        `Install it with: npm install -D postcss ${kind === 'tailwind' ? '@tailwindcss/postcss' : '@unocss/postcss'}`,
    );
    return { kind, active: false, process: async (c) => c };
  }

  if (kind === 'tailwind') {
    try {
      const postcss = (await import('postcss')).default;
      const tailwind = (await import('@tailwindcss/postcss')).default;
      return {
        kind,
        active: true,
        async process(code, filename) {
          const result = await postcss([tailwind()]).process(code, { from: filename });
          return result.css;
        },
      };
    } catch {
      logger.warn(
        'Detected tailwind config but @tailwindcss/postcss is missing. Run: npm install -D @tailwindcss/postcss',
      );
      return { kind, active: false, process: async (c) => c };
    }
  }

  try {
    const postcss = (await import('postcss')).default;
    const unocss = (await import('@unocss/postcss')).default;
    return {
      kind,
      active: true,
      async process(code, filename) {
        const result = await postcss([unocss()]).process(code, { from: filename });
        return result.css;
      },
    };
  } catch {
    logger.warn('Detected uno config but @unocss/postcss is missing. Run: npm install -D @unocss/postcss');
    return { kind, active: false, process: async (c) => c };
  }
}
