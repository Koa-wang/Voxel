import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Metafile } from 'esbuild';
import type { ResolvedConfig } from '../types.js';

interface Row {
  name: string;
  bytes: number;
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * A8 — Bundle analysis report.
 * Generates a standalone HTML file with a treemap (nested flex rows sized by
 * output proportion), a per-chunk table and duplicate dependency detection.
 */
export async function analyzeBundle(metafile: Metafile, config: ResolvedConfig): Promise<void> {
  const outputs = metafile.outputs;
  const chunks: Row[] = Object.entries(outputs).map(([name, o]) => ({ name, bytes: o.bytes })).sort((a, b) => b.bytes - a.bytes);
  const total = chunks.reduce((sum, c) => sum + c.bytes, 0);

  // Duplicate dependency detection: an input appearing in more than one chunk.
  const seen = new Map<string, number>();
  for (const output of Object.values(outputs)) {
    for (const input of Object.keys(output.inputs)) {
      seen.set(input, (seen.get(input) ?? 0) + 1);
    }
  }
  const duplicates = [...seen.entries()].filter(([, n]) => n > 1).map(([p, n]) => ({ path: p, count: n }));

  const max = Math.max(...chunks.map((c) => c.bytes), 1);
  const treemap = chunks
    .map(
      (c) =>
        `<div class="cell" style="flex-basis:${Math.max((c.bytes / max) * 100, 1)}%" title="${c.name} — ${fmtBytes(c.bytes)}"><span>${c.name}</span><em>${fmtBytes(c.bytes)}</em></div>`,
    )
    .join('\n');

  const table = chunks
    .map(
      (c, i) =>
        `<tr><td>${i + 1}</td><td class="mono">${c.name}</td><td>${fmtBytes(c.bytes)}</td><td>${((c.bytes / total) * 100).toFixed(1)}%</td></tr>`,
    )
    .join('\n');

  const dupRows = duplicates.length
    ? duplicates.map((d) => `<tr><td class="mono">${d.path}</td><td>${d.count}</td></tr>`).join('\n')
    : '<tr><td colspan="2">No duplicate dependencies detected.</td></tr>';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>UniBits Bundle Analysis</title>
<style>
:root{color-scheme:light dark;--fg:#e7e9ea;--muted:#9aa3a8;--bg:#0d1117;--card:#161b22;--accent:#00ffa3}
*{box-sizing:border-box}body{margin:0;font:14px/1.5 system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--fg);padding:32px}
h1{font-size:20px;margin:0 0 4px}h1 b{color:var(--accent)}.sub{color:var(--muted);margin-bottom:24px}
.card{background:var(--card);border:1px solid #21262d;border-radius:10px;padding:20px;margin-bottom:20px}
.card h2{font-size:14px;margin:0 0 12px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.treemap{display:flex;height:220px;gap:4px;border-radius:6px;overflow:hidden}
.cell{display:flex;flex-direction:column;justify-content:flex-end;padding:8px;background:linear-gradient(180deg,var(--accent),#0b7a52);color:#03160f;border-radius:4px;min-width:0;overflow:hidden}
.cell span{font-size:11px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cell em{font-size:10px;font-style:normal;opacity:.8}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #21262d}
th{color:var(--muted);font-weight:600}.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
</style>
</head>
<body>
<h1><b>UniBits</b> Bundle Analysis</h1>
<p class="sub">${chunks.length} chunks · ${fmtBytes(total)} total</p>
<div class="card"><h2>Treemap</h2><div class="treemap">${treemap}</div></div>
<div class="card"><h2>Chunks</h2><table><thead><tr><th>#</th><th>Output</th><th>Size</th><th>Share</th></tr></thead><tbody>${table}</tbody></table></div>
<div class="card"><h2>Duplicate Dependencies</h2><table><thead><tr><th>Module</th><th>Chunks</th></tr></thead><tbody>${dupRows}</tbody></table></div>
</body></html>`;

  const out = resolve(config.outDir, 'bundle-analysis.html');
  await writeFile(out, html, 'utf8');
}
