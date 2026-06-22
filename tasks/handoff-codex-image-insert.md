# Handoff — 图片展示 + 插入能力(对标 Typora)→ 交给 Codex

你冷启动接手 Typola(Tauri v2 + React 19 + TypeScript + Vite 桌面 Markdown 编辑器)。本次有两块**配套**任务,都对标 Typora:

1. **图片展示**(`docs/IMAGE_DISPLAY_SPEC.md`):让本地图 / 网络图在所见即所得编辑器和各预览里正常显示、粘贴即见。**这是前提,先做。**
2. **图片插入处理**(`docs/IMAGE_INSERT_SPEC.md`):复制到文件夹 / 上传图床自定义命令 / 路径格式,覆盖拖拽、粘贴、选本地文件三入口,功能放进设置。

**实施顺序:先做展示(否则插入了也看不见),跑通后再做插入。**

## 权威依据(两份,动手前都完整读一遍)

1. **`docs/IMAGE_DISPLAY_SPEC.md`** —— 图片展示(asset protocol 启用 + CSP 放行 + Rust 动态 scope + 粘贴后重 resolve)。**先做这份。** 关键坑:`convertFileSrc` 的 asset URL 跨平台不同(mac `asset://localhost`、Win `http://asset.localhost`),CSP 两个都要放行;scope 走**运行时动态 allow**(不限盘符),别图省事改成静态 `**`。
2. **`docs/IMAGE_INSERT_SPEC.md`** —— 图片插入处理(复制 / 上传 / 路径格式 / 设置面板)。展示跑通后做。

**严格照 SPEC 实现,行为要跟 Typora 一致。**

## 分支 + 提交纪律

- 当前分支 `codex/image-insert`(已从最新 main 拉好,含已合并的三态/选区/检视能力)。
- 你的输入文件:`docs/IMAGE_INSERT_SPEC.md`(权威 SPEC)+ 本 handoff。
- 工作树另有两个跟本任务无关的未跟踪项(`docs/Typola主题系统...md`、`src/_tmp/`),**别动它们**。
- 实施完成跑验证,**不要自行 `git commit`**(等用户)。

## 5 个最易踩错的点(SPEC 里有,这里再钉一遍)

1. **图床命令的 `${filepath}` / `${filename}` 是当前 Markdown 文件的路径/名,不是图片路径。** 图片路径是带引号、空格分隔、**追加到命令末尾**的参数(支持多图)。例:命令 `upload.sh`、2 张图 → 执行 `upload.sh "img1" "img2"`。
2. **图床输出取 stdout 的末 N 行**(N=本次图片数),不是首行、不是全部。前面几行可能是日志。
3. **`imageEnsureDotPrefix` 默认 `false`**(Typora 官方推荐关),别想当然设 true。
4. **拖拽入口要跟现有「拖 .md/.html 打开文档」逻辑区分**:拖入图片→插入;拖入文档→维持现有打开行为。别破坏现有 fileDrop。
5. **现有粘贴图片功能**(`src/app/AppLayout.tsx` 的 `handlePasteImage` + Rust `write_attachment_file`)是 copy 动作的最小闭环,**先复用/泛化它**验证,别推倒重写。

## 文件清单

### 展示(先做)
- `src-tauri/tauri.conf.json` —— 启用 `app.security.assetProtocol.enable`(scope 留空 `[]`)+ CSP `img-src` 放行 `asset:`/`http://asset.localhost`/`https://asset.localhost`/`https:`/`http:`/`blob:`(见 DISPLAY_SPEC §4.1-4.2)
- `src-tauri/src/lib.rs` —— 加 `allow_asset_directory(dir)` 命令(幂等,`asset_protocol_scope().allow_directory(dir, true)`)+ 注册进 `generate_handler!`
- `src/app/AppLayout.tsx` —— 打开文档流程里 `invoke('allow_asset_directory', { dir: <文档目录> })`(`resolveLocalImages` 之前)
- `src/components/WysiwygEditorPane.tsx` —— Vditor `input` 回调的 debounce 里追加 `resolveLocalImages(host, filePath)`(粘贴 / 插入即显示)

### 插入

**新增**:
- `src/components/settings/ImageSection.tsx` —— 设置「图像」分区 UI(照 `EditorSection.tsx` 模板)
- `src/services/imageInsert.ts` + `.test.ts` —— `formatImageSrc`(路径格式化纯函数)+ `parseTyporaCopyImagesTo`(YAML front matter 解析)+ 单测

**改动**:
- `src/services/settingsService.ts` —— 加 9 个字段 + defaults(见 SPEC 3.1)
- `src-tauri/src/lib.rs` —— `process_inserted_image` + `upload_image_via_command` 两命令 + `tauri::generate_handler!` 注册(见 SPEC 3.3)
- `src/app/AppLayout.tsx` —— 抽 `insertImageFromSource` 统一三入口(粘贴改造 + 拖拽 + 选文件)
- 设置页 section 注册处 —— 把 ImageSection 挂进设置导航(参照现有分区怎么挂)
- 工具栏或菜单加「插入图片」入口(选本地文件)

## 编码规范

- 注释、UI 文案一律**中文**。
- **surgical**:只碰必要的,别顺手重构相邻代码,别破坏现有粘贴图片闭环。
- **不引新依赖**:路径相对化用 Node/Rust 内置,YAML 用正则,图床用 `std::process`。
- 非平凡逻辑留单测:`formatImageSrc`(相对/绝对 + `./` 前缀 + 转义)、`parseTyporaCopyImagesTo`、Rust 图床 stdout 末 N 行解析。

## 验证套件(每阶段跑,全做完必须全绿)

```bash
npm run typecheck
npm test -- --run
cd src-tauri && cargo check && cd ..
npm run tauri:build:local
```

## 红线(不做)

- 移动到文件夹(删原文件,用户砍了)
- PicGo / uPic / iPic / Picsee 等 GUI 工具集成(只做「自定义命令」通用方案)
- 图片右键管理:删除 / 重命名 / 缩放 / 对齐 / 下载全部
- 新增第三方依赖

## 完成后

按两份 SPEC 的「实施顺序」做(**先展示、后插入**),每步跑验证。全做完报告各阶段验证结果 + 改动文件清单,**不 commit**。建议跑通后让用户启 Typola 实测:

- **展示**:打开含本地图(`./assets/x.png`)的 md 直接显示;粘贴图片当场显示(不重开);网络图(`https://...`)显示;**D: 盘**文档的本地图也显示(验证动态 scope 不限盘)。
- **插入**:粘贴 / 拖拽 / 选文件 三入口 × 保持原路径 / 复制 / 上传 三动作 + 图床验证按钮 + YAML 覆盖。
