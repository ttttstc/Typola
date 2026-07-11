## 2026-07-11 — CM6 linkOpenExtension 单测

- jsdom 缺真实 layout → `EditorView.posAtCoords` 抛 `textRange(...).getClientRects is not a function`。CM6 集成测试里涉及鼠标坐标派发的都不可靠；改为 stub `posAtCoords` 验证 handler 行为,或者只断言“无 modifier 不触发”这类稳定契约。
- 集成测试如果把 a 标签直接 `appendChild` 到 `contentDOM`,但 doc 仍以原始文本渲染,handler 找到的 offset 跟文本不一致 → 测试失败。删除 a 标签注入、改走 stub 才能稳定。

- `isRangeWithinSingleMarkdownBlock` 的判定要严格为“整段被一个特殊块吞没”，用 `boundary.from >= from && boundary.to <= to`；不要写成“任意方向跨越”，否则普通段落命中相邻 block 边界也会被错判跨块。
- `headingPathAt` 在文档开头（如 offset=0）属于根 heading 作用域，应返回 `[ '总览' ]`，不是空数组；写测试时不要假设空路径。
- `markdownBlockAt` 优先识别更具体的特殊块：mermaid/math/code/table，命中即返回对应 kind，不要被 section fallback 抢走。