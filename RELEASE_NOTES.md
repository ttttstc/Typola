# Release Notes — claude-theme-toolbar-stop

## [Unreleased] - 2026-07-10

### Theme
- 素笺(plain-paper)配色对齐 Claude.ai 浅色参考:bg #faf9f5 / ui #f5f2eb / accent #d97757 / link #6e5fbe / danger #a83a3a / success #3a7a5b

### UI
- 选区浮条新增「本文档不再展示」「全局隐藏」独立按钮,样式与现有一致(icon+label)
- 全局 contextmenu 事件关闭浮条

### Core
- 停止按钮无条件兜底 <1s idle,provider 卡死/非法 JSON/流 hang 8s 超时强制收尾
- UI 显示「已停止」状态
