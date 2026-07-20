# Build Guide — Typola (claude-theme-toolbar-stop)

项目专属构建会话指南。

## 环境命令

```bash
# 主题生成(必跑)
npm run build:themes

# 类型检查
npm run typecheck

# 前端测试
npx vitest run

# 端到端
npm run e2e

# 本地 Tauri build(每次改完代码必跑)
npm run tauri:build:local
```

## 构建流程

按 feature-list.json 顺序逐 feature 实施:

1. **Orient** — 读 design.md + feature-list.json + 本 build.md,确认当前 feature 目标
2. **TDD** — 先写失败测试(如适用),再写最小实现
3. **Quality** — `npm run build:themes` + `npm run typecheck` + `npx vitest run`
4. **Feature ST** — 自测 verification_steps 全部通过
5. **Persist** — 更新 feature-list.json status 为 `passing`,写 `.vibeflow/build-reports/feature-N.md`

## 关键规则

- 一次一个 feature,严格按 feature-list.json 顺序
- 主题改动后必须 `npm run build:themes`,否则 themes.css 不更新
- 停止按钮 cancel 路径必须 <1s idle,这是硬门禁
- 不跳过子步骤
- 改完代码必须 `npm run tauri:build:local` 给用户本地测试

## 文件范围

- `src/services/themeRegistry.ts` — 素笺 token 源头
- `scripts/theme-css-builder.mjs` — 主题生成脚本
- `src/styles/themes.css` — 生成产物(不要手改)
- `src/components/selection/SelectionFloatingBar.tsx` — 浮条 UI
- `src/components/EditorPane.tsx` / `src/components/WysiwygEditorPane.tsx` — 浮条宿主
- `src/hooks/useAgentSession.ts` — cancel 路径
- `src/services/agent/claudeStream.ts` — provider stream-handler 错误保护
- `src-tauri/src/lib.rs` — 已有 taskkill /T /F 兜底,不新增命令

## 验收

- feature-list.json 4 个 feature 全部 `passing`
- `npm run build:themes` 通过
- `npm run tauri:build:local` 通过
- 用户本地演示 4 件事 OK
