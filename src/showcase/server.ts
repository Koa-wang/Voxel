import { createServer, type ServerResponse } from 'node:http';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as esbuild from 'esbuild';
import type { FrameworkName, ResolvedConfig } from '../types.js';
import { compileShowcaseCode } from './compiler.js';
import { scanComponents } from './generator.js';
import { showcaseAppHtml } from './app.js';
import { sandboxHtml } from './sandbox/sandbox-manager.js';
import { logger } from '../core/logger.js';

const PKG_MAP: Record<string, string> = {
  vue: "export * from 'vue'; export { default } from 'vue';",
  react: "export * from 'react'; export { default } from 'react';",
  'react-jsx-runtime': "export * from 'react/jsx-runtime';",
  'react-dom-client': "export * from 'react-dom/client';",
  'solid-js': "export * from 'solid-js';",
  'solid-js-web': "export * from 'solid-js/web';",
  'solid-js-store': "export * from 'solid-js/store';",
};

async function bundlePackage(name: string, cwd: string): Promise<string | null> {
  const entry = PKG_MAP[name];
  if (!entry) return null;
  try {
    const result = await esbuild.build({
      stdin: { contents: entry, resolveDir: cwd, loader: 'js' },
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      target: ['es2020'],
      logLevel: 'silent',
    });
    return result.outputFiles[0].text;
  } catch {
    return null;
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolveBody(data));
    req.on('error', reject);
  });
}

/**
 * The component showcase dev server (`unibits showcase`).
 * Serves the SPA, component manifest, a compile endpoint and local ESM bundles
 * for the three framework runtimes.
 */
export async function serveShowcase(config: ResolvedConfig, port: number, buildOnly = false): Promise<void> {
  const componentsDir = resolve(config.cwd, 'components');
  const appHtml = showcaseAppHtml(config.showcase);

  let components: import('./generator.js').ComponentMeta[] = [];
  try {
    components = await scanComponents(componentsDir);
  } catch {
    components = [];
  }
  logger.info(`showcase: ${components.length} component(s) in ${componentsDir}`);

  if (buildOnly) {
    const { generateManifest } = await import('./generator.js');
    await generateManifest(componentsDir, config.outDir, config.showcase);
    logger.success('showcase manifest written');
    return;
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);

    if (pathname === '/' || pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(appHtml);
      return;
    }
    if (pathname === '/__unibits/sandbox') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(sandboxHtml());
      return;
    }
    if (pathname === '/__unibits/api/components') {
      sendJson(res, 200, components);
      return;
    }
    if (pathname === '/__unibits/compile' && req.method === 'POST') {
      try {
        const body = JSON.parse(await readBody(req)) as { code: string; framework: FrameworkName };
        const code = await compileShowcaseCode(body.code, body.framework);
        sendJson(res, 200, { code });
      } catch (err) {
        sendJson(res, 400, { error: (err as Error).message });
      }
      return;
    }
    if (pathname.startsWith('/__unibits/pkg/')) {
      const name = pathname.slice('/__unibits/pkg/'.length);
      const code = await bundlePackage(name, config.cwd);
      if (code == null) {
        sendJson(res, 404, { error: `Unknown package '${name}'` });
      } else {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' }).end(code);
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  });

  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, () => resolveListen());
  });
  logger.success(`showcase running at http://localhost:${port}`);
}
