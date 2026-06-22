# 图片插入能力 SPEC —— 严格复刻 Typora

- **日期**:2026-06-22
- **目标**:把 Typora「图像」偏好设置那套图片插入处理能力,严格一致地搬进 Typola 的设置。
- **范围**:插入图片时的自动处理(复制到文件夹 / 上传图床自定义命令 / 路径格式),覆盖拖拽 / 粘贴 / 选本地文件三条入口。
- **不做**(范围红线,见末尾):移动到文件夹、PicGo/uPic 等 GUI 工具集成、图片右键管理(删除/重命名/缩放/对齐/下载全部)。

---

## 一、Typora 行为规格(实现依据,必须严格一致)

下面是从 Typora 官方文档(support.typora.io/Images、support.typora.io/Upload-Image)提炼的精确行为约定。**实现以此为准。**

### 1. 插入入口

四种,都要触发同一套「插入时处理」:
- 写 Markdown 语法(`![]()`)—— 不处理(用户手写)
- 拖拽图片文件进编辑器
- 菜单 / 快捷键「选择本地图片」
- 粘贴剪贴板图片

本 SPEC 覆盖后三种(拖拽 / 选文件 / 粘贴)的自动处理。

### 2. 「插入图片时…」动作(When Insert)

下拉选项(Typora 原始为 4 个,**移动按用户决策砍掉**,保留 3 个):
- **保持原路径**(默认行为之一):`src` 用图片原始路径。
- **复制到指定文件夹**:把图片复制进目标文件夹,`src` 改为指向复制后的文件。
- ~~移动到指定文件夹~~ —— **不实现**(用户决策)。
- **上传图床(自定义命令)**:把图片交给自定义命令上传,`src` 改为返回的 URL。

**应用范围**(两个独立开关):
- `对本地图片应用上述规则`(Apply to local images)—— 默认开。
- `对网络图片应用上述规则`(Apply to online images)—— 默认关。开启后,已是远程 URL 的图片也会被重新处理(复制动作=下载到本地;上传动作=重新上传)。

### 3. 目标文件夹 + 占位符 + YAML 覆盖(严格一致)

- 全局设置填一个文件夹路径,**相对当前文档目录**(如 `assets`、`_media`、`./img`)。
- **占位符** `${filename}` = 当前 Markdown 文件名(**不含扩展名**)。例:文档 `周报.md` + 目标 `${filename}.assets` → 实际目录 `周报.assets/`。
- **YAML 文档级覆盖**:文档 front matter 里的 `typora-copy-images-to: <值>` 覆盖全局设置:
  - 值为**相对路径**(如 `_media`)→ 复制到该文件夹。
  - 值为字面量 **`upload`** → 该文档走「上传图床」(需另一开关 `允许根据 YAML 设置自动上传图片` 打开)。
- 复制时若目标已有同名文件,自动追加序号去重(现有 `unique_attachment_path` 行为)。

### 4. 路径格式(Preferred Image Syntax,严格一致)

三个独立开关,作用于最终写进文档的 `src`:
- `优先使用相对路径`(Use relative path if possible)—— 默认**开**。文档已保存时,`src` 写成相对当前文件的路径;否则用绝对路径。
- `相对路径加 ./ 前缀`(Ensure ./ Prefix)—— 默认**关**(Typora 官方文档明确「we recommend to disable it」,只为兼容 VuePress 等才开)。开启后相对路径强制带 `./`。
- `插入时转义路径`(Auto escape image URL when insert)—— 默认**关**。开启后把 `src` 里的空格等转义(空格→`%20`,URL encode)。

### 5. 图床自定义命令(精确约定,最易踩错)

- **命令格式**:用户在设置里填一条命令(如 `picgo upload`、`/path/to/upload.sh`)。
- **输入(图片路径)**:Typora 把**所有**待上传图片的路径,**带引号、空格分隔,追加到命令末尾**。例:填 `upload.sh`,上传 2 张图 → 实际执行 `upload.sh "img-path-1" "img-path-2"`。**支持批量多图**。
- **占位符**:命令字符串里可用:
  - `${filename}` = 当前 **Markdown 文件名**
  - `${filepath}` = 当前 **Markdown 文件完整路径**
  - ⚠️ **这两个是当前文档的,不是图片路径!** 图片路径永远是追加在命令末尾的参数。未保存文档时这两个占位符替换为空字符串。
- **输出(URL)**:从命令 stdout 的**最后 N 行**取 URL(N = 本次上传的图片数)。每行一个 URL,顺序对应输入顺序。命令前面几行可以是日志(如 `Upload Success:`),Typora 只取末 N 行。
- **失败**:命令 exit code 非 0,或 stdout 末 N 行解析不出有效 URL → 视为失败。**本 SPEC 增强**:失败时回退到「复制到本地文件夹」(避免图片丢失);Typora 原版是报错,但回退更安全,作为我们的改进(handoff 里注明)。
- **执行环境**:命令字符串交给系统 shell 执行(Windows `cmd /c "<command> \"img\"..."`,macOS/Linux `sh -c '<command> "img"...'`)。
- **验证按钮**(Test Uploader):用一张测试图跑一次完整上传,把命令的 raw stdout/stderr + 解析出的 URL 显示在对话框,失败显示原因。

### 6. YAML 自动上传开关

- `允许根据 YAML 设置自动上传图片`(Allow upload images automatically based on YAML settings)—— 默认关。开启后,文档 `typora-copy-images-to: upload` 才生效。

---

## 二、Typola 现状 + 差距

现状(`src/app/AppLayout.tsx:580` `handlePasteImage` + Rust `write_attachment_file`):
- **只有粘贴**剪贴板图片一条入口。
- 写死复制到文档同级 `assets/`,返回 `./assets/<name>`。
- settings 零图片配置,无 UI。

差距:拖拽 / 选文件入口缺失;目标文件夹、路径格式、图床全部缺失;无设置 UI;无 YAML 覆盖。

---

## 三、实现设计

### 3.1 settings 字段(`src/services/settingsService.ts`)

新增到 `AppSettings` + `defaults`:

```ts
imageInsertAction: 'keep' | 'copy' | 'upload';   // 默认 'copy'
imageCopyDestination: string;                     // 默认 'assets',支持 ${filename}
imageApplyToLocal: boolean;                        // 默认 true
imageApplyToOnline: boolean;                       // 默认 false
imagePreferRelative: boolean;                      // 默认 true
imageEnsureDotPrefix: boolean;                     // 默认 false(Typora 推荐关)
imageEscapeUrl: boolean;                           // 默认 false
imageAllowYamlUpload: boolean;                     // 默认 false
imageUploadCommand: string;                        // 默认 ''
```

### 3.2 设置 UI(新建 `src/components/settings/ImageSection.tsx`)

照 `EditorSection.tsx` 的 `settings-row` / `settings-label` / `settings-select` / `toggle-switch` 模板写。分区标题「图像」。布局对标 Typora 截图:插入图片时(select)→ 目标文件夹(input,仅 copy 时显示)→ 路径格式(3 个 toggle)→ 应用范围(2 个 toggle)→ 图床命令(input + 验证按钮,仅 upload 或 YAML 上传开时显示)→ YAML 自动上传开关。注册进设置页 section 列表(参照现有分区如何挂进 SettingsPage 导航)。

### 3.3 Rust 命令(`src-tauri/src/lib.rs`)

- **`process_inserted_image(request)`** —— 泛化现有 `write_attachment_file`:
  - 入参:`{ document_path, source_bytes?: Vec<u8>, source_path?: String, copy_destination: String, ensure_unique: bool }`
  - 行为:解析 `copy_destination`(已替换好 `${filename}` 由前端做或这里做,二选一,建议前端做)→ 在 `<document_dir>/<dest>` 建目录 → 写入(source_bytes)或复制(source_path)→ 返回**复制后文件的绝对路径**(路径格式化交前端处理,Rust 只管落盘)。
  - 复用 `unique_attachment_path` / `sanitize_attachment_file_name`。
  - 注册进 `tauri::generate_handler!`。
- **`upload_image_via_command(request)`** —— 图床:
  - 入参:`{ command: String, image_paths: Vec<String>, document_path: String, document_name: String }`
  - 行为:替换命令里的 `${filename}`/`${filepath}` → 把 `image_paths` 带引号追加到命令末尾 → 用 shell 执行(`cmd /c` / `sh -c`)→ 拿 stdout → 取末 N 行(N = image_paths.len())作为 URL 数组返回 `{ urls: Vec<String>, raw_stdout, raw_stderr, exit_code }`。
  - 验证按钮也调这个(传一张测试图)。
  - 注册进 handler。

### 3.4 前端三入口统一(`src/app/AppLayout.tsx`)

抽一个 `insertImageFromSource(source: { bytes?: Uint8Array; localPath?: string; mime?: string })`:
1. 读 settings 的 imageInsertAction + 解析 YAML front matter 的 `typora-copy-images-to` 覆盖。
2. 算目标文件夹(替换 `${filename}`)。
3. 按 action 分流:
   - `keep` → 直接用原路径(仅 localPath 有意义)。
   - `copy` → 调 `process_inserted_image` → 拿绝对路径 → 按路径格式开关(relative/dotPrefix/escape)算最终 `src`。
   - `upload` → 调 `upload_image_via_command` → 拿 URL → 失败回退 copy。
4. `insertMarkdown(createImageMarkdown(alt, finalSrc))`。

三入口接进来:
- **粘贴**(已有 `handlePasteImage`)→ 改调 `insertImageFromSource({ bytes })`。
- **拖拽**:编辑器 drop 事件里,若拖入的是图片文件(扩展名/mime)→ `insertImageFromSource({ localPath })`;若是 .md/.html → 维持现有「打开文档」行为。注意跟现有 fileDrop 打开逻辑区分。
- **选本地文件**:工具栏/菜单「插入图片」→ `dialog.open({ filters: image })` → `insertImageFromSource({ localPath })`。

### 3.5 路径格式化(前端纯函数,带单测)

`formatImageSrc(absImagePath, documentPath, { preferRelative, ensureDotPrefix, escapeUrl }): string`:
- preferRelative + 文档已存 → 算相对路径;否则绝对。
- ensureDotPrefix → 相对路径补 `./`。
- escapeUrl → encodeURI 风格转义空格等。
配套单测覆盖:相对/绝对、`./` 前缀开关、转义开关、跨目录相对路径。

### 3.6 YAML front matter 解析

`parseTyporaCopyImagesTo(source): string | null` —— 从文档头部 `---\n...\n---` 里取 `typora-copy-images-to` 的值(相对路径或 `upload`)。简单正则即可,不引 yaml 库。配单测。

---

## 四、实施顺序

1. settings 字段 + `ImageSection.tsx` UI + 注册进设置页(先让面板可见可改)。
2. `formatImageSrc` 纯函数 + 单测。
3. Rust `process_inserted_image` + 注册;前端 `insertImageFromSource` 的 copy 路径;改造粘贴入口走它(最快验证闭环)。
4. 拖拽入口 + 选本地文件入口。
5. Rust `upload_image_via_command` + 注册;upload 路径 + 失败回退;验证按钮 UI + 结果对话框。
6. YAML `typora-copy-images-to` 解析 + 覆盖逻辑 + `imageAllowYamlUpload` 开关。
7. 全套验证 + 实跑(粘贴/拖拽/选文件 × keep/copy/upload + 验证按钮 + YAML 覆盖)。

---

## 五、验收标准

- `npm run typecheck` / `npm test -- --run` / `cargo check` / `npm run tauri:build:local` 全绿。
- 设置「图像」分区可见,9 个字段可改可持久化。
- copy:粘贴/拖拽/选文件三入口都把图片复制进目标文件夹,`src` 按路径格式开关正确(默认相对、无 `./`、不转义)。
- `${filename}` 占位符:目标 `${filename}.assets` 对 `周报.md` 生成 `周报.assets/`。
- upload:填一条能跑的命令(如本地 echo 脚本模拟),插入图片后 `src` = 命令 stdout 末行 URL;命令失败时回退到本地复制且图片不丢。
- 验证按钮:显示 raw 输出 + 解析 URL / 失败原因。
- YAML:文档头写 `typora-copy-images-to: _media` → 该文档图片复制到 `_media`(覆盖全局)。
- 跨平台:Windows 命令走 `cmd /c`(handoff 注明 mac/linux 走 `sh -c`)。

## 六、范围红线(不做)

- **移动到文件夹**(删原文件,用户明确砍)。
- **PicGo / uPic / iPic / Picsee 等 GUI 工具集成**(只做「自定义命令」通用方案,一条命令覆盖所有图床)。
- **图片右键管理**:删除 / 重命名 / 移动 / 缩放 / 对齐 / 下载全部本地图片 —— 是另一坨独立功能,本期不碰。
- **不引新依赖**:路径相对化用 Node/Rust 内置,YAML 用正则,图床用 `std::process`。
