# AI 产物中心

用户可以把 AI 生成的 Markdown、HTML、PPT 草稿、图片和检视版留在本地 `.typola-output/<conversation>/`，再预览、打开、对比、归档、删除或安全地覆盖原文。

## 子功能

- `artifact-scan` 扫描当前会话或全部产物并按类型/标题/Agent 筛选。
- `artifact-preview` 预览 HTML/图片，或把 Markdown 打开到中央编辑器。
- `artifact-diff` 将 Markdown 产物与当前文档对比，确认后才应用。
- `artifact-lifecycle` 查看文件夹、归档/删除、覆盖原文并撤销覆盖。

## 用户视角入口

- 工具栏 `AI 产物` 打开 `AI 产物中心`。
- 产物范围 `当前会话 / 全部产物`、搜索框和 `产物类型` 下拉框。
- 产物卡片上的打开、预览、对比、所在文件夹、归档和删除动作。
- 覆盖原文后的 `撤销覆盖` 和历史版本入口。

## 用 exe-CDP harness 驱动

- 直接 exe 套件点击 `button[aria-label="AI 产物"]`，从 `aside[aria-label="AI 产物中心"]` 读取空状态；这证明入口和安全空目录边界，不证明有产物。
- 完整配方需在一次性 AI 工作目录生成真实文件，核对 `.typola-output` 路径、文件字节和预览，再分别执行对比、应用、撤销、归档和删除。
- 每次破坏性动作都要确认目标路径属于本次夹具；证据目录不能位于待清理的产物目录内。

## 陷阱

- AI 消息里出现文件名不等于磁盘产物已生成；必须读取实际文件和大小。
- HTML 产物默认预览，只有点击 `源码` 才进入中央编辑器；不能把 iframe 可见误报为 Markdown 打开。
- 覆盖原文前必须保留历史，路径保护拒绝工作区外和当前源文件之外的任意写入。
- 没有已认证 AI 会话时应标受阻/未验证，不生成假产物，也不删除用户已有 `.typola-output`。

维护信息：相关入口在 `src/components/artifacts/ArtifactCenterPanel.tsx`、`src/components/ArtifactPreview.tsx`、`src/hooks/useArtifactState.ts`、`src/hooks/useArtifactLibrary.ts` 和 `src/services/artifacts/`；最近核对日期为 2026-09-11，真实 exe 已执行空产物中心入口，真实产物生命周期未执行。
