import { describe, expect, it } from 'vitest';
import { compileVueSfc } from '../src/adapters/vue.js';

const BASIC = `
<template>
  <button class="btn">{{ label }}</button>
</template>
<script lang="ts">
export default {
  data() {
    return { label: 'hi' };
  },
};
</script>
<style>
.btn { color: red; }
</style>
`;

describe('compileVueSfc', () => {
  it('compiles script + template + style into an ESM module', () => {
    const { js, styles } = compileVueSfc('/tmp/Basic.vue', BASIC);
    expect(js).toContain('const _sfc_main = ');
    expect(js).toContain('function render(');
    expect(js).toContain('export default _sfc_main');
    expect(js).toContain('__hmrId');
    expect(styles).toHaveLength(1);
    expect(styles[0].code).toContain('.btn');
  });

  it('adds scopeId for scoped styles', () => {
    const { js } = compileVueSfc('/tmp/Scoped.vue', BASIC.replace('<style>', '<style scoped>'));
    expect(js).toMatch(/__scopeId = "data-v-[a-f0-9]+"/);
  });

  it('does not rewrite "export default" inside string literals', () => {
    const code = `
<script>
export default {
  data() {
    return { msg: "export default is text" };
  },
};
</script>
`;
    const { js } = compileVueSfc('/tmp/Str.vue', code);
    // The string literal survives untouched…
    expect(js).toContain('{ msg: "export default is text" }');
    // …and exactly one default-export → named-binding rewrite happened.
    expect(js.match(/^const _sfc_main = /gm)).toHaveLength(1);
    expect(js.match(/^export default _sfc_main$/gm)).toHaveLength(1);
  });

  it('supports renderless components (script only, no template)', () => {
    const { js } = compileVueSfc('/tmp/Renderless.vue', `<script>export default { props: ['x'] }</script>`);
    expect(js).not.toContain('_sfc_main.render = render');
    expect(js).toContain('export default _sfc_main');
  });

  it('throws a clear error for <style src>', () => {
    expect(() => compileVueSfc('/tmp/Ext.vue', `<template><div/></template><style src="./x.css"></style>`)).toThrow(
      /<style src=.*not supported/,
    );
  });

  it('throws a clear error for unsupported style languages', () => {
    expect(() =>
      compileVueSfc('/tmp/Lang.vue', `<template><div/></template><style lang="postcss">a{}</style>`),
    ).toThrow(/unsupported <style lang="postcss">/);
  });

  it('reports parse errors with file and location', () => {
    expect(() => compileVueSfc('/tmp/Bad.vue', `<template><div></template>`)).toThrow(/Bad\.vue/);
  });
});
