import pc from 'picocolors';

export interface CodeFrameLocation {
  file: string;
  line: number;
  column?: number;
  /** Source text of the offending line, when the caller already has it. */
  lineText?: string;
}

/**
 * Render a Babel/Vite-style code frame:
 *
 *   src/App.vue:12:5
 *     10 |   <template>
 *     11 |     <div>
 *   > 12 |       <span v-if=">
 *        |       ^
 *     13 |     </div>
 *
 * Pure string formatting — no file I/O, callers provide the source so this
 * works for both on-disk files and in-memory sources (e.g. SFC blocks).
 */
export function formatCodeFrame(source: string, line: number, column?: number, contextLines = 2): string {
  const lines = source.split(/\r?\n/);
  const start = Math.max(0, line - 1 - contextLines);
  const end = Math.min(lines.length, line + contextLines);
  const gutterWidth = String(end).length;

  const out: string[] = [];
  for (let i = start; i < end; i++) {
    const lineNo = i + 1;
    const isTarget = lineNo === line;
    const gutter = String(lineNo).padStart(gutterWidth);
    const marker = isTarget ? pc.red('>') : ' ';
    const text = isTarget ? pc.red(lines[i]) : pc.dim(lines[i]);
    out.push(`${marker} ${pc.dim(gutter)} | ${text}`);
    if (isTarget && column != null && column > 0) {
      out.push(`  ${' '.repeat(gutterWidth)} | ${' '.repeat(column - 1)}${pc.red('^')}`);
    }
  }
  return out.join('\n');
}

/** Format one esbuild-style message with an optional code frame. */
export function formatErrorWithFrame(
  message: string,
  loc: CodeFrameLocation | null | undefined,
  source?: string,
): string {
  if (!loc) return message;
  const pos = `${loc.file}:${loc.line}${loc.column != null ? ':' + loc.column : ''}`;
  let frame = '';
  if (source != null && source.split(/\r?\n/).length >= loc.line) {
    frame = '\n' + formatCodeFrame(source, loc.line, loc.column);
  } else if (loc.lineText != null) {
    // Only the offending line is available (e.g. esbuild lineText) — render a
    // minimal one-line frame with the caret.
    frame =
      `\n  ${pc.dim(String(loc.line) + ' |')} ${loc.lineText}` +
      (loc.column != null && loc.column > 0
        ? `\n  ${' '.repeat(String(loc.line).length + 3 + loc.column - 1)}${pc.red('^')}`
        : '');
  }
  return `${pc.cyan(pos)}\n  ${message}${frame}`;
}
