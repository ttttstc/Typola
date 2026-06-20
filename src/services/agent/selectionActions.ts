// 选区右键 AI 动作定义 + 注入文本构造。
// M3 选区注入最小入口：5 个固定模板 + 1 个自定义（空模板）。
export type SelectionActionId = 'polish' | 'rewrite' | 'shorten' | 'expand' | 'explain' | 'custom';

export const SELECTION_ACTIONS: Record<SelectionActionId, { label: string; icon: string; template: string }> = {
  polish: {
    label: '润色',
    icon: '✨',
    template: '请润色以下选中的文字：让表达更流畅自然，保留原意和事实，去掉冗余。只输出润色后的结果，不要任何解释、不要前后缀、不要 markdown 格式标记。',
  },
  rewrite: {
    label: '改写',
    icon: '🔁',
    template: '请改写以下选中的文字：换一种说法表达，保留所有信息。只输出改写后的结果，不要任何解释、不要前后缀、不要 markdown 格式标记。',
  },
  shorten: {
    label: '缩写',
    icon: '➖',
    template: '请精简以下选中的文字：保留核心信息，去掉修饰和重复，目标长度约一半。只输出精简后的结果，不要任何解释、不要前后缀、不要 markdown 格式标记。',
  },
  expand: {
    label: '扩写',
    icon: '➕',
    template: '请扩写以下选中的文字：补充细节、例证或论据，让段落更充实，保持原文风格和立场。只输出扩写后的结果，不要任何解释、不要前后缀、不要 markdown 格式标记。',
  },
  explain: {
    label: '解释术语',
    icon: '📖',
    template: '请解释以下选中文字中的关键术语：先列术语清单，再每个 1-2 句解释，最后给一段重写版（嵌入解释）。只输出解释和重写结果，不要额外寒暄。',
  },
  custom: {
    label: '自定义',
    icon: '✏️',
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

// 在 source 中唯一定位 originalText（可选 prefixHint 消歧）。
// - 0 处匹配 → null（stale）
// - 多处匹配 → null（歧义，无法安全替换）
// - 唯一匹配 → 返回 { start, length },start 指向 originalText 起点
//
// 唯一性判定：source.indexOf(needle) === source.lastIndexOf(needle)。
// 这是 WYSIWYG 模式 anchor 校验/替换的共用底层，避免「文档里有重复片段时
// indexOf 撞到错误位置」导致误改。
export function findUniqueAnchor(
  source: string,
  originalText: string,
  prefixHint?: string | null,
): UniqueAnchorHit | null {
  if (!originalText) return null;
  const needle = prefixHint ? `${prefixHint}${originalText}` : originalText;
  const needleStart = source.indexOf(needle);
  if (needleStart < 0) return null;
  if (needleStart !== source.lastIndexOf(needle)) return null;
  return {
    start: needleStart + (prefixHint ? prefixHint.length : 0),
    length: originalText.length,
  };
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
