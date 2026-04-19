---
url: https://mp.weixin.qq.com/s/jUjk_qQU5PaldAi8QIQcUw
title: "MD Editor：一个为 AI 工作流而生的本地 Markdown 编辑器"
description: "MD Editor 是一款桌面端的 Markdown 编辑器，长得像 Notion，但文件全部以 .md 存在"
author: "费德"
captured_at: "2026-04-19T08:14:43.127Z"
---

# MD Editor：一个为 AI 工作流而生的本地 Markdown 编辑器

MD Editor 是一款桌面端的 Markdown 编辑器，长得像 Notion，但文件全部以 .md 存在本地——为的是让 AI 能直接读写你的文档，打通从需求分析到原型生成的全链路。

### 为什么做这个？

现在 AI 越来越强，很多团队已经开始用 AI 来辅助产品工作：需求分析、PRD 撰写、原型生成、用户手册编写……但走到落地这一步，你会发现现有工具都有卡点：

飞书、Notion 这类云端工具： 编辑体验确实好，但数据在云端，AI 没法直接操作你的文件。想让 AI 帮你生成一个原型？对不起，它够不着你的文档。而且团队之间想用本地文件夹共享协作也很别扭，什么都得过云端绕一圈。

Obsidian、Typora 这类本地工具： 数据倒是在本地了，但它们都要求你懂 Markdown 语法。对于产品经理、运营、设计师这些非程序员来说，记一堆 #、\-、\*\* 符号门槛太高了，编辑体验也不够直观简洁。

所以我想做的事情很明确：把 Notion 级别的「所见即所得」编辑体验搬到本地，让文件以标准 Markdown 格式存在磁盘上，这样 AI 工具就能直接读写这些文件，实现产品经理的需求分析 → PRD 撰写 → 原型生成 → 手册编写全链路提效。

MD Editor 就是为了这个目标做的。

### 长什么样？

打开软件，你会看到三个区域：

•

左边 — 文件树。选一个文件夹当工作区，里面的 Markdown 文件一目了然，可以新建文件、新建文件夹、重命名、删除，基本的文件管理都有。

•

中间 — 编辑区。这是你写东西的地方，所见即所得，不用记 Markdown 语法也能写。

•

右边 — 大纲。根据你文章里的标题自动生成目录，点一下就能跳过去，写长文的时候特别有用。

界面很干净，没有花里胡哨的东西。

![图片](https://mmbiz.qpic.cn/mmbiz_png/OZTf9kDAAD56xScyLwAh0TPYVVvoMdkib9PQlegdDe8ibUufROxXJ6UFaMzDn4Or0ETN0F25UVjjrbVgaUKZT6tCzgvX7AKzlwD3mHha0XdLQ/640?wx_fmt=png&from=appmsg&tp=webp&wxfrom=5&wx_lazy=1#imgIndex=0)

![图片](<data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='1px' height='1px' viewBox='0 0 1 1' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg stroke='none' stroke-width='1' fill='none' fill-rule='evenodd' fill-opacity='0'%3E%3Cg transform='translate\(-249.000000, -126.000000\)' fill='%23FFFFFF'%3E%3Crect x='249' y='126' width='1' height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E>)

### 能干什么？

#### 写作方面

你平时写文章会用到的格式基本都支持：

•

标题（三级够用了）

•

加粗、斜体、删除线、行内代码

•

无序列表、有序列表

•

✅ 待办清单（可以打勾的那种）

•

表格

•

代码块（带语法高亮）

•

引用

•

分割线

•

图片（直接粘贴或拖进来就行）

•

链接

#### 斜杠命令

在编辑区输入 /，会弹出一个菜单，列出所有可以插入的内容类型。比如你想插入一个表格，敲 /table 回车就行，不用去找工具栏按钮。用过 Notion 的人对这个应该很熟悉。

![图片](<data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='1px' height='1px' viewBox='0 0 1 1' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg stroke='none' stroke-width='1' fill='none' fill-rule='evenodd' fill-opacity='0'%3E%3Cg transform='translate\(-249.000000, -126.000000\)' fill='%23FFFFFF'%3E%3Crect x='249' y='126' width='1' height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E>)

#### 选中文字弹出工具栏

选中一段文字后，上方会浮出一个小工具条，可以快速加粗、变斜体、加删除线、加链接等等。

![图片](<data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='1px' height='1px' viewBox='0 0 1 1' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg stroke='none' stroke-width='1' fill='none' fill-rule='evenodd' fill-opacity='0'%3E%3Cg transform='translate\(-249.000000, -126.000000\)' fill='%23FFFFFF'%3E%3Crect x='249' y='126' width='1' height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E>)

#### 图片处理

粘贴或拖拽图片进来，软件会自动把图片保存到工作区的 .resources 文件夹里，Markdown 里写的是相对路径。这意味着你把整个文件夹拷到别的电脑上，图片链接不会断。

#### 自动保存

编辑完不用手动按 Ctrl+S，软件会在你停下来半秒后自动保存。退出软件前也会确保内容写入磁盘。

#### 外部修改检测

如果你同时用别的编辑器（比如 VS Code）改了同一个文件，MD Editor 会检测到，提示你是保留当前编辑的内容还是重新从磁盘加载。不会悄悄覆盖你的修改。

### 跟其他工具有什么区别？

![图片](<data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='1px' height='1px' viewBox='0 0 1 1' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg stroke='none' stroke-width='1' fill='none' fill-rule='evenodd' fill-opacity='0'%3E%3Cg transform='translate\(-249.000000, -126.000000\)' fill='%23FFFFFF'%3E%3Crect x='249' y='126' width='1' height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E>)

简单说：MD Editor 取了飞书/Notion 的编辑体验，配上纯本地、纯 Markdown 的存储方式，让 AI 能无障碍地参与你的文档工作流。

### 不能干什么？

•

没有云同步 — 文件就在你电脑上。想同步可以自己配 iCloud、OneDrive 或 Git。团队协作可以直接共享文件夹，比如用 NAS 或局域网共享。

•

没有插件系统 — 不像 Obsidian 那样有插件市场。

•

不支持花哨格式 — 没有文字颜色、高亮、对齐方式这些。因为标准 Markdown 表达不了这些，加了就没法保证文件的通用性。

•

单工作区 — 一次只能打开一个文件夹。

这些不是忘了做，是故意不做的。保持简单，是这个软件的设计原则。

### 支持什么平台？

目前支持 macOS（Apple Silicon）。

### 适合谁用？

•

想用 AI 提效的产品团队 — 需求文档、PRD、原型、手册都是 .md 文件，AI 可以直接读写，串起整个工作流

•

非程序员 — 产品经理、运营、设计师，不需要记任何 Markdown 语法，像用 Notion 一样打字就行

•

在意数据归属的人 — 文件在你自己电脑上，不被任何平台绑架

•

需要本地协作的团队 — 共享一个文件夹就能协作，不用所有人都注册同一个云服务

如果你正好有这些需求，可以试试。

### beta版下载地址

https://github.com/banwotech/md-editor/releases