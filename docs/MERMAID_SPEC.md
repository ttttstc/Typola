# Mermaid 编辑与展示能力 SPEC —— 对标 Typora

- **日期**:2026-06-22
- **目标**:让 Typola 像 Typora 一样把 ` ```mermaid ` 代码块**渲染成图**——三态(阅读/心流/检视)统一,编辑光标进出有正确的「显图 ↔ 显源」切换,实时预览,语法错误可见,支持复制为 SVG/PNG,导出 HTML/微信预览/Word 预览时图嵌入。
- **关系**:跟 [IMAGE_DISPLAY_SPEC](./IMAGE_DISPLAY_SPEC.md) / [IMAGE_INSERT_SPEC](./IMAGE_INSERT_SPEC.md) 一起,凑齐 Typora 风格「图」能力。

---

## 一、现状(实测)

测试文件 `test-mermaid.md` 含 3 个 mermaid 块(flowchart / sequenceDiagram / classDiagram),在 Typola 里实测:

| 视图 | 行为 |
|---|---|
| **阅读模式**(`PreviewPane.tsx`,`Vditor.preview`) | ❌ 只显示纯文本代码,不渲染图 |
| **心流模式**(`WysiwygEditorPane.tsx`,`new Vditor({mode:'ir'})`) | ❌ 只显示纯文本代码,不渲染图 |
| **检视模式** | (基于阅读模式预览,预期同上) |
| **微信预览**(`WechatPreviewPane.tsx`) | (基于 `Vditor.preview`,预期同上) |
| **Word 预览**(`WordPaperPreviewPane.tsx`) | (基于 `Vditor.preview`,预期同上) |

**根因诊断**:
- ✅ Vditor CDN 资源里**已有** `public/vditor/dist/js/mermaid/mermaid.min.js`
- ✅ `markdownFeatureDetector.ts` 把 `mermaid` 列入 `VDITOR_RENDERED_FENCE_LANGUAGES`(代码"知道"该渲染)
- ❌ 但 `grep mermaidRender|useMaxWidth|"mermaid":` 在 `src/` 下零结果 —— **从未显式调用 Vditor 的 mermaid 渲染管线**,纯靠 Vditor 默认,默认没 work
- ❌ 4 个组件统一 `markdown: { sanitize: true }` —— sanitize 会过滤 mermaid 渲染出的 SVG/foreignObject 等内联 HTML(疑似真凶)
- ❌ `WysiwygEditorPane` 多了 `preview.markdown.codeBlockPreview: false`,可能进一步阻断 IR 模式下代码块的渲染管线

---

## 二、Typora 行为规格(目标,严格对齐)

### 1. 渲染态/编辑态切换

- **WYSIWYG 模式(对应 Typola 心流模式)**:
  - 光标**在 mermaid 代码块外**时:显示 **SVG 图**(图右下角小提示或 hover 露出"展开源码")
  - 光标**进入 mermaid 代码块**(点击图或 source 区)时:打开为代码编辑态,显示 ` ```mermaid ` 围栏 + 源代码,允许逐字编辑;编辑过程中**实时(或 debounce ~300ms)重渲染**
  - 离开代码块(光标移出/点其他区域):收回为 SVG 图态
- **Source 模式**(Typora 有专门的源代码视图,Typola 暂无对等):本规格不要求
- **Read-only 视图(对应 Typola 阅读/检视/微信预览/Word 预览)**:永远渲染成 SVG 图

### 2. 实时渲染策略

- 编辑过程中**debounce ~300ms** 后重渲染(避免逐字符触发卡顿)
- 渲染时机:Vditor `after()` 初始化完成、`input` debounce 结束、内容外部 setValue 之后
- **幂等**:重复渲染同一块不应叠加 DOM 节点(给已渲染块加 `data-typola-mermaid-rendered="true"` 标记跳过)

### 3. 错误处理

- 语法错误时(mermaid `.render()` 抛错):
  - 块内显示**原始源代码**(保底不丢内容)
  - 下方/右上角小红条显示错误信息(`mermaid parse error: …`)
  - 不阻塞文档其他内容渲染
- 解析超时(>5s,极端复杂图):同上,降级为源码 + 提示

### 4. 主题

- 跟随编辑器主题:浅色文档用 mermaid `default` 主题,深色文档用 `dark` 主题
- 通过 `mermaid.initialize({ theme: ... })` 或 `useMaxWidth`/`themeVariables` 设置
- Typola 当前是浅色优先,**默认走 `default`**;深色主题切换是后续任务,这里**预留接口**(读 `settings.themeId` 或类似),实施层不引入主题切换 UI

### 5. 复制/导出

- **右键菜单**新增「复制为 SVG」「复制为 PNG」(Typora 同款,**MVP 可仅做 SVG**,PNG 留下一期)
- 复制 SVG:取 mermaid 输出的 `<svg>` 元素,序列化为字符串,写剪贴板(`navigator.clipboard.write` + `image/svg+xml` blob)
- **导出 HTML**:现有 `wordPreviewArtifactService` / `htmlExport` 链路里,mermaid 块输出已是 SVG,**只要预览渲染图,导出就自动含图**(免新做)
- **导出 PDF**:Typola 当前无 PDF 导出,不在范围

### 6. 应用范围(全图类型)

Mermaid 支持的所有图类型都要正常渲染:
- flowchart / graph(`flowchart`、`graph TD/LR/...`)
- sequenceDiagram
- classDiagram
- stateDiagram(`stateDiagram-v2`)
- erDiagram
- gantt
- pie
- journey
- gitGraph
- mindmap
- timeline
- requirementDiagram
- C4 系列

**不主动维护白名单**,把代码块语言 = `mermaid` 的统统丢给 mermaid 库,由它自己判断子类型。

---

## 三、实现方案

### 3.1 共享渲染器(新建 `src/services/mermaidRenderer.ts`)

封装"扫描容器内所有 mermaid 代码块 → 渲染成 SVG → 替换 DOM" 的纯逻辑,供 4 个组件调用。

```ts
type MermaidRenderOptions = {
  theme?: 'default' | 'dark';
};

// 扫描 container 里所有未渲染的 mermaid 块(``` 代码块或 .language-mermaid pre),
// 调用 mermaid.render 生成 SVG,替换 DOM 节点。幂等(已渲染的跳过)。
// 错误时:保留源码 + 块下方插入 .typola-mermaid-error 提示。
export async function renderMermaidIn(
  container: HTMLElement,
  options?: MermaidRenderOptions,
): Promise<void>;
```

实现要点:
- mermaid 库 lazy import(`await import('mermaid')`),首次调用才加载,避免冷启动负担
- 也可复用 `public/vditor/dist/js/mermaid/mermaid.min.js`(已 bundled,体积一致),或者 `package.json` 加 `mermaid` 依赖统一管理 —— **二选一,建议加 `mermaid` 依赖**(版本可控,跟 Vditor 解耦,后续可独立升级 mermaid 而不动 Vditor)
- 选 mermaid 块的策略:Vditor.preview 渲染后,mermaid 代码块通常成为 `<pre><code class="language-mermaid">` 或 `<div class="language-mermaid">`。扫两种 selector:`pre > code.language-mermaid` 和 `.language-mermaid`,父元素替换为 `<div class="typola-mermaid" data-typola-mermaid-rendered="true">${svg}</div>`
- 渲染 ID 用 `m-${Date.now()}-${rand}` 避免 mermaid 内部 ID 冲突
- 错误 try/catch 包整个 render,失败时保留原 `<pre>`,append 一个 `.typola-mermaid-error` 红条

### 3.2 阅读模式(`src/components/PreviewPane.tsx`)

在 `Vditor.preview(...).after()` 现有逻辑里追加:

```ts
after() {
  // ...resolveLocalImages 已有
  void renderMermaidIn(el);  // 新增
}
```

### 3.3 微信预览(`src/components/WechatPreviewPane.tsx`)

同 3.2,在 `after()` 里追加 `renderMermaidIn(el)`,且必须在 `setPreviewResult(...)` **之前**——因为微信预览的 HTML 序列化要包含 SVG。

### 3.4 Word 预览(`src/components/WordPaperPreviewPane.tsx`)

`Vditor.preview` 的 `after()` 里追加,且在样式后处理(applyTextStyle / 段后插 caption 等)**之前**——确保后续 DOM 遍历能看到 SVG 而不是原 pre。

### 3.5 心流模式(`src/components/WysiwygEditorPane.tsx` —— **最复杂**)

`new Vditor({ mode: 'ir' })` 的 IR 模式,代码块在编辑器内部直接渲染。需要:

1. **初始化触发**(Vditor `after()` 回调):
   ```ts
   after() {
     const host = hostRef.current;
     if (host) {
       void resolveLocalImages(host, filePath);   // 已有
       void renderMermaidIn(host);                 // 新增
     }
   }
   ```

2. **input debounce 后触发**(已有的 collapseTimer):
   ```ts
   collapseTimerRef.current = window.setTimeout(() => {
     // ...silence + collapse + resolveLocalImages 已有
     if (host) void renderMermaidIn(host);  // 新增
   }, IR_MARKER_COLLAPSE_DELAY_MS);
   ```

3. **编辑态切换**(Typora 标志性体验,**MVP 简化版**):
   - **MVP 接受**:Vditor IR 模式默认行为 —— 光标进入 mermaid `<pre>` 时它会展开为可编辑代码块,光标移出后块收回。我们的 `renderMermaidIn` 在 debounce 后扫描"未渲染" 的块,所以**光标在块内时该块跳过渲染**(由 Vditor 自身的展开机制保护)
   - 实现细节:`renderMermaidIn` 扫描时**排除当前 selection 所在的祖先 pre 块**(`isInUserSelection(preEl)` 检查),让用户正在编辑的块保持源码可编辑
   - **完整版**(下一期):自己实现"光标进入 → 显源代码 / 光标移出 → 显 SVG" 的双态切换(可能要 fork 一份 Vditor 渲染管线),代价高,MVP 不做

4. **检查并关闭 codeBlockPreview: false**:实测看是否影响 mermaid 在 IR 模式下的展示。若影响,改成 `codeBlockPreview: true`(可能改后会引入其他代码块预览行为,实施时观察)。**保留为可调整点,实施时实测决定**

### 3.6 sanitize 问题

Vditor `markdown.sanitize: true` 会过滤 SVG。两种解法:

- **方案 A(推荐)**:保持 `sanitize: true`,但**我们的 `renderMermaidIn` 在 Vditor 渲染完之后跑**,我们注入 SVG 时绕过 sanitize(因为 sanitize 只作用于 Vditor 的 markdown 转 HTML 步骤,运行时手动 DOM 操作不过 sanitize)。**这是默认行为,实施时验证**
- **方案 B(兜底)**:若方案 A 因为 Vditor 内部 mermaid 触发机制有问题,改成 `markdown: { sanitize: false }` —— **不推荐**(影响 markdown 整体 XSS 防御)

实施时先按方案 A 跑通,A 通了就不需要动 sanitize。

### 3.7 错误条样式(`src/styles/preview.css` 或新文件)

```css
.typola-mermaid {
  display: flex;
  justify-content: center;
  margin: 1em 0;
}
.typola-mermaid svg {
  max-width: 100%;
  height: auto;
}
.typola-mermaid-error {
  background: #fdecea;
  color: #c0392b;
  font-family: var(--mono-font-family);
  font-size: 0.85em;
  padding: 8px 12px;
  border-left: 3px solid #c0392b;
  margin: 0.5em 0;
  white-space: pre-wrap;
}
```

### 3.8 复制为 SVG(右键菜单)

- 已有 `EditorContextMenu.tsx`(三态都有右键菜单)
- 当右键命中点在 `.typola-mermaid` 内时,菜单项新增「复制为 SVG」
- 点击 → 取祖先 `.typola-mermaid svg`,`new XMLSerializer().serializeToString(svg)` 写剪贴板
- **PNG 留下一期**(需要 canvas 序列化,工作量大)

---

## 四、实施顺序

1. 新建 `src/services/mermaidRenderer.ts` + 单测(纯函数:输入含 mermaid 块的 HTML,断言输出含 `<svg>` 或错误条)
2. `package.json` 加 `mermaid` 依赖
3. PreviewPane `after()` 接入 → 实测阅读模式三块图全显
4. WechatPreviewPane + WordPaperPreviewPane `after()` 接入 → 实测两个预览也显
5. WysiwygEditorPane `after()` + `input` debounce 接入 → 实测心流模式也显;实测编辑态切换(光标进/出)合理
6. 处理错误样式 + 错误兜底
7. 右键菜单加「复制为 SVG」
8. 跑验证套件 + 实测全套(`test-mermaid.md` 应在三态都显图)

---

## 五、验收标准

- `npm run typecheck` / `npm test -- --run` / `cargo check` / `npm run tauri:build:local` 全绿
- 打开 `test-mermaid.md`,**阅读 / 心流 / 检视 三态都把 3 个 mermaid 块渲染成图**(flowchart 有节点连线,sequenceDiagram 有时序箭头,classDiagram 有类框继承线)
- 心流模式下,**光标进入 mermaid 块** → 显源代码可编辑;**光标移出** → 收回为图(MVP:Vditor 默认行为足够;不要求 Typora 一模一样的过渡动画)
- 编辑过程中**实时(debounce 300ms)重渲染**,不卡顿
- 故意写错语法(`flowchart TD\n  A --> B[` 缺右括号)→ 块下方显示红色错误条,文档其他部分继续渲染正常
- 右键 mermaid 图 → 「复制为 SVG」可用,粘到外部能粘到 SVG 文本
- 微信预览 / Word 预览也显图 → 导出的 HTML 含 SVG 节点(可在浏览器单独打开)
- 全图类型抽样测一遍:flowchart / sequence / class / pie / gantt → 都正常

---

## 六、范围红线(不做)

- **PNG 复制 / 导出**(本期只做 SVG;PNG 要 canvas 序列化,工作量翻倍)
- **mermaid 主题动态切换 UI**(只在代码里读 `settings.themeId`,留接口;切换 UI 跟全局主题一起做)
- **mermaid editor 高级体验**(语法高亮、自动补全、错误高亮在源代码行号)
- **fork Vditor IR 渲染管线**实现完美的 Typora 双态切换(MVP 用 Vditor 默认行为)
- **流式更新**(AI 流式生成 mermaid 时**逐字渲染**)—— mermaid 部分语法在生成中会反复报错,得在生成结束才渲染。实施层加判断:若代码块尾部 ` ``` ` 围栏不完整,不触发 mermaid 渲染
