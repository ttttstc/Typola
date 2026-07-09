# 选区菜单窄化 / 浮条隐藏 / issue #170 打开文件夹 / 基础编辑能力

## 进度清单

- [x] Step 1: i18n 新增 keys(中英日三语)
- [x] Step 2: Tauri cmd read_first_level_openable
- [x] Step 3: fileService openFolder
- [x] Step 4: useFileTabs handleOpenFolder
- [x] Step 5: Toolbar onOpenFolder button
- [x] Step 6: AppLayout bridge
- [x] Step 7: CSS ctx menu width fix
- [x] Step 8: EditorContextMenu 5 new actions
- [x] Step 9: vditorFormatService 5 new cases
- [ ] Step 10: v1 不添加全局快捷键(跳过)
- [x] Step 11: SelectionFloatingBar more button
- [x] Step 12: WysiwygEditorPane behavior
- [x] Step 13: EditorSection help text
- [x] Step 14: tests pass (26)
- [x] Step 15: 手册 + CHANGELOG

## 0.0.3 测试基线
- baseline: 67 failed / 586 passed (32 failed files)
- 改动后: 59 failed / 597 passed — 新增 26 个测试全过,未新增失败


## 0.0.0 现状
- 主编辑视图为 Vditor IR 模式
- CM6 仅在源码模式
- 不引入 @milkdown/prosemirror

## 0.0.1 实施边界
- 本次 PR:问题 1 + 2 + issue #170 + 问题 4 (5 个新 FormatAction)
- 表格编辑(问题 3)单独走 issue #174 + PR

## 0.0.2 已完成细节

### Step 1 — i18n 新增 keys
- `toolbarOpenFolderTitle` = "打开文件夹 (Cmd+Shift+O)" / "Open folder (Cmd+Shift+O)" / "フォルダを開く (Cmd+Shift+O)"
- `toolbarOpenFolderLabel` = "打开文件夹" / "Open folder" / "フォルダを開く"
- `contextMenuQuoteUp` / `contextMenuQuoteDown` / `contextMenuLinkEdit` / `contextMenuClearFormat` / `contextMenuCodeblockLang`
- `floatingBarHideThisPage` / `floatingBarHideGlobal` / `floatingBarTooltip`
