import { VUE_RUNTIME } from '../runtime/vue-runtime.js';
import { REACT_RUNTIME } from '../runtime/react-runtime.js';
import { SOLID_RUNTIME } from '../runtime/solid-runtime.js';

const IMPORT_MAP = {
  vue: '/__unibits/pkg/vue',
  react: '/__unibits/pkg/react',
  'react/jsx-runtime': '/__unibits/pkg/react-jsx-runtime',
  'react-dom/client': '/__unibits/pkg/react-dom-client',
  'solid-js': '/__unibits/pkg/solid-js',
  'solid-js/web': '/__unibits/pkg/solid-js-web',
  'solid-js/store': '/__unibits/pkg/solid-js-store',
};

/**
 * F1 — iframe sandbox template.
 * Fully isolated from the host page (separate document, styles and JS scope).
 * The import map resolves framework bare specifiers to local ESM bundles
 * served by the showcase server.
 */
export function sandboxHtml(): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<script type="importmap">${JSON.stringify({ imports: IMPORT_MAP })}</script>
<style>
:root{color-scheme:light dark}
html,body{margin:0;padding:0;min-height:100%}
#root{display:contents}
</style>
</head>
<body>
<div id="root"></div>
<script type="module">
${VUE_RUNTIME}
${REACT_RUNTIME}
${SOLID_RUNTIME}

globalThis.__unibits_sandbox = globalThis.__unibits_sandbox || {};
globalThis.__unibits_sandbox.unmountAll = function () {
  (globalThis.__unibits_cleanups || []).forEach(function (fn) { try { fn(); } catch (_) {} });
  globalThis.__unibits_cleanups = [];
  var root = document.getElementById('root');
  root.textContent = '';
};

globalThis.__unibits_import = function (code) {
  var blob = new Blob([code], { type: 'text/javascript' });
  return import(URL.createObjectURL(blob));
};

window.addEventListener('message', function (event) {
  var data = event.data;
  if (!data || data.source !== 'unibits-showcase') return;
  if (data.type === 'render') {
    globalThis.__unibits_sandbox.unmountAll();
    var el = document.getElementById('root');
    var method = data.framework === 'vue'
      ? 'mountVue'
      : data.framework === 'react'
        ? 'mountReact'
        : 'mountSolid';
    globalThis.__unibits_sandbox[method](el, data.code, data.props || {})
      .then(function (cleanup) {
        globalThis.__unibits_cleanups = globalThis.__unibits_cleanups || [];
        globalThis.__unibits_cleanups.push(cleanup);
        event.source.postMessage({ source: 'unibits-sandbox', type: 'rendered' }, '*');
      })
      .catch(function (err) {
        event.source.postMessage({ source: 'unibits-sandbox', type: 'error', message: err.message }, '*');
      });
  }
});
</script>
</body>
</html>`;
}

export type SandboxFramework = 'vue' | 'react' | 'solid';

/**
 * Browser-side sandbox lifecycle manager. Creates an isolated iframe and talks
 * to it via postMessage, then maps responses back onto promises.
 */
export class SandboxManager {
  private iframe: HTMLIFrameElement;
  private pending = new Map<string, { resolve: () => void; reject: (e: Error) => void }>();
  private seq = 0;

  constructor(container: HTMLElement) {
    this.iframe = document.createElement('iframe');
    this.iframe.setAttribute('sandbox', 'allow-scripts');
    this.iframe.style.cssText = 'width:100%;height:100%;border:0';
    this.iframe.srcdoc = sandboxHtml();
    container.appendChild(this.iframe);

    window.addEventListener('message', (event) => {
      const data = event.data as { source?: string; type?: string; id?: string; message?: string };
      if (data?.source !== 'unibits-sandbox') return;
      if (data.type === 'rendered') this.pending.get(data.id ?? '')?.resolve();
      if (data.type === 'error') this.pending.get(data.id ?? '')?.reject(new Error(data.message));
      this.pending.delete(data.id ?? '');
    });
  }

  render(framework: SandboxFramework, code: string, props: Record<string, unknown>): Promise<void> {
    const id = String(++this.seq);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.iframe.contentWindow?.postMessage(
        { source: 'unibits-showcase', type: 'render', id, framework, code, props },
        '*',
      );
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('Sandbox render timed out'));
        }
      }, 10000);
    });
  }

  destroy(): void {
    this.iframe.remove();
  }
}
