/**
 * B7 + HMR client scripts. Injected into the dev server's HTML response.
 * Kept as string constants so they require no separate build step.
 */

export const HMR_CLIENT = `(() => {
  const ws = new WebSocket((location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.host + '/__unibits_hmr');
  let connected = false;
  ws.addEventListener('open', () => { connected = true; });
  ws.addEventListener('message', (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    if (msg.type === 'connected') {
      console.log('[unibits] hot channel ready (' + (msg.framework || 'multi') + ')');
    } else if (msg.type === 'full-reload') {
      location.reload();
    } else if (msg.type === 'update') {
      // Hot update: attempt to re-import changed modules; the simplest correct
      // strategy for a bundled dev server is a fast reload.
      if (msg.files && msg.files.length && typeof import.meta.hot === 'undefined') {
        location.reload();
      } else {
        location.reload();
      }
    } else if (msg.type === 'error') {
      window.__unibits_show_error && window.__unibits_show_error(msg);
    }
  });
  ws.addEventListener('close', () => {
    if (connected) setTimeout(() => location.reload(), 800);
  });
})();
`;

export const ERROR_OVERLAY = `(() => {
  function show(payload) {
    let el = document.getElementById('unibits-error-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'unibits-error-overlay';
      el.style.cssText = 'position:fixed;inset:0;background:rgba(16,18,24,.94);color:#ff6b6b;font:14px/1.5 ui-monospace,monospace;z-index:2147483647;padding:40px;overflow:auto;white-space:pre-wrap';
      document.body.appendChild(el);
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') el.remove(); });
    }
    const text = typeof payload === 'string' ? payload : (payload.message || payload.stack || JSON.stringify(payload, null, 2));
    el.textContent = '✖ ' + text + '\\n\\n(press ESC to dismiss)';
  }
  window.addEventListener('error', (e) => show({ message: e.message, stack: e.error && e.error.stack, file: e.filename + ':' + e.lineno }));
  window.addEventListener('unhandledrejection', (e) => show(e.reason));
  window.__unibits_show_error = show;
})();
`;

export const HMR_INJECT = `<script src="/__unibits/error-overlay.js"></script>\n<script src="/__unibits/hmr-client.js"></script>`;
