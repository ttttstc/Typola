# 图片展示能力 SPEC —— 本地图 + 网络图正常渲染(对标 Typora)

- **日期**:2026-06-22
- **目标**:让 Typola 像 Typora 一样把图片**显示出来**——所见即所得(Vditor IR)视图和各预览视图里:
  - 文档里已有的本地图片(`./assets/x.png` 相对路径 / 绝对路径)正常显示
  - 粘贴 / 插入后**当场显示**(不用重开文档)
  - 网络图片(http/https 外链)正常显示
- **关系**:这是 [IMAGE_INSERT_SPEC.md](./IMAGE_INSERT_SPEC.md)(图片怎么**进**文档)的**配套前提**——没有展示,插入了也看不见。因此**展示应先于或同步于插入实施**。

---

## 一、根因诊断:为什么现在本地图全裂

**反直觉**:图片展示的前端链路**早就写好了**——`src/services/localImageResolver.ts` 把相对路径解析成绝对路径,再用 `convertFileSrc()` 转成 Tauri asset URL,4 个预览/编辑组件(PreviewPane / WechatPreviewPane / WordPaperPreviewPane / WysiwygEditorPane)都调了它。问题是**后端三处全断**:

| # | 断点 | 位置 | 后果 |
|---|---|---|---|
| **A** | **asset protocol 完全没启用** | `src-tauri/tauri.conf.json` 无 `assetProtocol` 段;`capabilities/default.json` 无 asset 权限 | `convertFileSrc()` 生成的 `http://asset.localhost/...`(Win)/ `asset://localhost/...`(mac)URL **无后端响应** → 本地图全裂。**致命根因** |
| **B** | **CSP img-src 没放行 asset** | `tauri.conf.json` `img-src 'self' data: file:` | 即使 A 修了,CSP 仍拦截 asset URL |
| **C** | **粘贴/插入后不重新 resolve** | `WysiwygEditorPane.tsx` `resolveLocalImages` 只在 Vditor `after()` 初始化跑一次 | 粘贴图片当场不显示,要重开文档才出现 |

**附带**:CSP `img-src` 也没有 `http/https` → **网络图同样裂**。`file:` 那项在 Tauri webview 里是死的(Tauri 不走 `file://`,用 asset protocol 替代)。

> 注:`capabilities/default.json` 里的 `fs:scope`(`$DOCUMENT/$PICTURE/...`)跟本事**无关**——那是 fs 读写 API 的 scope;asset protocol 有**独立的** scope。两套机制。

---

## 二、Typora 对标

Typora 是 Electron,直接 `file://` 读本地、直接加载网络图,所以本地图 + 网络图都直显、粘贴即见。Typola 是 Tauri,webview 禁 `file://`,必须走 asset protocol。**目标行为与 Typora 一致**:本地图 + 网络图都正常渲染,粘贴当场可见。

---

## 三、设计决策(已与用户敲定)

1. **图片可见范围 = 动态精确放行**:每打开一个文档,Rust 把它**所在目录**加进 asset protocol scope。最安全(只暴露实际打开过的文档目录)、**不限盘符**(D: 盘也行)、语义最贴 Typora「打开就能看」。
2. **网络图片 = 显示**:CSP 放行 http/https,外链图正常渲染(跟 Typora 一致)。

---

## 四、实现方案

### 4.1 启用 asset protocol(`src-tauri/tauri.conf.json`)

`app.security` 加 `assetProtocol`:

```json
"assetProtocol": {
  "enable": true,
  "scope": []
}
```

`scope` 静态留空 `[]`,默认全拒,完全靠运行时动态 `allow`(见 4.3)放开。

### 4.2 放行 CSP(`src-tauri/tauri.conf.json`)

`img-src` 改为:

```
img-src 'self' data: blob: asset: http://asset.localhost https://asset.localhost https: http:;
```

- `asset:` + `http://asset.localhost` + `https://asset.localhost` —— 本地图(跨平台:mac 是 `asset://localhost`,Windows 是 `http://asset.localhost`)
- `https: http:` —— 网络图(用户已同意显示)
- `blob: data:` —— 粘贴 / base64 兜底

其余 directive 不动(asset 加载走 `img-src`,不涉及 `connect-src`/`media-src`)。

### 4.3 Rust 动态 scope 命令(`src-tauri/src/lib.rs`)

新增命令,**幂等**(重复 allow 无害):

```rust
#[tauri::command]
fn allow_asset_directory(app: tauri::AppHandle, dir: String) -> Result<(), String> {
    app.asset_protocol_scope()
        .allow_directory(&dir, true) // recursive=true,覆盖 ./assets 等子目录
        .map_err(|e| e.to_string())
}
```

注册进 `tauri::generate_handler!`。

> API 以 Tauri v2 + `cargo check` 为准:接入点是 `AppHandle::asset_protocol_scope()` → `Scope::allow_directory(path, recursive)`。
> `capabilities/default.json` **无需加** asset 权限(asset protocol 由 `security.assetProtocol` 控制,不是 IPC permission);若 `cargo check` / 实测提示缺权限再补,以实测为准。

### 4.4 前端接入(`src/app/AppLayout.tsx` + `WysiwygEditorPane.tsx`)

- **打开文档时放行目录**:在现有打开文档流程(`handleOpenPath` / 打开文件处)里,确定 `filePath` 后、`resolveLocalImages` 之前,先 `invoke('allow_asset_directory', { dir: <filePath 所在目录> })`。可与读文档内容并行;失败只 `console.warn` 不阻断打开。
- **粘贴 / 插入即显示**:`WysiwygEditorPane` 的 Vditor `input` 回调里,在现有 `collapseTimer` debounce 之后追加一次 `resolveLocalImages(host, filePath)`。`resolveLocalImages` 本身幂等(已转成 asset URL 的 img 会跳过,见其 `data:/http/https/asset` skip 逻辑),只处理新插入的相对路径 img。

### 4.5 网络图

CSP 放行 http/https 后,网络图**无需 JS 处理**——`localImageResolver` 已 skip `http://`/`https://`(原样保留),webview 直接加载。

---

## 五、实施顺序

1. `tauri.conf.json`:`assetProtocol.enable` + 改 CSP `img-src`。
2. `lib.rs`:`allow_asset_directory` 命令 + 注册。
3. `AppLayout`:打开文档时 `allow_asset_directory(目录)`。
4. `WysiwygEditorPane`:`input` debounce 里加 `resolveLocalImages`。
5. 验证 + 实跑。

---

## 六、验收标准

- `npm run typecheck` / `npm test -- --run` / `cargo check` / `npm run tauri:build:local` 全绿。
- 打开含本地图(`![](./assets/x.png)`)的 md → **IR 所见即所得视图直接显示**(不裂)。
- **粘贴图片** → 当场显示(不重开文档)。
- 打开含网络图(`![](https://...)`)的 md → 显示。
- **D: 盘**的文档(如 `D:\暂存\xxx.md`)其本地图 → 显示(验证动态 scope 不限盘符)。
- 阅读 / 微信 / Word 各预览视图本地图也显示(这些组件已调 `resolveLocalImages`,asset protocol 修好后自然生效)。

---

## 七、范围红线(不做)

- 图片右键管理(缩放 / 对齐 / 删除 / 重命名)——展示只保证「看得见」,不做编辑态交互。
- 不把图片内联成 base64 落盘——保持 `./assets/` 相对路径 + asset 渲染,跟 INSERT_SPEC 对齐。
- 不引新依赖(asset protocol + CSP 是 Tauri 内置能力)。
- 不放宽 `scope` 为全盘静态 `**`(用户选了动态精确放行,别图省事改静态宽松)。
