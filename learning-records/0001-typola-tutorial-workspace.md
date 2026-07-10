# 0001 — Typola 教程工作区成型

**日期**:2026-07-10
**类型**:知识锚点
**触发**:用户要求"做一个关于 Typola 能力和使用的完整教程",对话内反复明确受众、范围、形式。

## 事实

- Typola 教程产出落在仓库 `lessons/` `reference/` `assets/` `learning-records/` 四个目录,与代码并列,共用 git。
- 教程面向<strong>终端用户</strong>,不替代源码/架构/开发者文档。
- 9 节课 + 1 张速查,共 10 份 HTML;课程采用「每节开篇用 `.feature-frame` 三段交代能力定位」格式。
- 共享样式 `assets/lesson-base.css` 一份,所有 lessons 引用;暖米黄 + 暖橙 + 衬线字体,跟 Typola `plain-paper` 主题对齐。
- `MISSION.md` 与 `RESOURCES.md` 在仓库根,与教程并列作为锚点。

## 已确认

- 用户接受 9 节而非 10 节(原 5+6 合并后顺势让位)。
- 用户加入一条<strong>强偏好</strong>:每节开头先介绍能力定位(解决什么 / Typola 怎么做 / 跟别家不同),再进步骤。这条已写入 NOTES.md 并应用于全部 9 课。

## 跨会话提醒

- 若用户在新会话要求"继续写 Typola 教程",先看 `lessons/README.md` 索引,看哪些编号空缺 — 已交付 0000-0008。
- 若用户要求改某节,直接 Edit 该 HTML 文件;不要重写整文件。
- 若用户要求把教程搬到外部(发文章/做 PPT 用),HTML 是自包含的,直接发即可;样式已经 inline 在 `assets/lesson-base.css` 这一个文件里。
