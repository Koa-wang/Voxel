import { createSignal } from 'solid-js';

export default function App() {
  const [count, setCount] = createSignal(0);
  return (
    <main style={{ 'font-family': 'system-ui, sans-serif', 'text-align': 'center', padding: '4rem' }}>
      <h1>UniBits + Solid.js</h1>
      <button onClick={() => setCount(count() + 1)} style={{ padding: '0.6rem 1.2rem', 'border-radius': '8px' }}>
        count is {count()}
      </button>
    </main>
  );
}
