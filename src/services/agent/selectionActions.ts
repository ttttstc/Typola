// 选区右键 AI 动作定义 + 注入文本构造。
// M3 选区注入最小入口：5 个固定模板 + 1 个自定义（空模板）+ 1 个检视(走 reviewState,不调 AI)。
import {
  Ban,
  BookOpen,
  ChevronsDownUp,
  ChevronsUpDown,
  EyeOff,
  MessageSquare,
  PenLine,
  SpellCheck,
  Wand2,
  type LucideIcon,
} from 'lucide-react';

// 改写已砍:跟"润色"语义重叠,润色加自定义要求后基本覆盖改写场景。
export type SelectionActionId = 'polish' | 'shorten' | 'expand' | 'explain' | 'custom' | 'review' | 'proofread' | 'dismiss-session' | 'hide-globally';

// icon 改为 lucide 组件,跟工具栏视觉语言统一(原 emoji 视觉过乱)。
export const SELECTION_ACTIONS: Record<SelectionActionId, { label: string; icon: LucideIcon; template: string }> = {
  polish: {
    label: '润色',
    icon: Wand2,
    template: '请润色以下文字：改善语言流畅度和用词准确性，保持原文结构和含义不变，只做语言层面的优化。只输出润色后的结果，不要任何解释、不要前后缀、不要 markdown 格式标记。',
  },
  shorten: {
    label: '缩写',
    icon: ChevronsDownUp,
    template: '请精简以下选中的文字：保留核心信息，去掉修饰和重复，目标长度约一半。只输出精简后的结果，不要任何解释、不要前后缀、不要 markdown 格式标记。',
  },
  expand: {
    label: '扩写',
    icon: ChevronsUpDown,
    template: '请扩写以下选中的文字：补充细节、例证或论据，让段落更充实，保持原文风格和立场。只输出扩写后的结果，不要任何解释、不要前后缀、不要 markdown 格式标记。',
  },
  explain: {
    label: '解释术语',
    icon: BookOpen,
    template: '请用 1-3 句话解释以下术语或概念，简洁明了，适合嵌入文档注释。只输出解释文字，不要任何额外格式。',
  },
  custom: {
    label: '自定义',
    icon: PenLine,
    template: '',
  },
  review: {
    label: '加检视意见',
    icon: MessageSquare,
    // 检视不走 AI;模板为空,template 字段不使用。
    template: '',
  },
  proofread: {
    label: '校对',
    icon: SpellCheck,
    template: '请检查以下文字中的错别字、语法错误和标点误用。如有错误，输出修正后的版本；如果没有错误，输出原文。只输出结果，不要任何解释。',
  },
  'dismiss-session': {
    label: '本页不再展示',
    icon: EyeOff,
    template: '',
  },
  'hide-globally': {
    label: '全局隐藏',
    icon: Ban,
    template: '',
  },
};

export function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

export type UniqueAnchorHit = {
  // originalText 在 source 中的起始偏移（已跳过 prefixHint 的前缀）
  start: number;
  // originalText 长度
  length: number;
};

// 去掉 source 里的「行内 markdown 标记」(保留字面字符)。
// 用于 Vditor WYSIWYG 模式:range.toString() 给到的是纯文本(渲染后看到的),
// 而 source 是含 ** _ ` 等标记的 markdown,精确匹配会失败 → strip 后再匹配。
// 只处理行内级:粗体/斜体/行内代码/删除线/链接/图片;块级不动(代码块/引用等)。
export function stripInlineMarkdown(text: string): string {
  let out = text;
  out = out.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');     // 图片 ![alt](url) → alt
  out = out.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');      // 链接 [text](url) → text
  out = out.replace(/`([^`]+)`/g, '$1');                  // 行内代码 → 内容
  out = out.replace(/\*\*([^*]+)\*\*/g, '$1');            // **加粗** → 内容
  out = out.replace(/(?<!\w)_([^_]+)_(?!\w)/g, '$1');     // _斜体_ → 内容
  out = out.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1'); // *斜体* → 内容
  out = out.replace(/~~([^~]+)~~/g, '$1');                // ~~删除线~~ → 内容
  return out;
}

// 建 plainIdx → sourceIdx 映射:逐字符走 source,识别行内 marker 时跳过 marker
// 但保留内容字符的 plain 索引。返回:plainIdx → sourceIdx 的映射函数。
// 跟 stripInlineMarkdown 必须保持同步(支持同一组 marker 集)。
function buildPlainToSourceMap(source: string): (plainIdx: number) => number {
  const map: number[] = [];
  let si = 0;
  const len = source.length;
  while (si < len) {
    const rest = source.slice(si);
    // 图片 ![alt](url)
    let m = rest.match(/^!\[([^\]]*)\]\([^)]*\)/);
    if (m) {
      const altOffset = 2; // ![
      for (let k = 0; k < m[1].length; k++) map.push(si + altOffset + k);
      si += m[0].length;
      continue;
    }
    // 链接 [text](url)
    m = rest.match(/^\[([^\]]*)\]\([^)]*\)/);
    if (m) {
      const textOffset = 1; // [
      for (let k = 0; k < m[1].length; k++) map.push(si + textOffset + k);
      si += m[0].length;
      continue;
    }
    // 行内代码 `code`
    m = rest.match(/^`([^`]+)`/);
    if (m) {
      for (let k = 0; k < m[1].length; k++) map.push(si + 1 + k);
      si += m[0].length;
      continue;
    }
    // **加粗**
    m = rest.match(/^\*\*([^*]+)\*\*/);
    if (m) {
      for (let k = 0; k < m[1].length; k++) map.push(si + 2 + k);
      si += m[0].length;
      continue;
    }
    // ~~删除线~~
    m = rest.match(/^~~([^~]+)~~/);
    if (m) {
      for (let k = 0; k < m[1].length; k++) map.push(si + 2 + k);
      si += m[0].length;
      continue;
    }
    // _斜体_ 或 *斜体*(单 marker;ESC 后必须不接 \w 才认)
    // 简化:只在前后不是 \w 时 strip,保持 stripInlineMarkdown 一致
    const before = si > 0 ? source[si - 1] : '';
    const isWordBefore = /\w/.test(before);
    if (!isWordBefore) {
      m = rest.match(/^_([^_\n]+)_/);
      if (m && !/\w/.test(source[si + m[0].length] ?? '')) {
        for (let k = 0; k < m[1].length; k++) map.push(si + 1 + k);
        si += m[0].length;
        continue;
      }
      m = rest.match(/^\*([^*\n]+)\*/);
      if (m && !/\w/.test(source[si + m[0].length] ?? '')) {
        for (let k = 0; k < m[1].length; k++) map.push(si + 1 + k);
        si += m[0].length;
        continue;
      }
    }
    // 普通字符
    map.push(si);
    si += 1;
  }
  return (plainIdx: number) => (plainIdx >= 0 && plainIdx < map.length ? map[plainIdx] : -1);
}

// 归一化:Vditor IR 渲染的 textContent 跟 markdown source 可能因不可见字符不一致。
// 统一 NBSP→ASCII space,各种连字符变体→普通 `-`,移除零宽字符。
// 用在 needle 匹配前(source 和 needle 都过),避免肉眼一致但 indexOf 失败。
function normalizeForMatch(text: string): string {
  return text
    .replace(/\u00A0/g, " ")           // NBSP → space
    .replace(/[\u2002-\u200B]/g, " ")  // en/em/figure space + ZWSP → space
    .replace(/\u3000/g, " ")           // fullwidth space → space
    .replace(/[\u200C-\u200F\uFEFF]/g, ""); // ZWNJ/ZWJ/LRM/RLM + BOM
}

// 在 source 中唯一定位 originalText。prefixHint 仅在 originalText 单独歧义时作消歧用。
// 多策略试探,任一策略唯一命中即返回:
//   1) source 精确:仅 originalText(若整段唯一,不需 prefixHint)
//   2) source 精确:prefixHint + originalText(消歧)
//   3) source 兜底:strip 行内 markdown 后,仅 plain originalText
//   4) source 兜底:strip 后,plain prefixHint + plain originalText
//   5) 上述各步先经 normalizeForMatch 归一化空格/连字符再试(应对 IR DOM 字符变体)
// 兜底匹配命中后用 plain→source 映射反查 source 偏移,length 覆盖到 marker 跨度。
export function findUniqueAnchor(
  source: string,
  originalText: string,
  prefixHint?: string | null,
): UniqueAnchorHit | null {
  if (!originalText) return null;

  // ---- 内部:在 src 上试 needle = prefix+ot 的唯一性 ----
  type Hit = { needleStart: number; otStartInSrc: number; otLen: number };
  const tryExact = (src: string, prefix: string, ot: string): Hit | null => {
    if (!ot) return null;
    const needle = `${prefix}${ot}`;
    const start = src.indexOf(needle);
    if (start < 0 || start !== src.lastIndexOf(needle)) return null;
    return { needleStart: start, otStartInSrc: start + prefix.length, otLen: ot.length };
  };

  // 层 1/2:精确
  let hit = tryExact(source, '', originalText);
  if (!hit && prefixHint) hit = tryExact(source, prefixHint, originalText);
  if (hit) {
    return { start: hit.otStartInSrc, length: hit.otLen };
  }

  // 层 1'/2':归一化空格/连字符后精确
  const nSource = normalizeForMatch(source);
  const nOriginal = normalizeForMatch(originalText);
  const nPrefix = prefixHint ? normalizeForMatch(prefixHint) : '';
  hit = tryExact(nSource, '', nOriginal);
  if (!hit && nPrefix) hit = tryExact(nSource, nPrefix, nOriginal);
  if (hit) {
    // normalize 不改字符数,start 对 source 仍有效(单 char→单 char 替换)
    return { start: hit.otStartInSrc, length: hit.otLen };
  }

  // 层 3/4:strip markdown 后(原始字符)
  const stripSource = stripInlineMarkdown(source);
  const stripOriginal = stripInlineMarkdown(originalText);
  if (!stripOriginal) return null;
  const stripPrefix = prefixHint ? stripInlineMarkdown(prefixHint) : '';
  let pHit = tryExact(stripSource, '', stripOriginal);
  if (!pHit && stripPrefix) pHit = tryExact(stripSource, stripPrefix, stripOriginal);

  // 层 3'/4':strip + normalize
  if (!pHit) {
    const nStripSource = normalizeForMatch(stripSource);
    const nStripOriginal = normalizeForMatch(stripOriginal);
    const nStripPrefix = stripPrefix ? normalizeForMatch(stripPrefix) : '';
    pHit = tryExact(nStripSource, '', nStripOriginal);
    if (!pHit && nStripPrefix) pHit = tryExact(nStripSource, nStripPrefix, nStripOriginal);
  }
  if (!pHit) return null;

  // plain→source 映射反查(基于原始 source,不基于 normalize 版本 — 映射跟字符位置一对一)
  const mapFn = buildPlainToSourceMap(source);
  const sourceStart = mapFn(pHit.otStartInSrc);
  const sourceLastChar = mapFn(pHit.otStartInSrc + pHit.otLen - 1);
  if (sourceStart < 0 || sourceLastChar < 0) return null;
  return { start: sourceStart, length: sourceLastChar - sourceStart + 1 };
}

// 触发前移 · 原地闭环 ============================================
// 4 个固定动作走 oneshot(隐藏会话 + 直接拿替换文本);
// explain/custom 走对话框(explain 输出不是替换;custom 要用户输入意图)。
export const ONESHOT_ACTIONS: ReadonlyArray<SelectionActionId> = ['polish', 'shorten', 'expand', 'explain', 'proofread'];
export function isOneshotAction(action: SelectionActionId): boolean {
  return ONESHOT_ACTIONS.includes(action);
}

// 「只展示不替换」的动作：结果卡只显示解释/校对结果，不提供「采纳替换」按钮。
export const DISPLAY_ONLY_ACTIONS: ReadonlyArray<SelectionActionId> = ['explain'];
export function isDisplayOnlyAction(action: SelectionActionId): boolean {
  return DISPLAY_ONLY_ACTIONS.includes(action);
}

// 构造 oneshot 静默调用的 prompt:
//   <动作模板,要求只输出替换文本>
//   ---
//   <选中原文>
//   ---
//
// 不要文件名 header(oneshot 是隐藏会话,目的只是拿替换文本)。
// 不要"请直接输出替换后的文字"那句外层提示——模板里 "只输出..." 已经够强。
export function buildOneshotPrompt(action: SelectionActionId, text: string): string {
  const tpl = SELECTION_ACTIONS[action].template;
  if (!tpl) {
    throw new Error(`buildOneshotPrompt: action ${action} 没有模板(应走对话框,不应走 oneshot)`);
  }
  return `${tpl}\n\n---\n${text}\n---`;
}

// 从 AI 回复中提取纯文本替换内容。
// AI 偶尔仍会把回复包进 ```...``` 代码块,即使 prompt 已要求"不要 markdown 格式"。
// 这里做最后一道清理;非代码块则原样返回(去前后空白)。
export function extractReplacementText(raw: string): string {
  const trimmed = raw.trim();
  const blockMatch = trimmed.match(/^```(?:\w*)\n([\s\S]*?)\n```$/);
  if (blockMatch) return blockMatch[1].trim();
  return trimmed;
}

// 构造注入到 Composer 的文本：
//   > 引用自当前文档「<文件名>」
//   > <选中原文,每行 > 前缀>
//
//   <该动作的 prompt 模板>
//
//   ↑ 光标停在末位空行（textarea 用 selectionStart 控末位）
//
// 「custom」动作时省略 prompt 模板段，光标直接停在引用之后。
export function buildInjectionText(action: SelectionActionId, filePath: string, text: string): string {
  const fileName = fileNameFromPath(filePath);
  const quote = text.split('\n').map((line) => `> ${line}`).join('\n');
  const header = `> 引用自当前文档「${fileName}」`;
  const tpl = SELECTION_ACTIONS[action].template;
  if (action === 'custom' || !tpl) {
    return `${header}\n${quote}\n\n`;
  }
  // 明确告诉 AI：这是选区靶向操作，只替换选中部分，输出即替换结果
  return `${header}\n${quote}\n\n${tpl}\n\n请直接输出替换后的文字，我会用它精确替换原文中选中的那一段。\n\n`;
}
