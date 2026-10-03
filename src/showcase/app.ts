import type { ShowcaseConfig } from '../types.js';

/**
 * The showcase SPA. A dependency-free single page that fetches the component
 * manifest, compiles snippets via the server endpoint and renders them inside
 * an isolated iframe sandbox.
 */
export function showcaseAppHtml(config: ShowcaseConfig): string {
  const primary = config.theme?.primaryColor ?? '#00ffa3';
  const title = config.title ?? 'UniBits Components';
  const description = config.description ?? '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
:root{--primary:${primary};--bg:#0d1117;--card:#161b22;--border:#21262d;--fg:#e7e9ea;--muted:#8b949e;--code:#0b0f14}
html.light{--bg:#ffffff;--card:#f6f8fa;--border:#d0d7de;--fg:#1f2328;--muted:#57606a;--code:#f0f2f5}
*{box-sizing:border-box}body{margin:0;font:14px/1.5 system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--fg)}
a{color:var(--primary)}.app{display:flex;height:100vh}
.sidebar{width:240px;border-right:1px solid var(--border);padding:20px;overflow:auto;flex-shrink:0}
.sidebar h1{font-size:16px;margin:0 0 4px}.sidebar .sub{color:var(--muted);font-size:12px;margin-bottom:16px}
.sidebar .cat{display:block;width:100%;text-align:left;padding:8px 10px;border:0;background:none;color:inherit;border-radius:6px;cursor:pointer;margin-bottom:2px}
.sidebar .cat:hover{background:var(--card)}.sidebar .cat.active{background:var(--card);color:var(--primary)}
.main{flex:1;overflow:auto;padding:24px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px}
.card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:16px;cursor:pointer;transition:border-color .15s}
.card:hover{border-color:var(--primary)}.card h3{margin:0 0 6px;font-size:15px}.card p{color:var(--muted);font-size:12px;margin:0}
.toolbar{display:flex;gap:12px;align-items:center;margin-bottom:20px;flex-wrap:wrap}
.toolbar input{flex:1;min-width:180px;padding:8px 12px;border-radius:8px;border:1px solid var(--border);background:var(--card);color:inherit}
.toolbar button{padding:8px 14px;border-radius:8px;border:1px solid var(--border);background:var(--card);color:inherit;cursor:pointer}
.detail{display:grid;grid-template-columns:1fr 320px;gap:20px;height:calc(100vh - 48px)}
.preview{background:var(--card);border:1px solid var(--border);border-radius:10px;display:flex;flex-direction:column}
.preview .tabs{display:flex;gap:4px;padding:8px;border-bottom:1px solid var(--border)}
.preview .tabs button{padding:6px 12px;border-radius:6px;border:0;background:none;color:var(--muted);cursor:pointer}
.preview .tabs button.active{background:var(--primary);color:#03160f}
.preview iframe{flex:1;border:0;border-radius:0 0 10px 10px}
.panel{display:flex;flex-direction:column;gap:16px;overflow:auto}
.code{background:var(--code);border:1px solid var(--border);border-radius:10px;display:flex;flex-direction:column;min-height:240px}
.code .head{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:1px solid var(--border)}
.code textarea{flex:1;background:transparent;color:inherit;border:0;outline:0;resize:vertical;padding:12px;font:12px/1.5 ui-monospace,monospace}
.props{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px}
.back{background:none;border:0;color:var(--primary);cursor:pointer;padding:0;margin-bottom:12px}
.toast{position:fixed;bottom:20px;right:20px;background:var(--primary);color:#03160f;padding:8px 14px;border-radius:8px;font-weight:600;opacity:0;transition:opacity .2s}
</style>
</head>
<body class="">
<div class="app">
  <aside class="sidebar">
    <h1>${title}</h1>
    <p class="sub">${description}</p>
    <button class="cat active" data-cat="all">All</button>
    <div id="categories"></div>
    <p class="sub" style="margin-top:20px">npm install unibits</p>
  </aside>
  <main class="main">
    <div id="listView">
      <div class="toolbar">
        <input id="search" placeholder="Search components…">
        <button id="theme">◐ Theme</button>
      </div>
      <div class="grid" id="grid"></div>
    </div>
    <div id="detailView" style="display:none"></div>
  </main>
</div>
<div class="toast" id="toast"></div>
<script>
(() => {
  const $ = (s, r=document) => r.querySelector(s);
  const primary = ${JSON.stringify(primary)};
  let components = [];
  let current = null;
  let currentFramework = 'vue';

  async function api(path, opts) {
    const res = await fetch(path, opts);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.style.opacity = 1;
    setTimeout(() => t.style.opacity = 0, 2000);
  }

  function renderCategories(cats) {
    const el = $('#categories'); el.innerHTML = '';
    cats.forEach(c => {
      const b = document.createElement('button');
      b.className = 'cat'; b.dataset.cat = c.name; b.textContent = c.name;
      b.onclick = () => { document.querySelectorAll('.cat').forEach(x => x.classList.remove('active')); b.classList.add('active'); renderGrid(c.name); };
      el.appendChild(b);
    });
    $('[data-cat=all]').onclick = () => { document.querySelectorAll('.cat').forEach(x => x.classList.remove('active')); $('[data-cat=all]').classList.add('active'); renderGrid('all'); };
  }

  function renderGrid(cat = 'all', q = '') {
    const grid = $('#grid'); grid.innerHTML = '';
    components.filter(c => (cat === 'all' || c.category === cat) && (!q || c.name.toLowerCase().includes(q))).forEach(c => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = '<h3>' + c.name + '</h3><p>' + c.description + '</p>';
      card.onclick = () => openDetail(c);
      grid.appendChild(card);
    });
  }

  function openDetail(meta) {
    current = meta;
    $('#listView').style.display = 'none';
    $('#detailView').style.display = 'block';
    const frameworks = meta.sources.map(s => s.framework);
    currentFramework = frameworks.includes('vue') ? 'vue' : frameworks[0];
    $('#detailView').innerHTML =
      '<button class="back" onclick="location.reload()">← Back</button>' +
      '<div class="detail">' +
        '<div class="preview">' +
          '<div class="tabs">' + frameworks.map(f => '<button data-f="'+f+'">'+f+'</button>').join('') + '</div>' +
          '<iframe sandbox="allow-scripts" id="frame"></iframe>' +
        '</div>' +
        '<div class="panel">' +
          '<div class="code"><div class="head"><span>Source</span><button id="copy">Copy</button></div><textarea id="editor" spellcheck="false"></textarea></div>' +
          '<div class="props" id="props"></div>' +
        '</div>' +
      '</div>';
    document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { currentFramework = b.dataset.f; load(); });
    $('#copy').onclick = async () => { await navigator.clipboard.writeText($('#editor').value); toast('✓ Copied'); };
    load();
  }

  const sandboxHtml = () => fetch('/__unibits/sandbox').then(r => r.text());

  async function load() {
    document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.f === currentFramework));
    const src = current.sources.find(s => s.framework === currentFramework);
    if (!src) return;
    $('#editor').value = src.code;
    renderProps(current.props);
    await compileAndRender(src.code);
  }

  function renderProps(schema) {
    const el = $('#props'); el.innerHTML = '<h4 style="margin:0 0 8px">Props</h4>';
    const defaults = ${JSON.stringify(config.defaultProps ?? {})}[current.name] || {};
    const values = {};
    Object.entries(schema || {}).forEach(([name, s]) => {
      values[name] = defaults[name] ?? s.default;
      const row = document.createElement('label');
      row.style.cssText = 'display:flex;flex-direction:column;gap:4px;margin-bottom:10px;font-size:12px';
      row.innerHTML = '<b>' + name + '</b>';
      if (s.type === 'event') { row.innerHTML += '<span style="opacity:.6">(event — not editable)</span>'; }
      else if (s.type === 'boolean') {
        const i = document.createElement('input'); i.type = 'checkbox'; i.checked = !!values[name];
        i.onchange = () => { values[name] = i.checked; render(); }; row.appendChild(i);
      } else if (s.type === 'enum') {
        const sel = document.createElement('select');
        (s.options || []).forEach(o => { const op = document.createElement('option'); op.value = o; op.textContent = o; sel.appendChild(op); });
        sel.value = values[name]; sel.onchange = () => { values[name] = sel.value; render(); }; row.appendChild(sel);
      } else if (s.type === 'number') {
        const i = document.createElement('input'); i.type = 'range'; i.min = 0; i.max = 100; i.value = values[name] || 0;
        i.oninput = () => { values[name] = Number(i.value); render(); }; row.appendChild(i);
      } else {
        const i = document.createElement('input'); i.type = 'text'; i.value = values[name] || '';
        i.oninput = () => { values[name] = i.value; render(); }; row.appendChild(i);
      }
      el.appendChild(row);
    });
    function render() { compileAndRender($('#editor').value, values); }
    $('#editor').addEventListener('input', debounce(() => render(), 300));
  }

  async function compileAndRender(code, props = {}) {
    try {
      const compiled = await api('/__unibits/compile', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ code, framework: currentFramework }) });
      const frame = $('#frame');
      frame.srcdoc = await sandboxHtml();
      frame.onload = () => frame.contentWindow.postMessage({ source: 'unibits-showcase', type: 'render', framework: currentFramework, code: compiled.code, props }, '*');
    } catch (e) { toast('✖ ' + e.message); }
  }

  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  $('#search').addEventListener('input', debounce(e => renderGrid('all', e.target.value.toLowerCase()), 200));
  $('#theme').onclick = () => { document.documentElement.classList.toggle('light'); localStorage.setItem('unibits-theme', document.documentElement.classList.contains('light') ? 'light' : 'dark'); };
  if (localStorage.getItem('unibits-theme') === 'light') document.documentElement.classList.add('light');

  (async () => {
    components = await api('/__unibits/api/components');
    const cats = ['all', ...new Set(components.map(c => c.category))];
    renderCategories(cats.slice(1));
    renderGrid('all');
    const url = new URL(location.href);
    if (url.searchParams.get('framework')) currentFramework = url.searchParams.get('framework');
  })();
})();
</script>
</body>
</html>`;
}
