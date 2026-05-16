# Layout & Sizing Audit

> 仅针对**不合理的布局/宽度/间距**修复,**不动整体风格** — 风格留 PR2。

## 🔴 Critical(肉眼可见 bug)

### L1. 菜单栏重复 — 用户能看到两条菜单
- **现象**:`electron/main.ts:270` 调用 `Menu.setApplicationMenu(...)` 建了 native menu,而 `BrowserWindow` 用 `frame: false`(无原生标题栏)。在 Windows 上,即使 `frame:false`,只要设置了 applicationMenu,**Electron 仍会在窗口顶部渲染一条原生 menu bar**。同时 [MenuBar.tsx](src/components/MenuBar.tsx) 在 renderer 又画了一条自定义菜单 → **两条堆叠**。
- **修复**:在 `createWindow()` 调用 `Menu.setApplicationMenu(null)`,只保留 renderer 的 MenuBar。Native menu 的快捷键改由 renderer 的 keydown 处理(大部分已实现:Ctrl+S/N/F 等已在 Editor.tsx 绑定)。
- **影响**:同时大幅简化 main.ts,删除 `buildNativeMenu`、`translate`、`recentFiles` 推送到 menu 的逻辑约 100 行。

---

## 🟡 Major(明显不合理)

### L2. Sidebar/Outline 隐藏时 4px 拖拽条仍存在
- **现象**:[Layout.tsx:91-114](src/components/Layout.tsx) `sidebarVisible && (...)` 把整个 sidebar + 拖拽条一起渲染。但拖拽条的 `marginLeft: -2px` 在某些 DPR 下会让内容区错位 1px。
- **修复**:拖拽条用 `position: absolute` 浮动在 sidebar 边缘,避免参与 flex 流。
- 优先级:低。可保留。

### L3. TabBar 在窗口窄(<800)时溢出但无 scroll affordance
- **现象**:[TabBar.tsx:174](src/components/TabBar.tsx) `overflowX: auto`,但没有 scrollbar 样式,且 tab `min-width:100px` 在 5 个 tab 以上、窗口窄时强制横向滚动,没有左右指示。
- **修复**:在 tab 容器加细的 scroll-shadow(纯 CSS),提示可滚动。

### L4. StatusBar 文件路径无截断
- **现象**:[StatusBar.tsx:43-47](src/components/StatusBar.tsx) 长路径无 `text-overflow: ellipsis`,窗口窄时会把左侧字数挤掉。
- **修复**:右侧 path 加 `max-width: 50%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap`。

### L5. ConfirmDialog 固定宽度 360px,小窗口溢出
- **现象**:[TabBar.tsx:38](src/components/TabBar.tsx) `width: 360px`。在 800px 最小窗口下还行,但移动到小屏外接显示器会贴边。
- **修复**:`width: min(360px, calc(100vw - 32px))`。

### L6. 下拉菜单 zIndex 与 Settings 等竞争
- **现象**:MenuBar 子菜单 `zIndex: 2000`,ContextMenu `3000`,ConfirmDialog `3000`。Modal 不一致。
- **修复**:统一为一组语义化常量(暂用就地标注,不引新文件)。

### L7. CodeBlock copy 按钮 absolute 定位但 `pre` 没显式 position
- **现象**:[highlight.ts:112](src/editor/plugins/highlight.ts) 运行时给 `pre` 设 `position: relative`,但 CSS 没声明,初次 paint 复制按钮位置可能漂移到页面左上角。
- **修复**:`editor.css` 给 `.ProseMirror pre` 加 `position: relative`。

---

## 🟢 Minor(可优化但不影响使用)

### L8. TitleBar 关闭按钮 hover 红色硬编码 `#e81123`
- **现象**:[TitleBar.tsx:141](src/components/TitleBar.tsx)。暗主题下亦然,但 hover 是窗口控件惯例,可保留。
- **修复**:可保留,标 token 化作为 PR2 工作项。

### L9. MenuBar 第二层菜单 marginTop: 2px 与按钮间出现 1px 鼠标缝隙
- **现象**:[MenuBar.tsx:700](src/components/MenuBar.tsx) 子菜单 `marginTop:2px`,鼠标从按钮往下滑过缝隙时菜单关闭。
- **修复**:子菜单 `marginTop: 0` 或加入透明 hover bridge。

### L10. Outline 标题区 `text-transform: uppercase` 中文不友好
- **现象**:[Outline.tsx:44](src/components/Outline.tsx) `textTransform: uppercase` 对中文是 no-op,但对未来 i18n 切换有视觉割裂。
- 决定:保留(英文标识 UI 惯例)。

### L11. 编辑器内容 max-width: 820px,大屏左右白边大
- **现象**:[editor.css:2](src/styles/editor.css)。Typora 同款,保留。

### L12. SearchPanel 工作区结果每条 match 全量渲染无虚拟化
- **现象**:[SearchPanel.tsx:410](src/components/SearchPanel.tsx) `.map` 全量。命中 1000+ 处时卡。
- **修复**:留给性能优化任务 6 处理。

### L13. FileTree 长文件名截断策略
- 待 FileTree.tsx 内部检查。

---

## 决策

PR1 修这些:**L1, L4, L5, L7, L9** — 都是真 bug 或一行修复。
其余按风险/收益留到 PR2。
