# 图片插入与本地资源

用户可以通过工具栏、拖拽或粘贴插入图片；Typola 按设置保留原路径、复制到 `assets/` 或执行上传命令，并在 Markdown、预览和导出中解析资源。

## 子功能

- `image-insert` 从本地选择器、拖拽或剪贴板插入图片。
- `asset-copy` 将图片复制到文档目录或配置的资源目录并生成相对路径。
- `image-fallback` 上传失败回退到本地复制，缺失图片显示可读失败占位。
- `image-edit` 编辑 alt、title、宽度，打开图片或复制图片路径。

## 用户视角入口

- 工具栏插入菜单中的 `插入图片`。
- 编辑器右键图片菜单、拖入图片文件和粘贴图片。
- `设置 → 图像` 中的资源路径、上传命令、相对路径和 URL 转义选项。
- 源码中的 `![alt](path)` 以及 Word/HTML/PDF 预览。

## 用 exe-CDP harness 驱动

- 直接 exe 套件可以在 `.cm-content` 输入 `![缺失夹具图片](./missing-image.png)`，回到写作视图读取图片失败占位和后续正文，再切回 source 确认路径没有丢失。
- 真正的选择/复制配方必须创建一次性图片夹具，使用桌面文件选择器或拖拽，随后读取目标目录字节、Markdown 相对路径和第二个可见视图。
- 上传命令只能使用专用无秘密夹具；同时记录命令退出状态、回退动作和生成文件，不能用网络 mock 冒充上传成功。

## 陷阱

- 远程图片加载成功不是本地资产写盘证明；网络失败应保留源码并显示可读错误。
- 不能删除用户原有 `assets/` 或同名图片；清理仅限本次运行创建且可验证归属的文件。
- 原生图片选择器不属于 CDP 网页 DOM；宿主没有桌面 UI 驱动时应标未验证。
- 预览里看见图片不代表保存了正确的相对路径，必须回读 source 和实际文件。

维护信息：相关入口在 `src/app/AppLayout.tsx`、`src/components/editor/cm6/imageAssetExtension.ts`、`src/services/imageInsert.ts`、`src/components/settings/ImageSection.tsx` 和 `src/components/editor/cm6/ImageMetaPopover.tsx`；最近核对日期为 2026-09-11，真实 exe 已执行缺失资源占位，原生选择和资产写盘未执行。
