import { access, readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';
import type {
  CliOptions,
  FrameworkName,
  Mode,
  ResolvedConfig,
  UserConfig,
} from '../types.js';
import { logger } from './logger.js';

export const CONFIG_FILES = [
  'unibits.config.ts',
  'unibits.config.mts',
  'unibits.config.js',
  'unibits.config.mjs',
  'unibits.config.cjs',
] as const;

export const DEFAULT_BROWSERS = ['> 0.5%', 'last 2 versions', 'not dead'];

export const DEFAULT_SHOWCASE = {
  title: 'UniBits Components',
  description: 'Animated UI components for Vue, React & Solid',
  theme: { primaryColor: '#00ffa3', darkMode: true },
  categories: [
    { name: 'Backgrounds', icon: 'bg' },
    { name: 'Text Animations', icon: 'text' },
    { name: 'Interactive', icon: 'cursor' },
    { name: 'Transitions', icon: 'transition' },
    { name: 'Layouts', icon: 'layout' },
    { name: 'Cursors', icon: 'mouse' },
    { name: 'Components', icon: 'component' },
  ],
  defaultProps: {} as Record<string, Record<string, unknown>>,
};

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function readPackageJson(cwd: string): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(resolve(cwd, 'package.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Load a user config file. `.ts`/`.mts` files are bundled on the fly with
 * esbuild (in-memory) so no separate loader dependency is required.
 */
export async function loadConfig(cwd: string): Promise<UserConfig | undefined> {
  for (const name of CONFIG_FILES) {
    const path = resolve(cwd, name);
    if (!(await fileExists(path))) continue;
    logger.debug(`loading config ${name}`);
    if (name.endsWith('.ts') || name.endsWith('.mts')) {
      const bundled = await esbuild.build({
        entryPoints: [path],
        bundle: true,
        write: false,
        format: 'esm',
        platform: 'node',
        target: 'node18',
        absWorkingDir: cwd,
        logLevel: 'silent',
        external: ['unibits'],
      });
      const code = bundled.outputFiles[0].text;
      const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
      const mod = (await import(url)) as { default?: UserConfig };
      return mod.default ?? {};
    }
    // .js/.mjs/.cjs — import directly (cjs is handled via Node interop)
    const mod = (await import(`${pathToFileURL(path).href}?t=${Date.now()}`)) as {
      default?: UserConfig;
    };
    return mod.default ?? {};
  }
  return undefined;
}

export async function detectEntry(cwd: string): Promise<string> {
  const candidates = [
    'src/index.html',
    'src/index.ts',
    'src/index.tsx',
    'src/index.js',
    'src/index.jsx',
    'src/main.ts',
    'src/main.tsx',
    'src/main.js',
    'src/main.jsx',
    'index.html',
    'index.ts',
    'index.tsx',
  ];
  for (const c of candidates) {
    if (await fileExists(resolve(cwd, c))) return c;
  }
  throw new Error(
    'No entry point found. Create src/index.html or src/index.ts, or pass an entry explicitly.',
  );
}

function normalizeFramework(value: UserConfig['framework'], cli?: CliOptions['framework']): ResolvedConfig['framework'] {
  const chosen = cli ?? value ?? 'auto';
  if (chosen === 'auto') return 'auto';
  const list = Array.isArray(chosen) ? chosen : [chosen];
  return [...new Set(list)];
}

export async function resolveConfig(
  cli: CliOptions = {},
  cwd: string = process.cwd(),
): Promise<ResolvedConfig> {
  const user = (await loadConfig(cwd)) ?? {};
  const mode: Mode = cli.lib || process.env.NODE_ENV === 'production' ? 'production' : 'development';

  const entry = cli.entry
    ? resolve(cwd, cli.entry)
    : user.entry
      ? resolve(cwd, user.entry)
      : await detectEntry(cwd);

  const outDir = cli.outDir ? resolve(cwd, cli.outDir) : resolve(cwd, user.outDir ?? 'dist');

  const publicDir = resolve(cwd, user.publicDir ?? 'public');

  const alias = { ...user.alias };
  const proxies = user.proxy ?? {};
  const browsers = user.browsers ?? DEFAULT_BROWSERS;
  const plugins = user.plugins ?? [];

  return {
    cwd,
    mode,
    entry,
    outDir,
    port: cli.port ?? user.port ?? 3000,
    publicDir,
    framework: normalizeFramework(user.framework, cli.framework),
    alias,
    proxy: proxies,
    browsers,
    plugins,
    federation: user.federation,
    showcase: { ...DEFAULT_SHOWCASE, ...user.showcase, theme: { ...DEFAULT_SHOWCASE.theme, ...user.showcase?.theme } },
    minify: user.minify ?? mode === 'production',
    sourcemap: user.sourcemap ?? mode !== 'production',
    cacheDir: resolve(cwd, user.cacheDir ?? '.cache'),
    watchDirs: (user.watchDirs ?? []).map((d) => (isAbsolute(d) ? d : resolve(cwd, d))),
    host: cli.host ?? 'localhost',
    https: cli.https ?? false,
  };
}
