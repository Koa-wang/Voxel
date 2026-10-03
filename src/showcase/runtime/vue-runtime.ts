/**
 * F1 — Vue sandbox runtime (browser side).
 * Evaluated inside the showcase iframe which preloads the Vue runtime via an
 * import map. `compile` is handled server-side (compilers are not shipped to
 * the browser); the sandbox only mounts/unmounts compiled ESM.
 */
export const VUE_RUNTIME = `
globalThis.__unibits_sandbox = globalThis.__unibits_sandbox || {};
globalThis.__unibits_sandbox.mountVue = async function (el, code, props) {
  const { createApp } = await import('vue');
  const mod = await globalThis.__unibits_import(code);
  const component = mod.default;
  const app = createApp(component, props);
  app.mount(el);
  return function () { app.unmount(); };
};
`;

export const RUNTIME_NAME = 'vue';
