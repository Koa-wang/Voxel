import type { ChildProcess } from 'node:child_process';
import { createServer as createHttpServer, type Server, type ServerResponse } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { existsSync, readFileSync, watch as fsWatch } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import * as esbuild from 'esbuild';
import { WebSocketServer, type WebSocket } from 'ws';
import { resolveConfig, readPackageJson } from './config.js';
import { resolveFrameworks, createAdapters } from '../adapters/index.js';
import { createBasePlugins, resolveHtmlEntry } from './build.js';
import { logger } from './logger.js';
import { HMR_CLIENT, ERROR_OVERLAY, HMR_INJECT } from './client.js';
import { resolveHttpsCredentials } from '../utils/https.js';
import { openBrowser } from '../utils/open-browser.js';
import { formatErrorWithFrame } from '../utils/codeframe.js';
import type { CliOptions, DevContext, FrameworkName, ResolvedConfig } from '../types.js';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.map': 'application/json; charset=utf-8',
};

function mime(path: string): string {
  return MIME[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

async function serveFile(res: ServerResponse, path: string): Promise<void> {
  try {
    const data = await readFile(path);
    res.writeHead(200, { 'Content-Type': mime(path), 'Content-Length': data.length });
    res.end(data);
  } catch {
    res.writeHead(404).end('Not found');
  }
}

interface ProxyEntry {
  prefix: string;
  middleware: (req: import('node:http').IncomingMessage, res: ServerResponse, next: () => void) => void;
  upgrade?: (req: import('node:http').IncomingMessage, socket: unknown, head: Buffer) => void;
}

async function setupProxies(config: ResolvedConfig): Promise<ProxyEntry[]> {
  const entries: ProxyEntry[] = [];
  if (Object.keys(config.proxy).length === 0) return entries;

  let createProxyMiddleware: typeof import('http-proxy-middleware').createProxyMiddleware;
  try {
    createProxyMiddleware = (await import('http-proxy-middleware')).createProxyMiddleware;
  } catch (err) {
    logger.warn(`http-proxy-middleware not installed: ${(err as Error).message}`);
    return entries;
  }

  for (const [prefix, raw] of Object.entries(config.proxy)) {
    const opts = typeof raw === 'string' ? { target: raw } : { ...raw };
    const proxy = createProxyMiddleware({
      target: opts.target,
      changeOrigin: true,
      ws: opts.ws ?? false,
    } as never);
    entries.push({
      prefix,
      middleware: proxy as never,
      upgrade: opts.ws ? (proxy as unknown as { upgrade: never }).upgrade : undefined,
    });
    logger.info(`proxy ${prefix} → ${opts.target}`);
  }
  return entries;
}

function startTypeCheck(config: ResolvedConfig, adapters: ReturnType<typeof createAdapters>): ChildProcess | null {
  if (!existsSync(resolve(config.cwd, 'tsconfig.json'))) return null;
  const checker = adapters.find((a) => a.typeCheck);
  if (!checker) return null;
  logger.info('starting non-blocking type checking…');
  return checker.typeCheck!({
    cwd: config.cwd,
    onMessage: (message) => process.stdout.write(message),
  });
}

interface BuildFailureLike {
  errors?: { text: string; location?: { file: string; line: number; column: number; lineText?: string } }[];
  message?: string;
}

/**
 * B1 — Dev server with HMR.
 * esbuild compiles in-memory; a native Node HTTP server serves HTML, bundled
 * assets, static files and proxies; a WebSocket channel pushes reload/update
 * events and compile errors to the browser overlay.
 */
export async function dev(cli: CliOptions = {}, cwd: string = process.cwd()): Promise<void> {
  const config = await resolveConfig(cli, cwd);
  const pkg = await readPackageJson(cwd);
  const frameworks: FrameworkName[] = resolveFrameworks(pkg, config.framework);
  const adapters = createAdapters(frameworks);

  const styles = new Map<string, string>();
  const transformPlugins = adapters.flatMap((a) => a.getTransformPlugins(config, frameworks));
  const { jsEntry, html } = await resolveHtmlEntry(config);
  const outName = basename(jsEntry).replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '');

  const esbuildContext = await esbuild.context({
    entryPoints: [jsEntry],
    bundle: true,
    write: false,
    outdir: config.outDir,
    format: 'esm',
    splitting: true,
    platform: 'browser',
    target: ['es2020'],
    sourcemap: true,
    metafile: true,
    define: { 'process.env.NODE_ENV': JSON.stringify('development') },
    resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.vue', '.mjs', '.cjs', '.css', '.json'],
    jsx: frameworks.includes('react') ? 'automatic' : undefined,
    logLevel: 'silent',
    plugins: createBasePlugins(config, frameworks, styles, transformPlugins),
  });

  let outputMap = new Map<string, Buffer>();

  function collectOutput(result: esbuild.BuildResult): Map<string, Buffer> {
    return new Map(
      result.outputFiles?.map((f) => {
        const rel = f.path.replace(config.outDir, '').replace(/^[/\\]/, '');
        return ['/' + rel, Buffer.from(f.contents)];
      }) ?? [],
    );
  }

  interface OutputDiff {
    anyChange: boolean;
    /** True when only .css outputs changed — eligible for hot CSS swap. */
    onlyCss: boolean;
    cssChanged: string[];
  }

  function diffOutputs(prev: Map<string, Buffer>, next: Map<string, Buffer>): OutputDiff {
    const cssChanged: string[] = [];
    let jsChanged = false;
    if (prev.size !== next.size) {
      jsChanged = true;
    } else {
      for (const [path, buf] of next) {
        const old = prev.get(path);
        if (!old || !old.equals(buf)) {
          if (path.endsWith('.css')) cssChanged.push(path);
          else jsChanged = true;
        }
      }
      // A removed .css file also counts as a css change; removed js files as js.
      for (const path of prev.keys()) {
        if (!next.has(path)) {
          if (path.endsWith('.css')) cssChanged.push(path);
          else jsChanged = true;
        }
      }
    }
    const anyChange = jsChanged || cssChanged.length > 0;
    return { anyChange, onlyCss: !jsChanged && cssChanged.length > 0, cssChanged };
  }

  function handleBuildError(err: unknown): void {
    const e = err as BuildFailureLike;
    const messages = e?.errors?.map((item) => {
      let source: string | undefined;
      if (item.location?.file) {
        try {
          source = readFileSync(resolve(config.cwd, item.location.file), 'utf8');
        } catch {
          source = undefined;
        }
      }
      return formatErrorWithFrame(item.text, item.location, source);
    }) ?? [e?.message ?? String(err)];
    logger.error('build failed:\n' + messages.join('\n'));
  }

  outputMap = await esbuildContext.rebuild().then(collectOutput, (err) => {
    handleBuildError(err);
    return outputMap;
  });
  logger.info(`compiled ${outputMap.size} file(s)`);

  const proxies = await setupProxies(config);
  const sockets = new Set<WebSocket>();
  const broadcast = (payload: unknown): void => {
    const data = JSON.stringify(payload);
    for (const socket of sockets) if (socket.readyState === socket.OPEN) socket.send(data);
  };

  const requestHandler = async (req: import('node:http').IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);

    for (const proxy of proxies) {
      if (pathname === proxy.prefix || pathname.startsWith(proxy.prefix)) {
        proxy.middleware(req, res, () => undefined);
        return;
      }
    }

    if (pathname === '/__unibits/hmr-client.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(HMR_CLIENT);
      return;
    }
    if (pathname === '/__unibits/error-overlay.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(ERROR_OVERLAY);
      return;
    }

    if (existsSync(resolve(config.publicDir, pathname.slice(1)))) {
      await serveFile(res, resolve(config.publicDir, pathname.slice(1)));
      return;
    }

    const file = outputMap.get(pathname);
    if (file) {
      res.writeHead(200, { 'Content-Type': mime(pathname) }).end(file);
      return;
    }

    if (html && (pathname === '/' || pathname === `/${basename(html.path)}`)) {
      let content = html.content;
      content = content.replace(html.src, `/${outName}.js`);
      // Inject all emitted CSS files into the dev HTML head so the HMR client
      // can swap them in-place when only styles changed.
      const cssLinks = Array.from(outputMap.keys())
        .filter((p) => p.endsWith('.css'))
        .map((p) => `<link rel="stylesheet" href="${p}">`)
        .join('\n');
      content = content.replace('</head>', `${cssLinks}\n${HMR_INJECT}\n</head>`);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(content);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  };

  const httpsCredentials = await resolveHttpsCredentials(config);
  const server: Server = httpsCredentials
    ? createHttpsServer({ key: httpsCredentials.key, cert: httpsCredentials.cert }, requestHandler)
    : createHttpServer(requestHandler);

  const wss = new WebSocketServer({ server, path: '/__unibits_hmr' });
  wss.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.send(JSON.stringify({ type: 'connected', framework: frameworks.length === 1 ? frameworks[0] : 'multi' }));
  });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    for (const proxy of proxies) {
      if (proxy.upgrade && (url.pathname === proxy.prefix || url.pathname.startsWith(proxy.prefix))) {
        proxy.upgrade(req, socket, head);
        return;
      }
    }
    socket.destroy();
  });

  // Watch source directories and rebuild in-memory on change, pushing a reload
  // to every connected client.
  let rebuilding = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const scheduleRebuild = (): void => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (rebuilding) return;
      rebuilding = true;
      try {
        const result = await esbuildContext.rebuild();
        const next = collectOutput(result);
        const diff = diffOutputs(outputMap, next);
        outputMap = next;
        logger.info(`rebuilt ${result.outputFiles?.length ?? 0} file(s)`);
        if (!diff.anyChange) {
          // Identical output → no need to disturb the client.
        } else if (diff.onlyCss) {
          broadcast({ type: 'css-update', files: diff.cssChanged });
        } else {
          broadcast({ type: 'full-reload' });
        }
      } catch (err) {
        handleBuildError(err);
        broadcast({ type: 'error', message: (err as Error).message ?? String(err) });
      } finally {
        rebuilding = false;
      }
    }, 150);
  };

  const watchDirs = [resolve(config.cwd, 'src'), ...config.watchDirs].filter((d) => existsSync(d));
  for (const dir of watchDirs) {
    try {
      fsWatch(dir, { recursive: true }, scheduleRebuild);
    } catch {
      // ignore non-watchable directories
    }
  }

  const devContext: DevContext = {
    config,
    server,
    send: broadcast,
    reload: () => broadcast({ type: 'full-reload' }),
    urlFor: (p) => '/' + p.replace(config.cwd, '').replace(/^[/\\]/, ''),
  };
  for (const adapter of adapters) adapter.setupHMR?.(devContext);

  const typeCheckProcess = startTypeCheck(config, adapters);

  const port = await listen(server, config.port, config.host);
  const scheme = httpsCredentials ? 'https' : 'http';
  const displayHost = config.host === '0.0.0.0' ? 'localhost' : config.host;
  const serverUrl = `${scheme}://${displayHost}:${port}`;
  logger.success(`dev server running at ${serverUrl}`);
  if (config.open) openBrowser(serverUrl);

  const shutdown = () => {
    logger.info('shutting down…');
    typeCheckProcess?.kill('SIGTERM');
    esbuildContext.dispose().finally(() => process.exit(0));
    server.close();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

function listen(server: Server, startPort: number, host: string): Promise<number> {
  return new Promise((resolveListen, reject) => {
    let port = startPort;
    const onError = (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        logger.warn(`port ${port} in use, trying ${port + 1}`);
        port++;
        server.listen(port, host);
      } else {
        reject(err);
      }
    };
    server.once('error', onError);
    server.listen(port, host, () => {
      server.removeListener('error', onError);
      resolveListen(port);
    });
  });
}
