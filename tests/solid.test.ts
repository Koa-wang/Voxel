import { describe, expect, it } from 'vitest';
import { compileSolidJsx } from '../src/adapters/solid.js';

describe('compileSolidJsx', () => {
  it('compiles TSX to plain JS without React imports', async () => {
    const code = `
import { createSignal } from 'solid-js';
export default function Counter() {
  const [count, setCount] = createSignal(0);
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>;
}
`;
    const out = await compileSolidJsx('/tmp/Counter.tsx', code);
    expect(out).toContain('createSignal');
    expect(out).not.toMatch(/react/);
    // Solid compiles JSX to DOM instructions
    expect(out).toMatch(/template|createComponent|insert/);
  });

  it('strips TypeScript types', async () => {
    const code = `export const n: number = 1;`;
    const out = await compileSolidJsx('/tmp/n.ts', code);
    expect(out).not.toContain(': number');
    expect(out).toContain('= 1');
  });

  it('throws on invalid syntax', async () => {
    await expect(compileSolidJsx('/tmp/bad.tsx', `const = <`)).rejects.toThrow();
  });
});
