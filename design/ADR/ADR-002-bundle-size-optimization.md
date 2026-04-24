# ADR-002：安装包体积瘦身方案

- 状态：Proposed
- 日期：2026-04-24
- 作者：Claude
- 相关文档：[ADR-001](./ADR-001-feature-parity-with-typora.md)、[spec-electron.md](../spec-electron.md)

---

## 1. 背景与问题

当前打包产物（Windows zip + NSIS）重量级依赖：

| 依赖 | 预估解压体积 | 说明 |
|------|------------|------|
| Electron 33 (Chromium + Node) | ~180 MB | 基线，不可去除 |
| Mermaid 11 (含 d3) | ~3 MB gzipped / ~12 MB 解压 | 首屏即加载 |
| Shiki 1.6 + 语法包 | ~30-50 MB 解压（全语言） | 首屏即加载 |
| Milkdown + ProseMirror 生态 | ~1.5 MB gzipped | 核心，必需 |
| node-pty 原生模块 | ~2 MB | 已 `asarUnpack`，必需 |
| React / Zustand / i18next / xterm | 合计 ~500 KB gzipped | 可控 |

**问题定位**：Electron 占绝对大头无法砍，但 **Shiki 全量语法包** 与 **Mermaid 首屏加载** 是最容易压缩的两个冗余源；同时 `vite.config.ts` 无 chunk 拆分、无 treeshake 辅助，首屏脚本可能比实际需要的大 2-3 倍。

**目标**：在不牺牲已有功能的前提下，把 **安装包压缩后体积降低 15–25%**，首屏 JS 降低 50%+。

## 2. 现状诊断

1. `vite.config.ts` 仅注册 React 插件，无 `manualChunks`、无 `build.target`、无 `rollupOptions`
2. `package.json#build.files` 包含 `dist/**/*` 全量 + `electron/**/*` 全量，未排除 `*.map`、测试遗留
3. Shiki 的用法位于 `src/editor/plugins/highlight.ts`，需核查是否注册了全部语言
4. Mermaid 在 `src/editor/plugins/mermaid.ts` 中以静态 import 引入，即使用户从不写 Mermaid 也会加载
5. i18next 资源、xterm addons、shiki themes 等均无懒加载
6. 未启用 electron-builder 的 `compression: "maximum"`（默认 normal）

## 3. 优化方案（按 ROI 排序）

### 3.1 Shiki 按需加载（最高 ROI，预期省 ~20 MB 解压 / ~3 MB 压缩）

- 改用 `shiki/core` + `createHighlighterCore`，只注册真正用到的语言（从当前代码块扫描或默认清单：`md / ts / tsx / js / jsx / json / bash / py / go / rust / sql / yaml / html / css`，~14 种）
- 主题只加载 `light-plus` + `dark-plus`（或项目统一主题），不加载全量
- 动态 `import('./languages/xxx.mjs')`：遇到未注册语言时按需拉取
- 交付物：重构 `src/editor/plugins/highlight.ts`

### 3.2 Mermaid 懒加载（预期省 ~3 MB 压缩）

- 将 `import mermaid from 'mermaid'` 改为 `await import('mermaid')`，仅当文档中存在 mermaid 代码块或用户首次通过 Slash 插入时加载
- Vite 会自动切成独立 chunk
- 交付物：调整 `src/editor/plugins/mermaid.ts`，渲染前 `ensureMermaid()`

### 3.3 Vite 产物优化（预期省 ~30% 首屏 JS）

在 `vite.config.ts` 增加：

```ts
build: {
  target: 'chrome120', // 对齐 Electron 33 Chromium
  minify: 'esbuild',
  cssCodeSplit: true,
  sourcemap: false, // 生产不带 map
  reportCompressedSize: false,
  rollupOptions: {
    output: {
      manualChunks: {
        'milkdown': ['@milkdown/core', '@milkdown/preset-commonmark', '@milkdown/preset-gfm'],
        'prosemirror': [/^prosemirror-/],
        'xterm': ['@xterm/xterm', /@xterm\/addon-/],
        'shiki': ['shiki'],
      },
    },
  },
},
```

### 3.4 electron-builder 压缩与裁剪（预期省 5–10%）

`package.json#build` 补充：

```json
{
  "compression": "maximum",
  "asar": true,
  "files": [
    "dist/**/*",
    "electron/**/*.js",
    "!**/*.map",
    "!**/*.md",
    "!**/*.ts",
    "!**/test/**",
    "!**/__tests__/**",
    "!**/*.d.ts"
  ],
  "nsis": { "differentialPackage": true }
}
```

- `compression: maximum` 用 7z 极限压缩（构建慢 2-3 倍，安装包小 8-12%）
- `differentialPackage` 让增量更新只下载差异块

### 3.5 去除未用依赖 / 减重

- 审计 `dependencies`：`@milkdown/plugin-tooltip` 是否真用到？某些 prosemirror-* 是否传递依赖而无直接价值？
- xterm addons 按需加载（fit / webgl / search 仅在终端打开时）
- i18next 资源包：英中双语按运行时语言懒加载另一语言 JSON

### 3.6 资源与字体

- 审查 `resources/` 与 `public/`：有无内置 emoji 字体、Claude 字体等大文件（README 提到 Claude 字体）。字体文件若 > 500KB，改为系统回退或 WOFF2 子集化
- `.ico` 多分辨率合并，目前 8KB 可忽略

## 4. 不做的事（避免负收益）

- ❌ 替换 Electron 为 Tauri / Wails：会推翻 node-pty 终端栈，工作量巨大且破坏差异化优势
- ❌ 移除 Shiki 改用 highlight.js：Shiki 质量显著更好，按需加载后体积已可接受
- ❌ 外链 CDN 资源：违反「本地优先」品牌定位（见 design.md）
- ❌ 打包 pandoc：体积 100 MB+，按 ADR-001 采用"检测已装"策略

## 5. 实施阶段

| 阶段 | 任务 | 预期收益 | 工作量 |
|------|------|---------|--------|
| Phase 1 | 3.3 Vite 优化 + 3.4 builder 压缩 | -10% 安装包 / -30% 首屏 | 0.5 天 |
| Phase 2 | 3.1 Shiki 按需 + 3.2 Mermaid 懒加载 | -6% 安装包 / -40% 首屏 | 1–1.5 天 |
| Phase 3 | 3.5 依赖审计 + 3.6 资源瘦身 | -3% 安装包 | 1 天 |

## 6. 验收标准

- 构建产物 `release/*.exe` 与 `release/*.zip` 体积均下降 ≥ 15%
- 首屏 `dist/assets/index-*.js` gzip 后下降 ≥ 50%
- 冷启动到可编辑时间（开发机实测）无劣化，目标 ≤ 现状
- 所有现有功能（Mermaid、代码高亮、终端、导出等）回归通过
- 在 CI 中加入 `pnpm size-limit` 或简单脚本监控主 chunk 大小，PR 阈值告警

## 7. 风险

- `compression: maximum` 延长打包时间约 2-3 倍 — 本地开发仍用 normal，仅 release 通道使用
- Shiki 按需加载若漏注册语言会显示纯文本 — 做 fallback：未知语言显示"点此加载 xxx 语法"
- Mermaid 懒加载首次渲染有 300-500ms 延迟 — 加载中骨架屏即可
- Manual chunks 过度拆分会增加请求数 — Electron 本地加载无所谓，可放心拆
