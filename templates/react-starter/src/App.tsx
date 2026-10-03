import { useState } from 'react';

export default function App() {
  const [count, setCount] = useState(0);
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', textAlign: 'center', padding: '4rem' }}>
      <h1>UniBits + React 18</h1>
      <button onClick={() => setCount((c) => c + 1)} style={{ padding: '0.6rem 1.2rem', borderRadius: 8 }}>
        count is {count}
      </button>
    </main>
  );
}
