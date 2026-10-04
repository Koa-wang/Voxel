import { createServer, type ServerResponse } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import * as esbuild from 'esbuild';
import type { FrameworkName, ResolvedConfig } from '../types.js';
import { compileShowcaseCode } from './compiler.js';
import { scanComponents, type ComponentMeta } from './generator.js';
import { showcaseAppHtml } from './app.js';
import { sandboxHtml } from './sandbox/sandbox-manager.js';
import { logger } from '../core/logger.js';
import { openBrowser } from '../utils/open-browser.js';

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

/**
 * Emit a fully static showcase site into config.outDir:
 *   index.html                     — SPA wired for static mode
 *   __unibits/sandbox.html         — iframe sandbox page
 *   __unibits/api/components       — manifest JSON with pre-compiled code
 *   __unibits/pkg/<name>.js        — pre-bundled framework runtimes
 * All URLs inside the HTML honor config.base so the output can be deployed
 * under a sub-path (e.g. GitHub Pages project sites).
 */
async function buildStaticShowcase(config: ResolvedConfig, components: ComponentMeta[]): Promise<void> {
  const { outDir, base } = config;

  // Pre-compile every component source so the static page needs no server.
  const compiledComponents = [] as unknown[];
  for (const c of components) {
    const sources = [] as unknown[];
    for (const s of c.sources) {
      let compiled = '';
      try {
        compiled = await compileShowcaseCode(s.code, s.framework);
      } catch (err) {
        logger.warn(`showcase: could not pre-compile ${c.name} (${s.framework}): ${(err as Error).message}`);
      }
      sources.push({ framework: s.framework, code: s.code, compiled });
    }
    compiledComponents.push({ ...c, sources });
  }

  const files: Array<[string, string]> = [
    ['index.html', showcaseAppHtml(config.showcase, base, true)],
    ['__unibits/sandbox.html', sandboxHtml(base)],
    ['__unibits/api/components', JSON.stringify(compiledComponents)],
  ];

  for (const name of Object.keys(PKG_MAP)) {
    const code = await bundlePackage(name, config.cwd);
    if (code != null) files.push([`__unibits/pkg/${name}.js`, code]);
    else logger.warn(`showcase: could not pre-bundle '${name}' — is the framework installed?`);
  }

  for (const [rel, contents] of files) {
    const target = resolve(outDir, rel);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents, 'utf8');
  }
  logger.success(`static showcase written to ${outDir} (base: ${base})`);
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
export async function serveShowcase(
  config: ResolvedConfig,
  port: number,
  buildOnly = false,
  open = false,
): Promise<void> {
  const componentsDir = resolve(config.cwd, 'components');
  const base = config.base;
  const appHtml = showcaseAppHtml(config.showcase, base, false);

  let components: ComponentMeta[] = [];
  try {
    components = await scanComponents(componentsDir);
  } catch {
    components = [];
  }
  logger.info(`showcase: ${components.length} component(s) in ${componentsDir}`);

  if (buildOnly) {
    await buildStaticShowcase(config, components);
    return;
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);
    // Requests arrive base-prefixed when the SPA runs under a sub-path.
    if (base !== '/' && pathname.startsWith(base)) pathname = pathname.slice(base.length - 1);

    if (pathname === '/' || pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(appHtml);
      return;
    }
    if (pathname === '/__unibits/sandbox' || pathname === '/__unibits/sandbox.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(sandboxHtml(base));
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
      const name = pathname.slice('/__unibits/pkg/'.length).replace(/\.js$/, '');
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
  if (open) openBrowser(`http://localhost:${port}${base}`);
}
