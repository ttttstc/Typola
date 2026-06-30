# Typola AI 文档工作中心产品设计文档

> 产品名称：Typola AI 文档工作中心  
> 阶段名称：AI 执行与产物中心  
> 文档类型：Product Design Document / PRD  
> 适用版本：v0.4 ~ v0.7  
> 目标读者：产品、设计、前端、Rust/Tauri 后端、Codex 实施 Agent  
> 核心原则：本地优先、文档中心、AI 可控、产物可追踪、不重复造轮子

---

## 1. 产品背景

Typola 已经完成第一阶段能力建设，具备本地 Markdown 编辑、AI 工作台、选区 AI、检视模式、Claude/OpenCode 本地 CLI 调用、`.typola-output` 产物生成、HTML/Word/PDF/公众号/PPT 等文档交付能力。

当前问题不是“有没有 AI”，而是：

1. AI 执行链路对用户不够透明。
2. Claude/OpenCode 配置失败时，用户不知道问题在哪里。
3. AI 生成物还没有成为 Typola 的一等对象。
4. 产物散落在 `.typola-output` 中，缺少来源、状态、操作和追踪。
5. 文档工作台还缺少一个统一的“AI 执行与产物管理中心”。
6. 后续扩展 Codex/Gemini/Cursor Agent 等能力时，现有 provider 结构不够弹性。
7. 用户需要的是文档产物闭环，而不是一个孤立聊天框。

因此，Typola 下一阶段应从“带 AI 的 Markdown 编辑器”升级为：

> **本地优先的 AI 文档工作中心：让用户可控地调用本机 AI Agent，并把生成的文档产物沉淀、管理、检视和交付。**

---

## 2. 产品定位

### 2.1 一句话定位

**Typola AI 文档工作中心是一个面向 AI 时代写作者的本地文档产物工作台，围绕 AI 执行、文档生成、产物管理、检视修改和交付导出形成完整闭环。**

### 2.2 产品关键词

```txt
本地优先
Markdown 文档
AI 执行控制
产物中心
检视修改
一键交付
Claude/OpenCode CLI
不上传
不要 API Key
可诊断
可追踪
```

### 2.3 不是什么

Typola AI 文档工作中心不是：

1. 不是另一个 ChatGPT 聊天壳。
2. 不是云端 AI 写作平台。
3. 不是单纯的 Markdown 编辑器插件。
4. 不是 open-design 的设计工作台 fork。
5. 不是完整 Agent Runtime 平台。
6. 不是多模型 API 聚合器。
7. 不是重构现有 skill 体系的项目。

---

## 3. 产品目标

### 3.1 核心目标

本阶段围绕两个中心建设：

```txt
AI 执行中心
  解决 AI 如何配置、检测、运行、诊断、切换的问题。

AI 产物中心
  解决 AI 生成物如何记录、展示、预览、对比、插入、归档、删除的问题。
```

### 3.2 业务目标

| 目标 | 说明 |
|---|---|
| 降低 AI 配置门槛 | 用户能快速知道 Claude/OpenCode 是否可用 |
| 提升 AI 运行可信度 | 运行前可检测，运行中可看到 provider/model/cwd，失败后可诊断 |
| 提升产物可控性 | AI 生成物不再散落，统一进入产物中心 |
| 强化文档工作流 | 围绕“写作 → AI 生成 → 检视 → 修改 → 交付”形成闭环 |
| 保持本地优先差异化 | 不上传、不默认 API Key、复用用户本机 CLI |
| 为后续扩展打底 | 未来可平滑支持 Codex/Gemini、STYLE.md、模板库、自动化 |

### 3.3 用户体验目标

用户应该能清楚回答以下问题：

1. 我当前用的是哪个 AI Agent？
2. 它是否安装好了？
3. 它的路径和版本是什么？
4. 它能不能跑通？
5. 失败了是什么原因？
6. AI 可以访问哪些目录？
7. AI 生成了哪些文件？
8. 这些文件来自哪个文档、哪个会话、哪个模型？
9. 我能不能打开、对比、插入、导出、归档或删除它们？
10. 我删除产物时会不会误删我的工作区文件？

---

## 4. 设计原则

### 4.1 文档是主对象

Typola 的核心不是聊天，也不是 Agent，而是文档。

AI 能力必须围绕文档展开：

```txt
当前文档
选区内容
检视意见
上下文文件
生成产物
交付格式
```

### 4.2 AI 执行必须可解释

不要让用户面对黑盒 AI。

每次 AI 运行都应该尽量可解释：

```txt
使用哪个 Agent
使用哪个模型
在哪个工作区运行
允许访问哪些目录
是否启用 MCP
是否参考 STYLE.md
生成了哪些产物
失败原因是什么
```

### 4.3 产物必须可追踪

AI 生成物不是临时输出，而是文档工作流中的正式产物。

每个产物至少应该有：

```txt
唯一 ID
标题
类型
状态
主文件
来源文档
来源会话
生成时间
使用的 Agent
使用的模型
可执行操作
错误信息
```

### 4.4 本地优先

Typola 的差异化是本地优先：

```txt
AI 调用走本机 CLI
文档不默认上传
产物保存在本地工作区
配置保存在本地
用户可见 AI 访问范围
```

### 4.5 不重复造轮子

对 open-design 的成熟设计可以复用，但 Typola 不整体 fork。

复用方式：

```txt
直接复制小模块到 Typola 正式目录
不建立 src/vendor/open-design/
保留 Apache-2.0 attribution
不引入 open-design daemon / Electron / Next.js 主架构
```

---

## 5. 用户画像

### 5.1 技术写作者

典型需求：

- 写技术方案
- 写架构设计
- 写工程实践文档
- 整理代码库知识
- 输出 Markdown、HTML、PDF、Word、PPT

痛点：

- AI 改稿后难以追踪版本
- 多轮生成产物散落
- 需要本地文件和上下文
- 不希望上传内部文档

### 5.2 产品 / 架构负责人

典型需求：

- 写规划文档
- 写 OBP / Roadmap
- 写竞品分析
- 写汇报材料
- 从长文生成 PPT/公众号

痛点：

- 内容要反复修改和检视
- 不同交付格式之间转换成本高
- AI 输出需要保留结构、术语和风格
- 需要知道 AI 改了什么

### 5.3 本地 AI 工作流用户

典型需求：

- 使用 Claude Code / OpenCode / Codex CLI
- 不想配置 API Key
- 希望复用本机登录态
- 希望文件处理留在本地

痛点：

- CLI 在终端可用，但桌面应用识别不到
- Windows PATH、`.cmd`、Git Bash、WSL 路径复杂
- 失败信息难理解
- agent 之间能力差异不透明

---

## 6. 核心场景

### 6.1 首次配置 AI

用户故事：

> 作为 Typola 用户，我希望打开应用后能清楚看到 Claude/OpenCode 是否可用，并能一键检测和测试运行，避免自己排查 PATH 和 CLI 问题。

流程：

```txt
打开 Typola
进入设置 / AI 执行
看到 Claude Code 卡片
点击重新检测
看到路径、版本、状态
点击测试运行
测试成功
设置为默认 Agent
返回 AI 工作台开始使用
```

成功标准：

- 用户不需要打开终端也能知道 agent 是否可用。
- 失败时有明确修复建议。

### 6.2 选区 AI 修改

用户故事：

> 作为写作者，我希望选中文字后让 AI 润色、扩写、缩写或校对，并且能撤销 AI 修改。

流程：

```txt
打开文档
选中文本
点击浮条：润色
Typola 调用当前 active agent
AI 返回修改结果
替换前自动快照
结果落回编辑器
用户可 Ctrl+Z 撤销
```

AI 执行中心参与：

- 使用当前 active provider/model。
- 运行状态显示 Claude Code · sonnet · 当前工作区。
- 失败时显示诊断信息。

产物中心参与：

- 选区小修改默认不一定生成 artifact。
- 如果用户选择“另存为产物”或生成较长结果，可写入 artifact。

### 6.3 心流模式生成文档产物

用户故事：

> 作为写作者，我希望在心流模式中让 AI 生成完整文档、报告、公众号或 HTML，并能在右栏看到生成产物。

流程：

```txt
进入心流模式
选择场景：技术方案 / 周报 / 公众号 / HTML 报告
输入需求
AI 执行
产物写入 .typola-output
生成 artifact.json
右栏产物列表出现新卡片
用户打开 / 预览 / 插入 / 归档 / 删除
```

成功标准：

- 产物不是临时 chip，而是可管理对象。
- 用户能知道产物来自哪个文档和哪个会话。

### 6.4 检视模式发 AI 改

用户故事：

> 作为审阅者，我希望给文档添加检视意见，然后让 AI 根据意见生成修改版，并能对比原文。

流程：

```txt
进入检视模式
选段添加检视意见
点击导出 review.md
点击发 AI 改
AI 根据全文和检视意见生成 ai改N.md
生成 artifact.json
右栏展示 Revision 产物
用户点击对比
DiffReviewPane 展示差异
用户采纳或另存
```

成功标准：

- review.md 和 ai改N.md 都进入产物中心。
- 修改版可以与当前文档对比。
- 用户不会丢失原文。

### 6.5 查看工作区全部产物

用户故事：

> 作为重度用户，我希望查看某个工作区中所有 AI 生成过的产物，并按文档、时间、类型、状态筛选。

流程：

```txt
打开工作区
点击左侧：产物库
查看全部 artifact
按类型筛选 Markdown / HTML / Review / Revision
按文档筛选
搜索标题
打开某个产物
继续编辑或归档
```

成功标准：

- 历史产物可找回。
- 失败/部分产物不会被隐藏。
- 产物库不是文件浏览器，而是 AI 工作流记录。

### 6.6 AI 执行失败诊断

用户故事：

> 作为用户，我希望 AI 调用失败时，Typola 告诉我具体是命令不存在、路径错误、认证失败、模型错误还是权限问题。

失败类型：

```txt
not_found
not_executable
version_failed
auth_missing
auth_expired
model_invalid
mcp_unsupported
permission_risk
windows_path_issue
prompt_too_long
unknown
```

展示：

```txt
Claude Code 未检测到

可能原因：
Typola 启动环境没有继承终端 PATH，或 Claude Code 未安装。

建议操作：
[选择 claude.cmd] [复制检测命令] [重新检测]
```

成功标准：

- 错误不再只是 stderr。
- 用户有下一步动作。

---

## 7. 信息架构

### 7.1 应用级导航

建议整体导航：

```txt
左侧栏
  工作区文件
  最近文档
  产物库
  AI 执行状态
  设置

主编辑区
  Markdown 编辑器
  源码模式
  预览模式
  Word A4 预览
  Diff 检视

右侧栏
  产物
  预览
  检视
  大纲

底部
  终端
  状态栏
```

### 7.2 设置页信息架构

```txt
设置
  通用
  AI 执行
    执行模式
    Agent
    模型
    工作区权限
    MCP 配置
    诊断
  文档编辑
  预览与阅读
  导出
  图片与资源
  产物库
  终端
  外观主题
  文档风格
  隐私与安全
  关于
```

### 7.3 AI 执行页结构

```txt
AI 执行

当前默认 Agent
  Claude Code / OpenCode

Agent 卡片区
  Claude Code
  OpenCode
  Experimental: Codex / Gemini

工作区权限
  AI 工作区根目录
  额外允许目录
  pluginDirs
  MCP 配置位置

诊断
  最近一次检测
  最近一次测试运行
  最近一次运行错误
```

### 7.4 产物中心信息架构

```txt
右栏当前文档产物
  当前文档相关
  最近生成
  失败/部分完成
  操作按钮

独立产物库
  全部产物
  按类型
  按状态
  按文档
  按日期
  按 Agent
  搜索
  批量操作
```

---

## 8. 页面设计

## 8.1 AI 执行设置页

### 8.1.1 页面目标

帮助用户完成：

- 选择默认 Agent
- 检测 Agent
- 测试运行
- 配置模型
- 配置路径
- 理解权限
- 查看诊断

### 8.1.2 页面布局

```txt
┌──────────────────────────────────────────────────────────────┐
│ 设置                                                         │
├───────────────┬──────────────────────────────────────────────┤
│ 通用          │ AI 执行                                      │
│ AI 执行       │ 当前默认 Agent：Claude Code                  │
│ 文档编辑      │                                              │
│ 预览与阅读    │ ┌──────────────────────────────────────────┐ │
│ 导出          │ │ Claude Code                              │ │
│ 产物库        │ │ 状态：已安装                              │ │
│ 终端          │ │ 路径：C:\...\claude.cmd                  │ │
│ 外观主题      │ │ 版本：1.x.x                               │ │
│ 隐私与安全    │ │ 模型：sonnet                              │ │
│ 关于          │ │ 能力：流式输出 / 会话续接 / 文件写入      │ │
│               │ │ [设为默认] [重新检测] [测试运行] [选择路径]│ │
│               │ └──────────────────────────────────────────┘ │
│               │                                              │
│               │ ┌──────────────────────────────────────────┐ │
│               │ │ OpenCode                                 │ │
│               │ │ 状态：未检测                              │ │
│               │ │ [重新检测] [测试运行]                     │ │
│               │ └──────────────────────────────────────────┘ │
└───────────────┴──────────────────────────────────────────────┘
```

### 8.1.3 Agent 卡片字段

| 字段 | 说明 |
|---|---|
| Agent 名称 | Claude Code / OpenCode |
| 状态 | 已安装、未安装、路径异常、认证异常、测试失败 |
| 路径 | 实际执行路径 |
| 版本 | CLI version |
| 模型 | 当前模型 |
| 能力 | stream、resume、mcp、extra dirs 等 |
| 诊断 | warning/error 列表 |
| 操作 | 设为默认、重新检测、测试运行、选择路径、查看日志 |

### 8.1.4 状态定义

```ts
type AgentUiStatus =
  | 'ready'
  | 'not_configured'
  | 'not_found'
  | 'path_error'
  | 'auth_error'
  | 'test_failed'
  | 'warning'
  | 'detecting'
  | 'testing';
```

### 8.1.5 诊断行设计

示例：

```txt
⚠ Windows 路径问题
Typola 没有在当前启动环境中找到 claude.cmd，但检测到 npm 全局目录中可能存在 Claude Code。

[选择 claude.cmd] [复制检测命令] [重新检测]
```

---

## 8.2 AI 工作台运行状态

### 8.2.1 展示内容

运行前：

```txt
当前执行：Claude Code · sonnet · 工作区 D:/typola-docs
```

运行中：

```txt
Claude Code 正在生成 · sonnet · D:/typola-docs
```

失败时：

```txt
Claude Code 运行失败 · version_failed
[查看诊断] [重新测试] [打开 AI 执行设置]
```

### 8.2.2 状态条位置

建议放在：

- AI 工作台输入区上方
- 右栏产物生成中卡片
- 错误 toast 的详情里

---

## 8.3 当前文档产物右栏

### 8.3.1 页面目标

帮助用户快速找到当前文档相关 AI 产物。

### 8.3.2 空状态

```txt
暂无当前文档相关产物

你可以：
[让 AI 生成文档] [导出检视版] [查看全部产物]
```

### 8.3.3 产物卡片

```txt
┌──────────────────────────────────────┐
│ Markdown · 检视修改版                 │
│ 来自：article.md                      │
│ Claude Code · sonnet · 15:31          │
│ 状态：已完成                          │
│                                      │
│ [打开] [对比] [插入] [更多]           │
└──────────────────────────────────────┘
```

HTML 产物：

```txt
┌──────────────────────────────────────┐
│ HTML · 公众号排版                     │
│ 来自：article.md                      │
│ Claude Code · sonnet · 15:40          │
│ 状态：已完成                          │
│                                      │
│ [预览] [复制富文本] [导出] [更多]     │
└──────────────────────────────────────┘
```

失败产物：

```txt
┌──────────────────────────────────────┐
│ 失败 · HTML 报告                      │
│ Claude Code · sonnet · 15:42          │
│ 已保留部分输出                        │
│                                      │
│ [查看日志] [打开部分输出] [删除]      │
└──────────────────────────────────────┘
```

---

## 8.4 独立产物库页面

### 8.4.1 页面目标

展示工作区全部 AI 产物，并提供搜索、筛选和管理能力。

### 8.4.2 页面布局

```txt
┌──────────────────────────────────────────────────────────────┐
│ 产物库                                                       │
│ 搜索： [ 输入标题 / 文档 / Agent ]                           │
│ 筛选： 全部 Markdown HTML Review Revision 失败 已归档         │
├──────────────────────────────────────────────────────────────┤
│ 今天                                                         │
│  15:31  Markdown  检视修改版        article.md   Claude      │
│  15:40  HTML      公众号排版        article.md   Claude      │
│                                                              │
│ 昨天                                                         │
│  21:18  Review    检视版            plan.md      -           │
└──────────────────────────────────────────────────────────────┘
```

### 8.4.3 筛选维度

```txt
类型：Markdown / HTML / Review / Revision / Data / Asset
状态：Running / Done / Failed / Partial / Archived
文档：当前工作区内文档
日期：今天 / 近 7 天 / 近 30 天 / 自定义
Agent：Claude / OpenCode / Codex / Unknown
来源：心流生成 / 选区 AI / 检视导出 / AI 改稿
```

---

## 8.5 产物预览页

### 8.5.1 Markdown 产物

操作：

```txt
打开为 Tab
插入当前光标
替换当前文档
与当前文档对比
导出 Word/PDF
归档
删除
```

### 8.5.2 HTML 产物

操作：

```txt
沙箱预览
复制富文本
导出 HTML
导出 PDF
打开源文件
归档
删除
```

安全：

```txt
使用 sandbox iframe
不默认 allow-same-origin
限制脚本能力
本地文件路径不暴露给 HTML
```

### 8.5.3 Revision 产物

操作：

```txt
与当前文档 Diff
采纳全部
局部复制
另存为新文档
归档
删除
```

---

## 9. 功能设计

# 9.1 AI 执行中心

## 9.1.1 Agent Runtime Registry

### 功能描述

建立统一 Agent Runtime Registry，用于定义 Typola 支持的 AI Agent。

首批：

```txt
Claude Code
OpenCode
```

预留：

```txt
Codex
Gemini
Cursor Agent
Qwen
Kimi
```

### Runtime 定义

```ts
export type AgentRuntimeId =
  | 'claude'
  | 'opencode'
  | 'codex'
  | 'gemini';

export type AgentCapability =
  | 'stream'
  | 'sessionResume'
  | 'fileWrite'
  | 'mcp'
  | 'extraAllowedDirs'
  | 'promptViaStdin'
  | 'modelSelection'
  | 'partialMessages';

export interface AgentRuntimeDef {
  id: AgentRuntimeId;
  label: string;
  description?: string;

  defaultCommand: string;
  fallbackCommands?: string[];
  versionArgs: string[];

  capabilities: Partial<Record<AgentCapability, boolean>>;

  experimental?: boolean;
  docsUrl?: string;
  installUrl?: string;

  buildCommandSpec?: (input: AgentCommandInput) => AgentCommandSpec;
}
```

---

## 9.1.2 Agent 检测

### 检测内容

```txt
命令是否存在
路径是否可执行
版本是否可读取
认证状态是否可判断
是否支持 stream 输出
是否支持 resume
是否支持 MCP
是否支持 extra allowed dirs
是否存在 Windows PATH 问题
```

### 检测结果

```ts
export interface AgentDetectionResult {
  runtimeId: string;
  available: boolean;
  executablePath?: string;
  version?: string;
  authStatus?: 'unknown' | 'ok' | 'missing' | 'expired';
  capabilities?: string[];
  diagnostics: AgentDiagnostic[];
  detectedAt: string;
}
```

---

## 9.1.3 诊断系统

### 诊断码

```ts
export type AgentDiagnosticCode =
  | 'not_found'
  | 'not_executable'
  | 'version_failed'
  | 'auth_missing'
  | 'auth_expired'
  | 'model_invalid'
  | 'mcp_unsupported'
  | 'permission_risk'
  | 'windows_path_issue'
  | 'prompt_too_long'
  | 'unknown';
```

### 诊断等级

```txt
ok
warning
error
```

### 修复动作

```txt
选择文件
复制命令
打开设置
打开文档
重新检测
无操作
```

---

## 9.1.4 一键测试运行

### 功能描述

用户点击“测试运行”，Typola 调用该 Agent 发送一个极短 prompt，以验证真实运行链路。

测试 prompt：

```txt
请只回复：Typola AI runtime ok
```

### 测试结果

```ts
export interface AgentTestRunResult {
  runtimeId: string;
  ok: boolean;
  elapsedMs: number;
  cwd: string;
  model?: string;
  stdoutPreview?: string;
  stderrPreview?: string;
  parsedStream?: boolean;
  diagnostics: AgentDiagnostic[];
}
```

### 规则

1. 测试运行不应污染正式会话列表。
2. 如果复用正式 session，需要标记为 test run。
3. 测试必须有超时。
4. 测试失败时展示诊断。
5. 测试运行不能修改用户文档。

---

## 9.1.5 模型选择

### 支持模式

```txt
默认
预设模型
自定义模型名
```

### 模型字段

```ts
aiClaudeModel
aiOpenCodeModel
```

后续扩展：

```ts
aiRuntimeModels: Record<AgentRuntimeId, string>
```

---

## 9.1.6 工作区权限

### 展示内容

```txt
AI 工作区根目录
额外允许目录
pluginDirs
MCP 配置位置
当前文档路径
产物输出目录
```

### 权限提示

当使用 `bypassPermissions` 或类似模式时，必须展示：

```txt
当前 Agent 可能拥有较高文件操作权限。请确认工作区和额外允许目录只包含你希望 AI 访问的内容。
```

---

# 9.2 AI 产物中心

## 9.2.1 Artifact 定义

### Artifact 是什么

Artifact 是 Typola 中 AI 生成或 AI 参与生成的正式产物对象。

它可以是：

```txt
Markdown 文档
HTML 报告
公众号 HTML
Review 文件
AI 改稿版本
PPT HTML
数据分析结果
资源文件
```

## 9.2.2 Artifact 类型

```ts
export type ArtifactKind =
  | 'markdown'
  | 'html'
  | 'review'
  | 'revision'
  | 'wechat-html'
  | 'ppt-html'
  | 'data'
  | 'asset'
  | 'unknown';
```

## 9.2.3 Artifact 状态

```ts
export type ArtifactStatus =
  | 'running'
  | 'done'
  | 'failed'
  | 'partial'
  | 'archived'
  | 'deleted';
```

## 9.2.4 Artifact Manifest

```ts
export interface ArtifactManifest {
  id: string;
  title: string;
  kind: ArtifactKind;
  status: ArtifactStatus;
  primaryFile: string;

  createdAt: string;
  updatedAt?: string;

  source: {
    type:
      | 'flow_generation'
      | 'selection_ai'
      | 'review_export'
      | 'review_ai_edit'
      | 'manual_import'
      | 'unknown';
    documentPath?: string;
    documentName?: string;
    conversationId?: string;
    docMode?: string;
  };

  agent?: {
    id: string;
    label?: string;
    model?: string;
  };

  workspace?: {
    root?: string;
    outputRoot?: string;
  };

  files?: Array<{
    path: string;
    role: 'primary' | 'asset' | 'log' | 'metadata' | 'preview';
    mime?: string;
    size?: number;
  }>;

  actions?: {
    openAsTab?: boolean;
    preview?: boolean;
    insertToEditor?: boolean;
    compareWithCurrent?: boolean;
    exportHtml?: boolean;
    exportPdf?: boolean;
    exportWord?: boolean;
    archive?: boolean;
    delete?: boolean;
  };

  error?: {
    message: string;
    stderrTail?: string;
    exitCode?: number;
  };
}
```

## 9.2.5 产物目录结构

推荐结构：

```txt
.typola-output/
  sessions/
    20260626-153000-review/
      session.json
      history.jsonl
      artifacts/
        artifact-001/
          artifact.json
          output.md
        artifact-002/
          artifact.json
          output.html
          assets/
  index.json
```

兼容策略：

```txt
不强制迁移旧 .typola-output/<conversation> 结构
新产物必须写 artifact.json
旧文件通过 scanner 推断 legacy artifact
```

## 9.2.6 Artifact 操作

| 操作 | Markdown | HTML | Review | Revision |
|---|---|---|---|---|
| 打开为 Tab | 支持 | 源码支持 | 支持 | 支持 |
| 预览 | 支持 | 支持 | 支持 | 支持 |
| 插入当前光标 | 支持 | 可选 | 可选 | 支持 |
| 与当前文档对比 | 支持 | 不适用 | 可选 | 支持 |
| 导出 | Word/PDF | HTML/PDF | Markdown | Markdown |
| 归档 | 支持 | 支持 | 支持 | 支持 |
| 删除 | 支持 | 支持 | 支持 | 支持 |

## 9.2.7 安全删除

删除规则：

```txt
目标路径必须属于 .typola-output
Rust 侧必须做路径校验
不能删除工作区任意文件
删除前需要用户确认
删除失败需要显示原因
```

## 9.2.8 归档

归档规则：

```txt
从 .typola-output 复制或移动到工作区目标目录
默认不覆盖已有文件
覆盖前需要确认
归档后更新 artifact status
保留原始 manifest 记录
```

## 9.2.9 输出恢复与校验

需要处理：

```txt
AI 输出 Markdown fenced code 中包含 HTML
AI 输出完整 HTML
AI 输出 HTML 片段
AI 输出 Markdown 但后缀不明确
AI 失败但已有部分 stdout
AI 输出多段候选产物
```

原则：

```txt
Markdown-first
HTML 恢复可借鉴 open-design
校验不能过度严格
失败时保留 raw output
partial artifact 也可显示和打开
```

---

# 9.3 STYLE.md 文档风格系统

## 9.3.1 定位

STYLE.md 是 Typola 的工作区文档风格档案。

它不是：

```txt
不是主题
不是 skill
不是插件
不是模型配置
```

它是：

```txt
给 AI 的文档风格上下文
用于约束生成、改写、检视和交付
```

## 9.3.2 查找顺序

```txt
<workspace>/.typola/STYLE.md
<workspace>/STYLE.md
~/.typola/STYLE.md
```

第一阶段可只支持：

```txt
<workspace>/.typola/STYLE.md
```

## 9.3.3 模板

```md
# Typola Document Style

## 1. Writing Voice
文风、语气、正式程度、中文/英文偏好。

## 2. Audience
目标读者、专业程度、默认解释深度。

## 3. Structure Rules
标题层级、摘要、列表、章节组织方式。

## 4. Markdown Rules
表格、代码块、引用、图片、Mermaid、脚注使用规则。

## 5. Terminology
固定术语、禁用词、缩写展开规则。

## 6. Delivery Presets
Word、PDF、公众号、PPT、HTML 等交付偏好。

## 7. Review Rules
审稿标准：准确性、逻辑性、表达、格式、风险点。

## 8. AI Prompt Guide
给 AI 的最终执行提醒。
```

## 9.3.4 注入规则

| 场景 | 注入内容 |
|---|---|
| 选区润色 | Writing Voice + Terminology + AI Prompt Guide |
| 选区缩写/扩写 | Writing Voice + Structure Rules + AI Prompt Guide |
| 心流模式生成全文 | 完整 STYLE.md |
| 公众号/PPT/HTML 交付 | 完整 STYLE.md + Delivery Presets |
| 检视模式发 AI 改 | Writing Voice + Review Rules + Terminology |
| 解释术语 | Audience + Terminology，可选 |
| 数据分析 | 默认不注入 |

## 9.3.5 优先级规则

```txt
用户当前明确指令 > 当前任务 prompt > STYLE.md > 默认系统行为
```

## 9.3.6 UI 感知

在相关 AI 入口显示：

```txt
已参考当前 STYLE.md
```

或：

```txt
当前风格：技术产品文档风格
```

用户可禁用。

---

## 10. 状态模型

### 10.1 Agent 状态

```ts
type AgentUiStatus =
  | 'ready'
  | 'not_configured'
  | 'not_found'
  | 'path_error'
  | 'auth_error'
  | 'test_failed'
  | 'warning'
  | 'detecting'
  | 'testing';
```

### 10.2 AI Run 状态

```ts
type AgentRunStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'streaming'
  | 'writing_artifact'
  | 'done'
  | 'failed'
  | 'cancelled';
```

### 10.3 Artifact 状态

```ts
type ArtifactStatus =
  | 'running'
  | 'done'
  | 'failed'
  | 'partial'
  | 'archived'
  | 'deleted';
```

### 10.4 STYLE.md 状态

```ts
type StyleProfileStatus =
  | 'missing'
  | 'enabled'
  | 'disabled'
  | 'parse_error'
  | 'too_large';
```

---

## 11. 数据与持久化

### 11.1 Settings

现有 settings 可扩展：

```ts
interface AppSettings {
  aiActiveProvider: 'claude' | 'opencode' | string;

  aiClaudePath?: string;
  aiClaudeModel?: string;

  aiOpenCodePath?: string;
  aiOpenCodeModel?: string;

  aiWorkspaceRoot?: string;
  aiWorkspaceRecents?: string[];

  aiPluginDirs?: string[];
  aiExtraAllowedDirs?: string[];

  aiExperimentalAgentsEnabled?: boolean;

  styleProfileEnabled?: boolean;

  artifactLibraryView?: {
    lastFilter?: string;
    lastSort?: string;
  };
}
```

### 11.2 Artifact Manifest

每个产物目录中保存：

```txt
artifact.json
```

工作区级可选缓存：

```txt
.typola-output/index.json
```

原则：

```txt
index.json 可以删除后重建
artifact.json 是单产物真实元数据
```

### 11.3 Session Metadata

建议后续补充：

```txt
session.json
history.jsonl
```

用途：

```txt
记录会话级上下文
记录事件流
支持失败恢复
支持产物追踪
```

---

## 12. 权限与安全

### 12.1 本地优先说明

产品中应明确展示：

```txt
Typola 默认通过你本机已安装的 AI CLI 执行任务。
Typola 不默认上传你的文档。
AI 可访问的文件范围取决于工作区、额外允许目录和所使用 Agent 的权限模式。
```

### 12.2 AI 可访问目录

必须可见：

```txt
workspaceRoot
extraAllowedDirs
pluginDirs
.mcp.json 位置
.typola-output 位置
```

### 12.3 高权限模式提醒

如果使用：

```txt
bypassPermissions
dangerously-skip-permissions
```

需要展示 warning：

```txt
当前 Agent 可能跳过部分权限确认。请确认工作区和额外允许目录中不包含敏感文件。
```

### 12.4 删除安全

所有删除必须在 Rust 侧校验：

```txt
canonicalize path
检查是否属于 .typola-output
禁止删除 .typola-output 外文件
失败返回明确错误
```

---

## 13. 错误与异常处理

### 13.1 Agent 未安装

展示：

```txt
未检测到 Claude Code。
你可以安装 Claude Code，或手动选择 claude.cmd 路径。
```

操作：

```txt
复制安装命令
选择路径
重新检测
```

### 13.2 版本检测失败

展示：

```txt
已找到命令，但无法读取版本。
可能原因：路径不可执行、权限不足、命令启动失败。
```

### 13.3 认证异常

展示：

```txt
Claude Code 可能尚未登录或登录已过期。
请在终端中完成登录后重新检测。
```

### 13.4 模型错误

展示：

```txt
当前模型可能不可用。
请切换为默认模型或输入正确模型名。
```

### 13.5 输出解析失败

展示：

```txt
AI 已返回内容，但 Typola 无法识别为标准产物。
已保留原始输出。
```

操作：

```txt
打开原始输出
另存为 Markdown
另存为 HTML
删除
```

---

## 14. 非目标范围

本阶段不做：

```txt
不重构 skill 体系
不做完整 Plugin Marketplace
不做云端账号系统
不做团队协作
不做远程产物同步
不做完整 design system 管理
不做视频生成
不做 HyperFrame
不做全量多 Agent 市场
不做完整 BYOK Model Router
不把 open-design daemon 搬进 Typola
```

---

## 15. 版本规划

### v0.4：AI 执行控制中心

目标：

```txt
Agent Runtime Registry
Agent 检测
Agent 诊断
一键测试运行
AI 执行设置页
运行状态展示 provider/model/cwd
```

交付：

```txt
Claude/OpenCode 卡片
重新检测
测试运行
模型设置
路径设置
诊断行
AI 工作台状态条
```

### v0.5：Artifact 产物中心

目标：

```txt
Artifact Manifest
产物标准化落盘
产物扫描
当前文档产物右栏
独立产物库
产物操作闭环
输出恢复与校验
```

交付：

```txt
artifact.json
ArtifactCard
ArtifactList
ArtifactLibrary
ArtifactPreview
open/preview/insert/diff/archive/delete
```

### v0.6：STYLE.md 文档风格系统

目标：

```txt
工作区风格档案
STYLE.md 解析
设置页入口
prompt 注入
UI 感知
```

交付：

```txt
.typola/STYLE.md
StyleProfileSettings
StyleProfileBadge
styleProfilePrompt
```

### v0.7：工作台体验整合

目标：

```txt
首页增强
右栏信息架构
隐私与安全说明
产物库入口 polish
整体体验打磨
```

交付：

```txt
Welcome 面板
隐私与安全页
右栏 tabs
最近产物
AI 状态入口
```

---

## 16. 合并版 Issue 拆分

### Issue 1：Agent Runtime Registry 与命令抽象

包含：

```txt
runtime types
registry
Claude/OpenCode def
commandSpec
promptBudget
experimental agent 预留
```

### Issue 2：Agent 检测、诊断与测试运行

包含：

```txt
diagnostics model
agent_detect 增强
Windows 路径处理
AgentDiagnosticRow
AgentTestRunPanel
一键测试运行
```

### Issue 3：AI 执行设置页与运行状态展示

包含：

```txt
AI 执行设置页
AgentRuntimeCard
ModelSelect
active provider 切换
工作区权限展示
运行状态条 provider/model/cwd
```

### Issue 4：Artifact Manifest 与产物落盘标准化

包含：

```txt
Artifact types
manifest
产物生成时写 artifact.json
review.md manifest
ai改N.md manifest
失败/partial manifest
```

### Issue 5：Artifact Scanner、右栏产物列表与产物库页面

包含：

```txt
scanner
indexer
legacy artifact 推断
ArtifactCard
ArtifactList
ArtifactLibrary
筛选/搜索
当前文档关联产物
```

### Issue 6：Artifact 操作闭环与输出恢复校验

包含：

```txt
artifactActions
open/preview/insert/diff/archive/delete
ArtifactPreview
parser/recover/validate
HTML fenced block 恢复
partial artifact 展示
```

### Issue 7：STYLE.md 文档风格系统 v0

包含：

```txt
STYLE.md 查找
STYLE.md 解析
设置页入口
prompt 注入
UI badge
禁用开关
```

### Issue 8：工作台体验整合与隐私安全说明

包含：

```txt
Welcome 面板
最近产物
AI 状态入口
右栏 tabs
隐私与安全页
权限说明
```

---

## 17. 验收标准总表

### 17.1 AI 执行中心

| 验收项 | 标准 |
|---|---|
| Agent 检测 | 能检测 Claude/OpenCode path/version |
| 诊断 | 未安装、路径错误、版本失败等有明确提示 |
| 测试运行 | 点击后能真实跑一次短 prompt |
| 设置页 | 能选择 provider、模型、路径 |
| 运行状态 | AI 工作台显示 provider/model/cwd |
| Windows | 支持 `.cmd` 和路径空格 |
| 安全 | 高权限模式有 warning |

### 17.2 产物中心

| 验收项 | 标准 |
|---|---|
| manifest | 新产物有 artifact.json |
| 旧产物 | legacy 文件可识别 |
| 右栏 | 当前文档相关产物自动展示 |
| 产物库 | 工作区所有产物可搜索筛选 |
| 操作 | 支持打开、预览、插入、diff、归档、删除 |
| 失败产物 | failed/partial 不隐藏 |
| 删除安全 | 不可删除 `.typola-output` 外文件 |

### 17.3 STYLE.md

| 验收项 | 标准 |
|---|---|
| 创建 | 可创建 `.typola/STYLE.md` |
| 解析 | 可解析 8 个 section |
| 注入 | 选区/心流/检视按规则注入 |
| 优先级 | 用户当前指令优先 |
| UI | 显示是否参考 STYLE.md |
| 禁用 | 用户可关闭注入 |

### 17.4 工作台体验

| 验收项 | 标准 |
|---|---|
| 首页 | 有 AI 状态、最近产物、快捷入口 |
| 右栏 | 产物/预览/检视/大纲结构清晰 |
| 隐私 | 可看到 AI 可访问目录 |
| 安全 | 可看到高权限模式说明 |
| 一致性 | 不破坏阅读/心流/检视三态 |

---

## 18. 成功指标

### 18.1 可量化指标

| 指标 | 目标 |
|---|---|
| 首次 AI 配置成功率 | 提升 |
| AI 调用失败后用户可自助修复率 | 提升 |
| 产物找回率 | 提升 |
| 产物误删风险 | 降低 |
| 从 AI 生成到打开产物的路径 | 缩短 |
| 从检视意见到 AI 改稿 diff 的路径 | 缩短 |

### 18.2 体验指标

用户应该感受到：

```txt
Typola 知道我的 AI 环境
Typola 能告诉我哪里坏了
Typola 不会把 AI 生成物弄丢
Typola 能围绕当前文档组织产物
Typola 的 AI 改动可追踪
Typola 是本地可信的
```

---

## 19. Codex 实施提示词

```txt
你正在实现 Typola 的 AI 文档工作中心产品设计。请遵守以下约束：

1. 不引入 src/vendor/open-design/ 目录。
2. 如需复用 open-design 代码，请直接复制到 Typola 正式模块目录，并在文件头保留来源、许可证、原始路径和修改说明。
3. 不整体 fork open-design。
4. 不迁移 Typola 的 Tauri + React + Rust 架构。
5. 不引入 Electron、Next.js 或 open-design daemon。
6. 不改变现有 skill 体系。
7. 保持现有 Claude/OpenCode AI 工作台能力不回退。
8. 所有新增能力必须兼容 Windows 路径。
9. 删除/归档产物时必须保证不能越权操作 .typola-output 外的文件。
10. STYLE.md 只作为 prompt context，不改变 skill 协议。
11. 代码完成后请运行 TypeScript check、lint、Rust check 和现有测试。如项目没有某项脚本，请说明。
12. PR 描述中列出：
   - 本次改动范围
   - 是否复用 open-design 代码
   - 复用来源路径
   - 与现有能力的兼容性
   - 已验证场景
```

---

## 20. 最终结论

Typola AI 文档工作中心的核心不是“AI 写作”，而是：

```txt
AI 执行可控
AI 产物可管
AI 修改可检视
AI 交付可追踪
```

阶段路线：

```txt
先做 AI 执行中心：
  解决配置、检测、测试、诊断、状态透明。

再做 AI 产物中心：
  解决产物元数据、右栏展示、产物库、操作闭环。

再做 STYLE.md：
  解决文档风格一致性。

最后做工作台整合：
  解决入口、右栏、首页、隐私安全和整体体验。
```

产品最终形态：

> **Typola 不只是一个 Markdown 编辑器，也不是一个 AI 聊天框，而是一个以本地文档为中心、以 AI Agent 为执行器、以产物为交付对象的 AI 文档工作中心。**
