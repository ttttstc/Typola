# CM6 Markdown 表格组件调研

日期：2026-07-14

## 目标

核查可直接复用的开源 CM6 表格组件，是否能补齐 Typola 当前缺失的“单元格删除”与完整表格操作，而不自建表格选区或编辑器架构。

## 结论

没有找到一个成熟的 CM6 组件能同时覆盖：多单元格选择、选中单元格清空、行列删除、整表删除、右键可扩展菜单和 Markdown 源码保真。

当前使用的 `codemirror-markdown-tables@1.0.0` 已有正确的 Markdown 表格删除语义：

- `Backspace` / `Delete` 清空已选中的单元格；
- 对已清空的选中行或列再按 `Backspace` / `Delete` 删除行或列；
- 提供行、列的新增、移动、复制、清空、删除以及复制、剪切、粘贴。

这与 Typora 的矩形 Markdown 表格模型一致：Markdown 表格不能留下“被删除而不影响行列结构的单元格”；单元格删除应是清空内容，结构删除应是删除行或列。Typora 也将表格编辑定义为行列操作、快捷键和表格菜单，而非稀疏单元格结构。

当前组件的缺口是公开 API：其源码内部存在整表删除逻辑，但没有公开的 `deleteTable` 命令或可配置的菜单项。因此，仅靠应用层 DOM 注入不能稳定增加“删除表格”。

## 候选对比

| 组件 | 可验证的能力 | 缺口 | 判断 |
| --- | --- | --- | --- |
| `codemirror-markdown-tables@1.0.0` | 多单元格选择；清空选中单元格；删除空行/空列；复制/剪切/粘贴；行列增删、移动、复制、对齐 | 未公开整表删除命令；菜单不可扩展 | 保持使用，能力面最接近目标 |
| `@markwhen/codemirror-tables@0.1.1` | 嵌套 CM6 单元格编辑；插入/删除行列；列对齐；公开的行列操作命令 | 官方 API 未提供多单元格选择、选中单元格清空或整表删除；仅两个版本、0 个依赖方（npm 页面） | 不替换，功能回退且成熟度不足 |
| `prosemirror-tables` | 公开 `deleteCellSelection`、`deleteRow`、`deleteColumn`、`deleteTable`，支持矩形单元格选择 | 依赖 ProseMirror 文档模型，不是 CM6；迁移会改变编辑器架构与现有 Markdown 单一数据源约束 | 仅作业界能力基线，不纳入本分支 |

## 推荐实施路径

1. 保持 `codemirror-markdown-tables` 作为 CM6 表格内核，保留其 `Backspace` / `Delete` 单元格清空、空行列删除与已有上下文操作。
2. 对“删除整张表”采用最小上游 fork/vendor：只暴露已存在的内部删除命令，并增加一个受支持的菜单项或回调；不复制表格解析、选区或行列算法。
3. 在 Typola 适配层只做中文文案和菜单触发，不操作上游菜单 DOM；为清空单元格、删除行、删除列、删除表分别增加集成测试。

这条路径满足“优先复用开源组件、不自研表格模型”，同时避免切换到功能覆盖更窄、维护信号更弱的候选组件。

## 一手来源

- [codemirror-markdown-tables README](https://github.com/ckant/codemirror-markdown-tables)：组件声明多单元格选择、`Backspace` / `Delete` 清空选中单元格、删除空行/列、剪贴板与行列操作。
- [codemirror-markdown-tables package.json](https://raw.githubusercontent.com/ckant/codemirror-markdown-tables/main/package.json)：确认版本、MIT 许可、CM6 peer dependencies 和仓库归属。
- [@markwhen/codemirror-tables 官方 npm README](https://www.npmjs.com/package/@markwhen/codemirror-tables)：确认公开 API 仅覆盖行列插删与对齐，未列出多选、清空或整表删除。
- [ProseMirror tables commands](https://raw.githubusercontent.com/ProseMirror/prosemirror-tables/master/src/commands.ts)：公开 `deleteCellSelection` 与 `deleteTable` 等命令。
- [Typora Table Editing](https://support.typora.io/Table-Editing/)：Typora 表格行列操作、快捷键与菜单行为基线。
