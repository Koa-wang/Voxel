import { describe, expect, it } from 'vitest';
import { formatCodeFrame, formatErrorWithFrame } from '../src/utils/codeframe.js';

const SRC = ['line one', 'line two', 'line three', 'line four', 'line five', 'line six', 'line seven'].join('\n');
const stripAnsi = (s: string): string => s.replace(/\x1b\[\d+m/g, '');

describe('formatCodeFrame', () => {
  it('renders context lines with a caret under the column', () => {
    const frame = stripAnsi(formatCodeFrame(SRC, 4, 6));
    expect(frame).toContain('> 4 | line four');
    expect(frame).toContain('^');
    expect(frame).toContain('2 | line two');
    expect(frame).toContain('6 | line six');
    expect(frame).not.toContain('line one');
    expect(frame).not.toContain('line seven');
  });

  it('clamps context at file boundaries', () => {
    const frame = stripAnsi(formatCodeFrame(SRC, 1, 1));
    expect(frame).toContain('1 | line one');
    expect(frame).not.toContain('line four');
  });
});

describe('formatErrorWithFrame', () => {
  it('includes position and frame', () => {
    const out = stripAnsi(formatErrorWithFrame('Unexpected token', { file: 'src/a.ts', line: 2, column: 3 }, SRC));
    expect(out).toContain('src/a.ts:2:3');
    expect(out).toContain('Unexpected token');
    expect(out).toContain('line two');
  });

  it('falls back to lineText when source is unavailable', () => {
    const out = stripAnsi(formatErrorWithFrame('Boom', { file: 'b.ts', line: 10, column: 2, lineText: 'const x =' }));
    expect(out).toContain('b.ts:10:2');
    expect(out).toContain('const x =');
  });

  it('returns the bare message without a location', () => {
    expect(formatErrorWithFrame('Boom', null)).toBe('Boom');
  });
});
