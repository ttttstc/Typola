# 修复手册:选区菜单 / 浮条隐藏 / issue #170 打开文件夹 / 基础编辑能力

## 背景

Typola 主编辑视图是 Vditor IR 模式。本 PR 对齐 4 点:

1. **右键菜单宽度不再撑满屏幕** — 旧 `.editor-ctx-menu { min-width: 196px }` 锁死宽度,导致纵向堆叠多个 group 时被 kbd hint 顶到 200+px、长文案项满屏。Typora / Obsidian 菜单默认 180~220px 自适应。
2. **浮条加「本页不再展示」「全局隐藏」**,hover 提示文案。已有 `selectionFloatingBarEnabled` 设置开关不变。
3. **issue #170**:支持 Cmd+Shift+O 打开一个或多个文件夹(仅读第一层 md/html/docx,跳过 .txt / .git 等)。Fix 旧 toolbar `FolderOpen` 图标语义错位问题。
4. **基础编辑能力补齐**:`升级引用 / 降级引用 / 编辑链接 / 清除格式 / 编辑代码块语言`,对标 Typora/Obsidian,只做「选中→直接处理」,新动作全部经现有 `applyVditorFormat` 分发。

表格编辑 (`/table`) 单独走 issue #174 + PR,不在本 PR。

## 关键变更

| 文件 | 改动 |
|---|---|
| `src/services/i18n.ts` | +11 keys 中英日三译(`toolbarOpenFolder* / contextMenu* / floatingBar*`);`I18nKey` 改 export |
| `src/services/fileService.ts` | +`openFolder` 函数(Tauri `dialog.open({directory:true,multiple:true})` → `read_first_level_openable` Tauri cmd → `openPath` 批量) |
| `src-tauri/src/lib.rs` | +`read_first_level_openable` Tauri cmd,注册 invoke |
| `src/hooks/useFileTabs.ts` | +`handleOpenFolder` 回调,类型接口同步 |
| `src/components/Toolbar.tsx` | +`onOpenFolder` prop + `FolderDown` 新按钮,保留 `FolderOpen` 文件按钮不动 |
| `src/app/AppLayout.tsx` | 桥接 `handleOpenFolder`;加全局 Cmd+Shift+O 快捷键 |
| `src/styles/app.css` | 删除 `.editor-ctx-menu` 的 `min-width: 196px`,改 `width:max-content; max-width:240px`;kbd margin-left 16→10px;加 `.selection-floating-bar-more-*` 样式 |
| `src/components/EditorContextMenu.tsx` | FormatAction 加 5 个 variant (`quote-up / quote-down / clear-format / codeblock-lang / link-edit`);菜单插入 5 个 `<MenuItem>` |
| `src/services/vditorFormatService.ts` | 5 个 case 接入(`applyQuoteLevel / applyLinkEdit / applyClearFormat / applyCodeblockLang`) |
| `src/components/selection/SelectionFloatingBar.tsx` | +`onDismissSession / onHideGlobally` props;右端 ⋯ 按钮 + mini menu;tooltip(Tauri+translate+`selection-floating-bar-more`) |
| `src/components/WysiwygEditorPane.tsx` | +`floatingBarHiddenDocsRef`(filePath 维度 session suppress);`handleDismissSession / handleHideGlobally` |
| `src/components/settings/EditorSection.tsx` | 浮条 toggle 描述文案加「浮条右端 ⋯ 按钮快捷入口」 |
| `services/vditorFormatService.test.ts` (新) | `link-edit / clear-format / codeblock-lang` 行为覆盖,invalid 选区/no-op 保护 |
| `services/fileService.test.ts` | +`openFolder` 用例(正常多文件 + dialog cancel) |
| `components/EditorContextMenu.test.tsx` (新) | 5 个新 menu item 渲染 + click 派发 |
| `components/selection/SelectionFloatingBar.test.tsx` | 扩展覆盖:默认下无 ⋯;传 onDismissSession/onHideGlobally 渲染 ⋯ |

## 实测步骤(手动)

1. `npm run tauri:build:local` 出包 → 运行
2. **右键菜单**:在编辑器正文开右键,菜单宽度应 ≈180-220px,不撑满
3. **浮条 × 子按钮**:选中文字 → 浮条出现,右端可见 ⋯ 按钮,hover tooltip = "选中文字时浮现 · Esc 关闭 · 本页不再展示 · 全局隐藏"
   - 点 ⋯ → menu 弹出「本页不再展示」「全局隐藏」
   - 点击「本页不再展示」 → 同一文档不再弹浮条,切文档再切回又弹
   - 点击「全局隐藏」 → 所有文档不再弹(设置 → 编辑器 → 选区浮条 toggle 同步置 off)
   - Esc 关闭浮条 — 仅当前选区,重选再弹
4. **打开文件夹**:点工具栏 FolderDown 按钮 → 选夹 → 子级 `.md/.docx/.html` 全部入 tab(last active);跳过 `.txt` `.git`;不支持子目录递归
   - 键盘 Cmd+Shift+O 同样触发
5. **引用升级/降级**:选中某行 → 右键「升级引用」行首加 `> `;再点一次加 `>> `;「降级引用」剥一层
6. **编辑链接**:选中 markdown 链接 `[label](url)` → 右键「编辑链接」→ prompt 预填原 url → 确认后整 link 替换
7. **清除格式**:选中 `**bold** \`code\`` → 右键「清除格式」→ 选区内 markdown 标记 strip
8. **编辑语言**:选中 fenced code block → 右键「编辑语言」→ prompt 预填当前 lang → 确认后 fence 重拼
9. **目录级**:
   - 设置 → 编辑器 → 选区浮条 toggle:off 全局隐藏后,仍可在浮条内 ⋯ →「全局隐藏」反向 off
   - 工具栏 `FolderOpen` 图标保留(文件按钮),不做修改;新按钮 FolderDown 独立紧邻

## 单测清单

```bash
npx vitest run \
  src/services/vditorFormatService.test.ts \
  src/services/fileService.test.ts \
  src/components/EditorContextMenu.test.tsx \
  src/components/selection/SelectionFloatingBar.test.tsx
```

## 不在本 PR 范围

- 表格编辑(问题 3) → issue #174 + 单独 PR
- 脚注 / 上标 / 下标 / highlight / drop cap / wiki link → roadmap
- v1 不绑新 kbd (菜单内 kbd 文本标示即止)
- 不重构相邻代码
