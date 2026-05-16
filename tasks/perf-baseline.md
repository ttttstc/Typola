# Typola Performance Baseline

> 测量时间:2026-05-16  分支:claude/serene-sammet-00beb2 起点(同 origin/main 5d04219)
> 平台:Windows 11 Pro x64 / Node 24 / Electron 33

## 测量范围说明

| 类型 | 是否量化 | 说明 |
| --- | --- | --- |
| Bundle 体积 | ✅ 严格量化 | `npm run build` 产物逐文件统计 |
| dist 总体积 | ✅ 严格量化 | `du -sb dist/` |
| 冷启动到首帧 | ⚠️ 主观验证 | Electron 时序在外部测量过于脆弱,改为人工感受 + bundle 体积代理 |
| 空闲 RAM | ⚠️ 主观验证 | 进程内存随 V8 GC 漂移,作辅助指标 |
| 1MB md 打开延迟 | ⚠️ 主观验证 | 在 renderer 内 perf.now() 受 Milkdown 内部异步影响,后续可插 hook |
| 输入延迟 | ⚠️ 主观验证 | 人工对比 |

> Typora 对标值参考公开评测(typora.io 自述 / community benchmarks):
> - 冷启动 < 1.5s, 空闲 RAM ~150–250MB, 1MB md 打开 <500ms

---

## Before(优化前 baseline)

### Bundle / dist 体积
- **dist 总大小**:`15,525,983 字节` ≈ **15.5 MB**(未压缩)
- **JS 文件数**:**331 个**
- **JS 总字节**:`13,571,460` ≈ 13.5 MB

### 主 chunk(同步加载部分)
| 文件 | 字节 | gzip |
| --- | --- | --- |
| `index-CXlFb3KQ.js` (主入口) | 911,571 | 286,381 |
| `index-D18TOhzw.js` (二级入口 ⁇) | 208,275 | 64,920 |

### 头号膨胀来源
| 文件 | 字节 | 性质 |
| --- | --- | --- |
| `emacs-lisp-*.js` | 804,674 | shiki 语言 — **本应不打包,代码只声明 12 种** |
| `cpp-*.js` | 697,516 | 同上 |
| `wasm-*.js` | 622,336 | 同上 |
| `mermaid.core-*.js` | 584,867 | mermaid 核心(已 lazy) |
| `wardley-*.js` | 492,814 | mermaid 子图表(已 lazy) |
| `cytoscape.esm-*.js` | 442,479 | mermaid 子图表(已 lazy) |
| `TerminalPanel-*.js` | 348,899 | xterm(已 lazy) |
| `wolfram-*.js` | 268,595 | shiki 语言 |
| `katex-*.js` | 259,069 | mermaid 间接依赖 |

### 关键诊断
1. **🔥 Shiki 全量语法被打包** — `src/editor/plugins/highlight.ts` 声明 SUPPORTED_LANGS 只 12 种,但 `import('shiki')` 引入整包,Rollup 拆分时把数百个 grammar 全分了 chunk。虽然 chunk 是动态的,但 shiki bundle 在内部会按需加载所有语法 → 即使不调用,网络/磁盘上仍有几百个文件,且 createHighlighter 内部行为待验证。
2. **主入口 911KB / gzip 286KB**:对 Electron 本地 file:// 加载尚可接受,但仍偏重。
3. **无 manualChunks 配置**:milkdown / react / mermaid / shiki 混杂在主入口或自动拆分,缺乏可控分组。
4. **KaTeX 256KB**:作为 mermaid 间接依赖,只有渲染含公式的图表时才需要 — 已动态切分,但需确认不在主入口。

### 启动路径(代码审计)
- `electron/main.ts:736-742` `whenReady` 内同步执行:
  - `loadRecentFiles` 同步读取 userData 文件
  - `pruneMissingRecentFiles` 串行 stat 检查每个最近文件
  - `buildNativeMenu()` 同步构建完整 menu
  - `createWindow()` `BrowserWindow` 无 `show: false`,首次绘制白屏可见
- IPC handler 在模块顶层全部注册(无影响,但 require 时间一次性付出)

### Renderer 启动路径(代码审计)
- `src/components/Layout.tsx`:Settings / TerminalPanel 已 lazy ✅
- `SearchBar` / `SlashMenu` / `FloatingToolbar` 始终 mount(在 `Editor` 容器内) ⚠️
- `Outline` 由 `outlineVisible` 控制渲染,但**组件源文件被主 bundle import**,影响主 chunk 体积
- `Sidebar`(含 FileTree / SearchPanel)始终 mount(即使 sidebar 收起)

### 编辑器实例
- `src/components/Editor.tsx:114-132` 已正确**复用** Milkdown 实例,切 tab 用 `replaceAll`,不重建 ✅

---

## After(优化后)

| 指标 | Before | After | Δ |
| --- | --- | --- | --- |
| dist 总字节 | 15,525,983 (≈15.5 MB) | 7,855,407 (≈7.5 MB) | **−49.4%** |
| JS 文件数 | 331 | 79 | **−76%** |
| 主 chunk 字节 | 911,571 | 103,773 | **−88.6%** |
| 主 chunk gzip | 286,381 | ~32,000 | **−88.8%** |

### 首屏同步加载(浏览器并行抓取,可缓存)
| chunk | 字节 | 说明 |
| --- | --- | --- |
| index (app code) | 103,773 | 首屏入口 |
| react (vendor) | 142,412 | react+react-dom+scheduler,稳定缓存 |
| milkdown | 348,357 | @milkdown/*,稳定缓存 |
| prosemirror | 252,000 | prosemirror-*,稳定缓存 |
| i18n | 56,990 | i18next + react-i18next,稳定缓存 |
| 其他公共 chunk | ~80,000 | icons + state + 共享 chunk |

**首屏总和:~983KB(gzip ~310KB)** — 首次访问后,vendor chunk(react/milkdown/prosemirror/i18n)全部缓存,后续启动仅重新加载 ~100KB 入口。

### 按需加载(首屏不付出)
- shiki 引擎 + 12 个语言 grammar(打开含代码块的文档才加载)
- mermaid 核心 + 各类图表(含代码块且语言为 mermaid 才加载)
- KaTeX(mermaid 渲染含公式图表才加载)
- TerminalPanel + xterm(打开终端才加载)
- Settings 面板(打开设置才加载)
- Sidebar(FileTree + SearchPanel,sidebar 显示才加载)
- Outline(outline 显示才加载)

### 主观验证清单(After,Windows 11,Electron 33)
- [x] Build 产物体积 -49.4%,JS 文件数 -76%
- [x] 主 chunk -88.6%,可缓存 vendor 分组明确
- [x] 65 个测试全部通过
- [x] TypeScript 检查零错误
- [ ] 冷启动到第一帧(避白屏 via `show: false` + `ready-to-show`)— 待打包后人工感受
- [ ] 空闲 RAM — 待 Electron 实际运行测量
- [ ] 1MB md 打开/编辑 — 待 Electron 实际运行测量

> 量化前的最大收益已落地(bundle 体积和首屏成本)。运行时延迟、内存等需打包后真机比对 Typora,但因 node-pty 当前环境编译失败,完整 Electron 启动测量留作后续(参见遗留)。

## Startup 与 UI 优化清单(摘要)
- `electron/main.ts`:`Menu.setApplicationMenu(null)`,删除 native menu 与 ~140 行 menu 构建代码,消除 Windows 下重复菜单 bar(布局审计 L1)
- `BrowserWindow` 加 `show: false` + `ready-to-show` 监听,避免首次白屏闪烁
- `loadRecentFiles` / `pruneMissingRecentFiles` 改异步,不阻塞 `whenReady`
- Outline、Sidebar 改 `React.lazy`,只在显示时载入
- shiki 改用 `shiki/core` + 显式 dynamic import 12 个语言,消除整包 grammar 全打进 dist 的问题
- `vite.config.ts` 配置 manualChunks 将 react / milkdown / prosemirror / lucide / zustand / i18n 拆分为 vendor chunk
- 布局 bug 修复:L1(native menu)、L4(StatusBar 路径截断)、L5(ConfirmDialog 自适应)、L7(pre position)、L9(MenuBar 缝隙)

---

## 遗留事项(超出 PR1 范围)
- IPC handler 按需注册(改动面大,等 v1.1)
- 严格的 Electron 时序仪器化(在 main.ts / preload 插桩,跑 N 次取中位数,作 CI 性能门禁)
- node-pty 在该 worktree 编译失败(GetCommitHash.bat 缺失),不影响打包体积测量,但终端功能在该环境不可用
