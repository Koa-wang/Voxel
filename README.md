# UniBits

> 一个同时原生支持 **Vue 3**、**React 18+** 和 **Solid.js** 的前端构建框架，内置类 React Bits 的三框架组件展示站。

**UniBits = 构建引擎 + 框架适配层 + 组件展示站**

---

## 核心特性

- **三框架原生支持** — Vue / React / Solid 是一等公民，共享统一编译管线
- **框架自动检测** — 读取 `package.json` 零配置选择编译链路（`vue` / `react` / `solid-js`）
- **内置组件展示站** — 同一组件三种框架实时预览 + 代码复制 + Props 面板
- **企业级开箱即用** — Monorepo / 模块联邦 / SSR / SSG / Library 模式

## 技术栈

| 模块       | 选型                                          |
| ---------- | --------------------------------------------- |
| 构建引擎   | esbuild（Rust 内核，快）                      |
| JS 编译    | esbuild + SWC 风格自动 runtime                |
| CSS 引擎   | Lightning CSS（解析 / 压缩 / autoprefixer）   |
| Vue 编译   | `@vue/compiler-sfc`                           |
| React 编译 | esbuild `jsx: automatic`（React 17+ runtime） |
| Solid 编译 | `babel-preset-solid`                          |
| Dev Server | 原生 Node HTTP + `ws`                         |
| CLI        | Commander + `@clack/prompts`                  |

## 快速开始

```bash
# 安装
npm install -D unibits

# 零配置启动（自动检测框架）
npx unibits dev

# 生产构建
npx unibits build

# 组件展示站
npx unibits showcase

# 创建新项目
npx unibits create vue-starter my-app
```

零配置约定：

- 入口：`src/index.html`（应用）或 `src/index.ts`（库），自动检测
- 输出：`dist/`
- 端口：`3000`
- 浏览器兼容：`> 0.5%, last 2 versions, not dead`

## 配置文件

`unibits.config.ts`（可选，支持 `.ts/.mts/.js/.mjs/.cjs`）：

```ts
import { defineConfig } from 'unibits';

export default defineConfig({
  entry: 'src/index.html',
  outDir: 'dist',
  port: 3000,
  framework: 'auto', // 'vue' | 'react' | 'solid' | ['vue', 'react']

  alias: { '@': './src' },

  proxy: { '/api': 'http://localhost:8080' },

  plugins: [
    {
      name: 'pwa',
      frameworks: ['vue', 'react'],
      afterBuild(ctx) {
        ctx.emitFile('manifest.json', JSON.stringify({ name: 'My App' }));
      },
    },
  ],

  federation: {
    name: 'host',
    remotes: { app1: 'https://cdn.example.com/remoteEntry.js' },
    shared: { vue: { singleton: true }, react: { singleton: true } },
  },

  showcase: {
    title: 'My Components',
    theme: { primaryColor: '#00ffa3', darkMode: true },
  },
});
```

## CLI

```bash
unibits dev [entry] [-p 8080] [--framework vue]
unibits build [entry] [--lib] [--ssr --routes /,/about] [--analyze] [--no-cache]
unibits showcase [build | generate] [-p 3000]
unibits clean [-o build]
unibits create <vue-starter|react-starter|solid-starter|multi-framework> [target]
unibits            # 交互式引导
```

## 组件展示站

组件目录约定：

```
components/
└── AnimatedButton/
    ├── index.vue        # Vue 版本
    ├── index.tsx        # React 版本
    ├── index.solid.tsx  # Solid 版本
    └── meta.json        # 名称 / 分类 / 描述 / props schema
```

`meta.json`：

```json
{
  "name": "AnimatedButton",
  "category": "Interactive",
  "description": "A button that animates",
  "props": {
    "label": { "type": "string", "default": "Click me" },
    "variant": { "type": "enum", "options": ["primary", "secondary"], "default": "primary" }
  }
}
```

展示站功能：

- iframe 沙箱实时预览（样式 + JS 作用域完全隔离）
- Vue / React / Solid 一键切换 tab
- 代码复制（`navigator.clipboard`）
- Props 可视化面板（string / enum / boolean / number）
- 分类索引 + 搜索
- 暗色 / 亮色主题（`prefers-color-scheme`）

## 架构

```
源码输入 → 框架检测 → 适配器选择 → 编译管线 → 产物输出
```

```
src/
├── core/          # build / dev / clean / config / logger
├── adapters/      # interface + vue / react / solid 适配器 + 自动检测
├── plugins/       # PluginManager / PluginContext / Vite·Rollup 兼容层
├── showcase/      # 运行时 / 沙箱 / 编辑器 / 生成器
├── enterprise/    # Monorepo / 模块联邦 / SSR·SSG
├── css/           # Lightning CSS / CSS Modules / 原子 CSS 检测
└── utils/         # 路径别名 / 编译缓存
```

### 统一适配器接口

```ts
interface FrameworkAdapter {
  name: 'vue' | 'react' | 'solid';
  detect(pkgJson): boolean;
  getTransformPlugins(config, frameworks): TransformPlugin[];
  setupHMR?(ctx): void;
  ssrRender?(app, url): Promise<string>;
  typeCheck?(options): ChildProcess;
  getShowcaseRuntime(): ShowcaseRuntime;
}
```

### 插件生命周期（4 个钩子）

```ts
interface Plugin {
  name: string;
  frameworks?: ('vue' | 'react' | 'solid')[];
  order?: number;
  setup?(ctx): Promise<void>; // 并行
  beforeBuild?(ctx): Promise<void>; // 串行（按 order）
  transform?(asset): Promise<Asset>; // 逐资源管线
  afterBuild?(ctx): Promise<void>; // 并行
}
```

## 开发

```bash
pnpm install
pnpm dev        # tsx 运行 CLI
pnpm build      # 编译到 dist/
pnpm typecheck  # tsc --noEmit
```

## 路线图

- **Phase 1** — CLI + 配置 + 框架检测 + 三框架适配器 + Dev Server/HMR + 构建 + CSS ✓
- **Phase 2** — 展示站（沙箱 / tab 切换 / 复制 / 分类 / 主题）✓
- **Phase 3** — 实时编辑（CodeMirror 6）/ Props 面板 ✓ / 错误叠加层 ✓ / 代理 ✓ / 类型检查 ✓ / Bundle 分析 ✓
- **Phase 4** — Library ✓ / 插件系统 ✓ / Monorepo ✓ / SSR·SSG ✓ / 模块联邦 ✓ / Vite·Rollup 兼容 ✓
- **Phase 5** — 多框架微前端 / 组件组合画布 / 展示站自动生成器 / create-unibits ✓

## License

MIT
