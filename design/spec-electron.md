# Typola · Electron Migration Spec v1.0

> 从 Tauri 迁移到 Electron 的实现规范。基于 vision v2.0 / spec v1.0。
> 平台：Windows 10 1803+（首发）· 2026-04-20
>
> **迁移动机**：Tauri NSIS 打包在 Windows 上持续出现 WebView2Loader.dll 缺失问题，
> 各 webviewInstallMode 方案均不能稳定解决。Electron 内置 Chromium，彻底消除运行时依赖问题。

---

## 0. 迁移决策对比

| 维度 | Tauri（原方案） | Electron（新方案） |
|---|---|---|
| 安装包体积 | ~10MB（依赖系统 WebView2） | ~70-90MB（内置 Chromium） |
| Windows 用户体验 | 易翻车（WebView2 缺失） | 装完即用，零外部依赖 |
| 文件 IO | Rust command | Node.js `fs` / `electron` API |
| 文件监听 | `notify` crate | `chokidar` |
| 自定义标题栏 | `decorations: false` | `frame: false` |
| 前端代码复用 | — | React/TS 代码 **100% 复用** |

**包体积目标调整**：≤ 100MB（安装包压缩后约 70-80MB，Electron 行业现状）。

---

## 1. 技术栈

| 层 | 选型 | 版本 |
|---|---|---|
| 桌面壳 | **Electron** | ≥33.0 |
| 前端框架 | **React 18** + TypeScript | ≥18.0（复用现有代码） |
| 编辑器内核 | **Milkdown** (ProseMirror) | ≥7.0（复用） |
| 状态管理 | **Zustand** | ≥4.0（复用） |
| 代码高亮 | **Shiki** | ≥1.0（复用） |
| 图表 | **Mermaid** | ≥10.0，懒加载（复用） |
| 文件监听 | **chokidar** | ≥3.0 |
| 打包 | **electron-builder** | ≥25.0 |
| 打包格式 | NSIS（安装版）+ 便携 exe | — |
| 进程通信 | `ipcMain` / `ipcRenderer` + `contextBridge` | — |

**减包策略（核心）**：

- `asar: true`：源码打包成单文件，减少文件系统碎片
- `compression: maximum`：LZMA 最大压缩
- 排除不必要文件：`*.map`、`test/`、`docs/`、`*.md`（node_modules 内）
- 只打包 `x64` 单架构（不做 universal）
- Electron 版本锁定，不用 latest（避免 Chromium 版本跳变导致包体膨胀）

---

## 2. 工程结构

```
typola/
├── src/                        # 前端（React + TypeScript，与原项目几乎一致）
│   ├── components/
│   ├── editor/
│   ├── store/
│   ├── styles/
│   ├── App.tsx
│   └── main.tsx
├── electron/                   # 主进程（替换 src-tauri/）
│   ├── main.ts                 # 主进程入口
│   ├── preload.ts              # contextBridge 暴露 API
│   ├── file.ts                 # 文件 IO（对应原 file.rs）
│   ├── watcher.ts              # 文件监听（对应原 watcher.rs）
│   └── window.ts               # 窗口管理（大小记忆、自定义标题栏）
├── resources/
│   ├── icons/
│   └── typola.ico
├── index.html
├── vite.config.ts              # 前端构建
├── electron-builder.json       # 打包配置
├── tsconfig.json
├── tsconfig.electron.json      # 主进程 TS 配置（target: node）
└── package.json
```

---

## 3. IPC API 设计（替换 Tauri commands）

原 Tauri commands → Electron IPC channels，前端调用方式从 `invoke()` 改为 `window.electronAPI.*`。

### 3.1 preload.ts（contextBridge）

```typescript
// electron/preload.ts
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // 文件 IO
  readFile:    (path: string) => ipcRenderer.invoke('file:read', path),
  writeFile:   (path: string, content: string) => ipcRenderer.invoke('file:write', path, content),
  createFile:  (path: string) => ipcRenderer.invoke('file:create', path),
  renamePath:  (oldPath: string, newPath: string) => ipcRenderer.invoke('file:rename', oldPath, newPath),
  deletePath:  (path: string) => ipcRenderer.invoke('file:delete', path),
  listDir:     (path: string) => ipcRenderer.invoke('file:list', path),
  saveImage:   (workspaceRoot: string, data: Uint8Array, ext: string) =>
                 ipcRenderer.invoke('file:saveImage', workspaceRoot, data, ext),

  // 工作区
  pickFolder:  () => ipcRenderer.invoke('dialog:pickFolder'),

  // 文件监听事件
  onFileChanged: (callback: (path: string) => void) => {
    ipcRenderer.on('watcher:changed', (_, path) => callback(path))
  },
  offFileChanged: () => ipcRenderer.removeAllListeners('watcher:changed'),

  // 窗口控制（自定义标题栏）
  minimize:    () => ipcRenderer.invoke('window:minimize'),
  maximize:    () => ipcRenderer.invoke('window:maximize'),
  close:       () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),

  // 应用信息
  getVersion:  () => ipcRenderer.invoke('app:version'),
})
```

### 3.2 前端调用变更（唯一需要改的地方）

```typescript
// 原来（Tauri）
import { invoke } from '@tauri-apps/api/core'
const content = await invoke<string>('read_file', { path })

// 现在（Electron）
const content = await window.electronAPI.readFile(path)
```

将 `src/` 中所有 `@tauri-apps/api` 引用替换为 `window.electronAPI.*`，其余逻辑不变。

---

## 4. 主进程实现

### 4.1 main.ts

```typescript
// electron/main.ts
import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { registerFileHandlers } from './file'
import { registerWindowHandlers, createMainWindow } from './window'
import { Watcher } from './watcher'

app.whenReady().then(() => {
  const win = createMainWindow()
  const watcher = new Watcher(win)

  registerFileHandlers(ipcMain, watcher)
  registerWindowHandlers(ipcMain, win)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

### 4.2 window.ts（自定义标题栏 + 大小记忆）

```typescript
// electron/window.ts
import { BrowserWindow, ipcMain, screen } from 'electron'
import path from 'path'
import { loadConfig, saveConfig } from './config'

export function createMainWindow(): BrowserWindow {
  const config = loadConfig()
  const bounds = config.windowBounds ?? { width: 1280, height: 800 }

  const win = new BrowserWindow({
    ...bounds,
    minWidth: 800,
    minHeight: 600,
    frame: false,          // 自定义标题栏
    transparent: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.VITE_DEV_URL) {
    win.loadURL(process.env.VITE_DEV_URL)
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  win.on('close', () => {
    saveConfig({ windowBounds: win.getBounds() })
  })

  return win
}

export function registerWindowHandlers(ipcMain: Electron.IpcMain, win: BrowserWindow) {
  ipcMain.handle('window:minimize',    () => win.minimize())
  ipcMain.handle('window:maximize',    () => win.isMaximized() ? win.unmaximize() : win.maximize())
  ipcMain.handle('window:close',       () => win.close())
  ipcMain.handle('window:isMaximized', () => win.isMaximized())
}
```

### 4.3 file.ts（原子写 + 路径安全）

```typescript
// electron/file.ts
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import { dialog } from 'electron'

// 原子写：先写临时文件再 rename，防止写入中断
async function atomicWrite(filePath: string, content: string): Promise<void> {
  const tmp = filePath + '.tmp.' + crypto.randomBytes(4).toString('hex')
  await fs.writeFile(tmp, content, 'utf8')
  await fs.rename(tmp, filePath)
}

export function registerFileHandlers(ipcMain: Electron.IpcMain, watcher: Watcher) {
  ipcMain.handle('file:read',   (_, p) => fs.readFile(p, 'utf8'))
  ipcMain.handle('file:write',  (_, p, content) => atomicWrite(p, content))
  ipcMain.handle('file:create', (_, p) => fs.writeFile(p, '', 'utf8'))
  ipcMain.handle('file:rename', (_, oldP, newP) => fs.rename(oldP, newP))
  ipcMain.handle('file:delete', (_, p) => fs.rm(p, { recursive: true }))
  ipcMain.handle('file:list',   (_, p) => listDir(p))
  ipcMain.handle('file:saveImage', (_, root, data, ext) => saveImage(root, data, ext))
  ipcMain.handle('dialog:pickFolder', () =>
    dialog.showOpenDialog({ properties: ['openDirectory'] })
      .then(r => r.canceled ? null : r.filePaths[0])
  )
}
```

### 4.4 watcher.ts（chokidar）

```typescript
// electron/watcher.ts
import chokidar, { FSWatcher } from 'chokidar'
import { BrowserWindow } from 'electron'

export class Watcher {
  private watcher: FSWatcher | null = null
  private win: BrowserWindow

  constructor(win: BrowserWindow) { this.win = win }

  watch(filePath: string) {
    this.watcher?.close()
    this.watcher = chokidar.watch(filePath, { ignoreInitial: true })
    this.watcher.on('change', () => {
      this.win.webContents.send('watcher:changed', filePath)
    })
  }

  unwatch() { this.watcher?.close(); this.watcher = null }
}
```

---

## 5. 打包配置（electron-builder.json）

```json
{
  "appId": "com.typola.app",
  "productName": "Typola",
  "directories": {
    "output": "release"
  },
  "files": [
    "dist/**/*",
    "electron/dist/**/*",
    "resources/**/*",
    "!**/*.map",
    "!**/test/**",
    "!**/docs/**",
    "!**/*.md",
    "!**/README*",
    "!**/CHANGELOG*",
    "!**/LICENSE*"
  ],
  "asar": true,
  "compression": "maximum",
  "win": {
    "icon": "resources/typola.ico",
    "target": [
      { "target": "nsis", "arch": ["x64"] },
      { "target": "portable", "arch": ["x64"] }
    ]
  },
  "nsis": {
    "oneClick": false,
    "perMachine": false,
    "allowToChangeInstallationDirectory": true,
    "installerIcon": "resources/typola.ico",
    "installerLanguages": ["zh_CN"]
  },
  "portable": {
    "artifactName": "Typola-portable-${version}.exe"
  }
}
```

**预期产物体积**：

| 产物 | 预期体积 |
|---|---|
| NSIS 安装包（压缩后） | 70-85MB |
| 便携版 exe | 75-90MB |
| 安装后磁盘占用 | 200-220MB |

---

## 6. 前端改造清单（最小变更）

前端 React 代码几乎不动，只需替换 Tauri API 调用层：

### 6.1 删除

```bash
npm uninstall @tauri-apps/api @tauri-apps/plugin-dialog @tauri-apps/plugin-shell
npm uninstall @tauri-apps/cli
rm -rf src-tauri/
```

### 6.2 新增

```bash
npm install electron chokidar
npm install -D electron-builder electron-builder-notarize
npm install -D vite-plugin-electron vite-plugin-electron-renderer
```

### 6.3 TypeScript 类型（src/types/electron.d.ts）

```typescript
// 让 window.electronAPI 有类型提示
interface ElectronAPI {
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  createFile(path: string): Promise<void>
  renamePath(oldPath: string, newPath: string): Promise<void>
  deletePath(path: string): Promise<void>
  listDir(path: string): Promise<FileEntry[]>
  saveImage(workspaceRoot: string, data: Uint8Array, ext: string): Promise<string>
  pickFolder(): Promise<string | null>
  onFileChanged(callback: (path: string) => void): void
  offFileChanged(): void
  minimize(): Promise<void>
  maximize(): Promise<void>
  close(): Promise<void>
  isMaximized(): Promise<boolean>
  getVersion(): Promise<string>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
```

### 6.4 需要替换的文件（grep `@tauri-apps`）

```bash
grep -rl "@tauri-apps" src/
# 通常只有：
# src/store/workspace.ts  （pickFolder、listDir）
# src/store/editor.ts     （readFile、writeFile）
# src/editor/plugins/image.ts  （saveImage）
# src/components/TitleBar.tsx  （minimize/maximize/close）
# src/App.tsx             （onFileChanged listener）
```

逐一将 `invoke(...)` 替换为 `window.electronAPI.*(...)`，逻辑不变。

---

## 7. vite.config.ts 调整

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'electron/dist',
            rollupOptions: { external: ['electron'] }
          }
        }
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) { options.reload() },
        vite: {
          build: {
            outDir: 'electron/dist',
            rollupOptions: { external: ['electron'] }
          }
        }
      }
    ])
  ],
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          milkdown: ['@milkdown/core', '@milkdown/react'],
          // mermaid 不在这里，保持动态 import
        }
      }
    }
  }
})
```

---

## 8. package.json scripts

```json
{
  "scripts": {
    "dev":   "vite",
    "build": "tsc && vite build",
    "dist":  "npm run build && electron-builder",
    "dist:win": "npm run build && electron-builder --win"
  },
  "main": "electron/dist/main.js"
}
```

---

## 9. 迁移步骤（顺序执行）

- [ ] **Step 1**：安装 Electron 相关依赖，删除 Tauri 依赖和 `src-tauri/`
- [ ] **Step 2**：创建 `electron/` 目录，实现 `main.ts` / `preload.ts` / `file.ts` / `watcher.ts` / `window.ts`
- [ ] **Step 3**：添加 `src/types/electron.d.ts` 类型声明
- [ ] **Step 4**：grep `@tauri-apps`，逐文件替换 IPC 调用
- [ ] **Step 5**：调整 `vite.config.ts`，加入 `vite-plugin-electron`
- [ ] **Step 6**：`npm run dev` 验证开发环境运行正常
- [ ] **Step 7**：`npm run dist` 打包，验证安装包可正常安装和运行
- [ ] **Step 8**：验收全部功能（参照原 spec Phase 1-3 验收标准）

---

## 10. 验收标准

### 包体

- [ ] NSIS 安装包 ≤ 90MB
- [ ] 安装后无任何"缺少 DLL"或"缺少运行时"报错

### 功能（与原 spec 一致）

- [ ] 打开工作区、文件树显示、点击文件加载编辑
- [ ] 编辑后 500ms 自动保存，`Ctrl+S` 强制保存
- [ ] 外部修改检测（chokidar 监听）
- [ ] 自定义标题栏拖拽移动、最小化/最大化/关闭
- [ ] 窗口大小记忆（关闭再开恢复位置）
- [ ] 斜杠命令、浮动工具栏、大纲、Mermaid 双击编辑
- [ ] 图片粘贴/拖拽保存至 `.resources/`
- [ ] 亮色/暗色主题切换，重启后保留

---

## 11. 版本记录

- v1.0 · 2026-04-20 · 从 Tauri 迁移至 Electron，因 WebView2Loader.dll 打包问题无法稳定解决
