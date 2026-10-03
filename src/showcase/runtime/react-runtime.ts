/**
 * F1 — React sandbox runtime (browser side).
 * Compiles JSX server-side (esbuild automatic runtime); the sandbox mounts the
 * compiled module with react-dom/client.
 */
export const REACT_RUNTIME = `
globalThis.__unibits_sandbox = globalThis.__unibits_sandbox || {};
globalThis.__unibits_sandbox.mountReact = async function (el, code, props) {
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const mod = await globalThis.__unibits_import(code);
  const root = createRoot(el);
  root.render(React.createElement(mod.default, props));
  return function () { root.unmount(); };
};
`;

export const RUNTIME_NAME = 'react';
