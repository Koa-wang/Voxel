/**
 * F1 — Solid sandbox runtime (browser side).
 * Compiled with babel-preset-solid server-side; the sandbox mounts the
 * component with solid-js/web's render().
 */
export const SOLID_RUNTIME = `
globalThis.__unibits_sandbox = globalThis.__unibits_sandbox || {};
globalThis.__unibits_sandbox.mountSolid = async function (el, code, props) {
  const { render } = await import('solid-js/web');
  const mod = await globalThis.__unibits_import(code);
  const dispose = render(function () { return mod.default(props); }, el);
  return function () { dispose(); };
};
`;

export const RUNTIME_NAME = 'solid';
