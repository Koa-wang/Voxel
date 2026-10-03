import type { ChildProcess } from 'node:child_process';
import type { Server } from 'node:http';

export type FrameworkName = 'vue' | 'react' | 'solid';

export type Mode = 'development' | 'production';

export interface PackageJSON {
  name?: string;
  version?: string;
  main?: string;
  module?: string;
  types?: string;
  exports?: Record<string, unknown>;
  sideEffects?: boolean | string[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  workspaces?: string[] | { packages?: string[] };
}

export interface AliasMap {
  [key: string]: string;
}

export type ProxyTarget =
  | string
  | { target: string; ws?: boolean; changeOrigin?: boolean; rewrite?: (path: string) => string };

export interface ProxyConfig {
  [path: string]: ProxyTarget;
}

export interface FederationSharedConfig {
  singleton?: boolean;
  requiredVersion?: string;
  eager?: boolean;
}

export interface FederationConfig {
  name: string;
  filename?: string;
  remotes?: Record<string, string>;
  exposes?: Record<string, string>;
  shared?: Record<string, FederationSharedConfig>;
}

export interface ShowcaseCategory {
  name: string;
  icon?: string;
}

export interface ShowcaseConfig {
  title?: string;
  description?: string;
  theme?: {
    primaryColor?: string;
    darkMode?: boolean;
  };
  categories?: ShowcaseCategory[];
  defaultProps?: Record<string, Record<string, unknown>>;
}

/** User-facing plugin, part of the public API (see plugins/context.ts for full types). */
export type UniBitsPlugin = import('./plugins/context.js').Plugin;

export interface UserConfig {
  /** Entry point. Defaults to auto-detected src/index.html or src/index.ts */
  entry?: string;
  /** Output directory. Default dist/ */
  outDir?: string;
  /** Dev server port. Default 3000 */
  port?: number;
  /** Static assets directory. Default public/ */
  publicDir?: string;
  /** Framework selection. 'auto' (default) or explicit */
  framework?: 'auto' | FrameworkName | FrameworkName[];
  /** Path aliases, resolved against project root */
  alias?: AliasMap;
  /** Dev server proxy */
  proxy?: ProxyConfig;
  /** Browserslist targets for Lightning CSS autoprefixer */
  browsers?: string[];
  /** Plugin list */
  plugins?: UniBitsPlugin[];
  /** Module federation */
  federation?: FederationConfig;
  /** Showcase configuration */
  showcase?: ShowcaseConfig;
  /** Whether to minify output (production default true) */
  minify?: boolean;
  /** Whether to emit sourcemaps (dev default true) */
  sourcemap?: boolean;
  /** Cache directory. Default .cache */
  cacheDir?: string;
  /** Watch additional dirs for HMR (used by monorepo linking) */
  watchDirs?: string[];
}

export interface ResolvedConfig {
  cwd: string;
  mode: Mode;
  entry: string;
  outDir: string;
  port: number;
  publicDir: string;
  framework: 'auto' | FrameworkName[];
  alias: AliasMap;
  proxy: ProxyConfig;
  browsers: string[];
  plugins: UniBitsPlugin[];
  federation?: FederationConfig;
  showcase: ShowcaseConfig;
  minify: boolean;
  sourcemap: boolean;
  cacheDir: string;
  watchDirs: string[];
  host: string;
  https: boolean;
}

export interface CliOptions {
  entry?: string;
  outDir?: string;
  port?: number;
  framework?: 'auto' | FrameworkName | FrameworkName[];
  lib?: boolean;
  ssr?: boolean;
  routes?: string[];
  analyze?: boolean;
  noCache?: boolean;
  host?: string;
  https?: boolean;
  open?: boolean;
}

/** Context passed to adapters during dev server setup. */
export interface DevContext {
  config: ResolvedConfig;
  server: Server;
  /** Broadcast a JSON payload to every connected WebSocket client. */
  send(payload: unknown): void;
  /** Force a full page reload of all connected clients. */
  reload(): void;
  /** Resolve a file id to a URL path the browser can request. */
  urlFor(path: string): string;
}

export interface TypeCheckOptions {
  cwd: string;
  onMessage(message: string): void;
}

export interface ShowcaseRuntime {
  compile(code: string, framework: FrameworkName): Promise<string>;
  mount(el: HTMLElement, compiledCode: string, props: Record<string, unknown>): () => void;
  unmount(): void;
}

/** Shared context object given to every build. */
export interface BuildContext {
  config: ResolvedConfig;
  frameworks: FrameworkName[];
  isLib: boolean;
  isSSR: boolean;
  routes: string[];
}

/** Emitted by `src/core/build.ts` describing the result of a build. */
export interface BuildResult {
  outDir: string;
  outputFiles: string[];
  duration: number;
}

export type { ChildProcess };
