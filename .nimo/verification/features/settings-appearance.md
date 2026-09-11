# 设置、外观与导出预设

用户可以在设置中调整编辑器、预览、图像、终端和外观选项，切换主题、字体、缩放及 Word/HTML 导出预设；这些设置不应改写 Markdown 内容。

## 子功能

- `appearance-theme` 切换主题/自定义颜色、纸纹和高对比显示。
- `editor-settings` 调整字体、字号、行距、行号、自动保存、打字机和 Tab 宽度。
- `preview-settings` 调整预览字体、宽度和 HTML/Word 预设。
- `settings-persistence` 修改后重新打开设置，确认值持久化且文档 source 不变。

## 用户视角入口

- 工具栏 `设置`，侧栏 `外观`、`编辑器`、`预览`、`Word 导出`、`HTML 导出`、`图像` 和 `终端`。
- 工具栏 `编辑主题颜色` 和外观主题卡片。
- 预览面板中的 `HTML 导出预设`、Word 预设选择器。

## 用 exe-CDP harness 驱动

- 运行 `npm run verify:exe-core`，点击 `设置 → 外观`，选择 `[data-theme-card="night-current"]`，读取 `html[data-theme-id]` 和 `data-color-scheme`，再确认 source 未变。
- 每个设置项必须通过可见控件修改，再关闭并重新打开设置读取持久化值；不能只调用设置服务或检查 React props。
- Word/HTML 预设还要用实际预览或导出产物核对样式；当前 exe 套件只执行主题切换，其他设置和预设未执行。

## 陷阱

- 主题改变的是 UI 和编辑辅助色，不应改变 Markdown、导出预设或文件字节。
- 应用主题和 Word/HTML 输出样式是两套配置；截图不能证明导出外观。
- 自动保存默认关闭，不能把设置面板里的开关状态当作已经写盘。
- 使用独立 WebView2 profile 验证持久化，清理 profile 时不得删除用户真实设置。

维护信息：相关入口在 `src/components/SettingsPage.tsx`、`src/components/settings/AppearanceSection.tsx`、`src/components/settings/EditorSection.tsx`、`src/components/settings/PreviewSection.tsx`、`src/components/settings/ExportSection.tsx` 和 `src/components/settings/WechatSection.tsx`；最近核对日期为 2026-09-11，真实 exe 已执行主题切换。
