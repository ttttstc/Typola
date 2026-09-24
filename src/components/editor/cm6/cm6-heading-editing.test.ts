// @vitest-environment jsdom
// 标题识别 × 编辑交互审计套件。
//
// 背景:用户报告「md 编辑时如果本行有前缀符号,换行会自动带上折叠角标,而且删不掉」。
// 断言基准(CommonMark):setext heading 的文本行必须是段落(paragraph)。
// 列表项 / 引用 / 任务项 / 有序列表等前缀行不是段落,不可能成为 setext 标题文本;
// 因此「前缀行 + 下一行 -/---/===」不得产生 heading,也不得注入折叠角标。
// 「普通段落 + 下划线」是合法 setext,必须保留角标。
//
// 当前红 = 待修复 bug 清单;修复后全绿,作为回归套件保留。

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { headingFoldExtension } from './headingFoldExtension';
import { analyzeMarkdown } from '../../../services/markdownAnalysisService';

const FOLD_TOGGLE_CLASS = 'typola-heading-fold-toggle';

function createView(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({
    state: EditorState.create({
      doc,
      extensions: [markdown({ base: markdownLanguage }), headingFoldExtension()],
    }),
    parent,
  });
}

/** 在指定位置插入文本(默认文末),模拟逐字输入/Enter。 */
function type(view: EditorView, text: string, at = view.state.doc.length): void {
  view.dispatch({ changes: { from: at, insert: text } });
}

function deleteRange(view: EditorView, from: number, to: number): void {
  view.dispatch({ changes: { from, to } });
}

function toggleLineTexts(view: EditorView): string[] {
  return Array.from(view.contentDOM.querySelectorAll<HTMLElement>(`.${FOLD_TOGGLE_CLASS}`)).map(
    (el) => el.closest('.cm-line')?.textContent ?? '',
  );
}

function headingSummaries(source: string): Array<[number, string]> {
  return analyzeMarkdown(source).headings.map((h) => [h.level, h.text] as [number, string]);
}

// ============================================================================
// 一、纯分析层:前缀行 × 下一行 全矩阵
// 期望:前缀行 + 任何下划线形态 → 不产生 heading
// ============================================================================

describe('analyzeMarkdown:前缀行不是 setext 标题(全矩阵)', () => {
  const prefixedLines = [
    '- item', // 无序列表(连字符)
    '* item', // 无序列表(星号)
    '+ item', // 无序列表(加号)
    '1. item', // 有序列表
    '1) item', // 有序列表(括号)
    '- [ ] task', // 未完成任务
    '- [x] task', // 已完成任务
    '> quote', // 引用
    '> - item', // 引用内列表
    '  - item', // 缩进列表
    '- item1\n- item2', // 多行列表的最后一项
  ];
  const underlines = ['---', '--', '-', '- ', '-- ', '===', '==', '=', '= '];

  for (const prefixed of prefixedLines) {
    for (const underline of underlines) {
      const source = `${prefixed}\n${underline}\n`;
      it(`${JSON.stringify(prefinedLabel(prefixed))} + ${JSON.stringify(underline)} → 无 heading`, () => {
        expect(headingSummaries(source)).toEqual([]);
      });
    }
  }
});

function prefinedLabel(line: string): string {
  return line;
}

// ============================================================================
// 二、纯分析层:合法 setext 与对照(必须保留 / 不得误伤)
// ============================================================================

describe('analyzeMarkdown:合法 setext 保留', () => {
  it('段落 + --- → H2', () => {
    expect(headingSummaries('text\n---\n')).toEqual([[2, 'text']]);
  });

  it('段落 + === → H1', () => {
    expect(headingSummaries('text\n===\n')).toEqual([[1, 'text']]);
  });

  it('段落 + 单个 - → H2(CommonMark 合法下划线)', () => {
    expect(headingSummaries('text\n-\n')).toEqual([[2, 'text']]);
  });

  it('段落 + 单个 = → H1', () => {
    expect(headingSummaries('text\n=\n')).toEqual([[1, 'text']]);
  });

  it('ATX heading + --- → 仍是 ATX heading(下划线成 thematic break)', () => {
    expect(headingSummaries('# H\n---\n')).toEqual([[1, 'H']]);
  });

  it('引用内合法 setext("> quote\\n> ---",CommonMark:引用延续前缀 + 下划线)→ 引用内 H2', () => {
    // 写作模式 Enter 会自动延续 "> ",此后输入 --- 形成 "> ---" ——这是合法的
    // 引用块内 setext 标题,角标应当出现(非 bug)。
    expect(headingSummaries('> quote\n> ---\n')).toEqual([[2, 'quote']]);
  });

  it('引用内合法 setext("> quote\\n> ===")→ 引用内 H1', () => {
    expect(headingSummaries('> quote\n> ===\n')).toEqual([[1, 'quote']]);
  });

  it('多行段落 + --- → 单个 setext H2(lezer 节点覆盖多行,不再双算)', () => {
    expect(headingSummaries('para1\npara2\n---\n')).toEqual([[2, 'para1']]);
  });
});

describe('analyzeMarkdown:空行 / 代码块隔断对照', () => {
  it('前缀行 + 空行 + --- → 无 heading(空行隔断)', () => {
    expect(headingSummaries('- item\n\n---\n')).toEqual([]);
  });

  it('前缀行 + 普通文本行 → 无 heading', () => {
    expect(headingSummaries('- item\ntext\n')).toEqual([]);
  });

  it('代码块内的 --- 不与前缀行构成 setext', () => {
    expect(headingSummaries('- item\n```\n---\n```\n')).toEqual([]);
  });

  it('代码块内的 # 行不是 heading', () => {
    expect(headingSummaries('```\n# not heading\n```\n')).toEqual([]);
  });
});

// ============================================================================
// 三、编辑器层:换行 + 输入下一项(用户报告的主场景)
// ============================================================================

describe('编辑器:换行后输入列表符号,上一行不得出现折叠角标', () => {
  let view: EditorView | null = null;

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    if (view && !view.destroyed) {
      const parent = view.dom.parentElement;
      view.destroy();
      parent?.remove();
    }
    view = null;
    document.body.innerHTML = '';
  });

  it('场景A:"- item" 行尾 Enter,新行输入 "-"(正在输入列表项)', () => {
    view = createView('- item');
    expect(toggleLineTexts(view)).toEqual([]);
    type(view, '\n'); // Enter
    type(view, '-'); // 输入下一个列表项的符号
    expect(toggleLineTexts(view)).toEqual([]);
  });

  it('场景A持续态:新行停在空列表项 "- ",角标不得挂在上一行', () => {
    view = createView('- item');
    type(view, '\n- ');
    expect(toggleLineTexts(view)).toEqual([]);
  });

  it('场景A补全:新行输入 "- text" 后无角标', () => {
    view = createView('- item');
    type(view, '\n- text');
    expect(toggleLineTexts(view)).toEqual([]);
  });

  it.each(['*', '+'])('场景A星号/加号:新行输入 "%s" 无角标', (marker) => {
    view = createView('- item');
    type(view, `\n${marker}`);
    expect(toggleLineTexts(view)).toEqual([]);
  });

  it.each(['- item', '* item', '+ item', '1. item', '1) item', '- [ ] task', '- [x] task', '> quote', '  - item'])(
    '场景B:前缀行 "%s" 下一行输入分割线 "---" → 无角标',
    (line) => {
      view = createView(line);
      type(view, '\n---');
      expect(toggleLineTexts(view)).toEqual([]);
    },
  );

  it.each(['- item', '> quote', '1. item'])('场景K:前缀行 "%s" 下一行输入 "===" → 无角标', (line) => {
    view = createView(line);
    type(view, '\n===');
    expect(toggleLineTexts(view)).toEqual([]);
  });

  it('场景C:多行列表末项 + 下一行 "-" → 无角标', () => {
    view = createView('- a\n- b');
    type(view, '\n-');
    expect(toggleLineTexts(view)).toEqual([]);
  });

  it('场景C持续:多行列表末项 + 空列表项 "- " → 无角标', () => {
    view = createView('- a\n- b');
    type(view, '\n- ');
    expect(toggleLineTexts(view)).toEqual([]);
  });
});

// ============================================================================
// 四、编辑器层:已有下划线时的逐字删除("删不掉"场景)
// ============================================================================

describe('编辑器:前缀行 + 下划线初始即存在,逐字删除也不得有角标', () => {
  let view: EditorView | null = null;

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    if (view && !view.destroyed) {
      const parent = view.dom.parentElement;
      view.destroy();
      parent?.remove();
    }
    view = null;
    document.body.innerHTML = '';
  });

  it('打开即包含 "- item\\n---" → 无角标;逐字删成 "--"/"-" 仍无角标', () => {
    view = createView('- item\n---\n');
    expect(toggleLineTexts(view)).toEqual([]);
    // 删末行最后一个字符:--- → --
    deleteRange(view, view.state.doc.length - 2, view.state.doc.length - 1);
    expect(toggleLineTexts(view)).toEqual([]);
    // -- → -
    deleteRange(view, view.state.doc.length - 2, view.state.doc.length - 1);
    expect(toggleLineTexts(view)).toEqual([]);
    // - → 空(下划线整行删除)
    deleteRange(view, view.state.doc.length - 2, view.state.doc.length - 1);
    expect(toggleLineTexts(view)).toEqual([]);
  });

  it.each(['> quote', '1. item', '- [ ] task', '  - item'])(
    '打开即包含 "%s\\n---" → 无角标',
    (line) => {
      view = createView(`${line}\n---\n`);
      expect(toggleLineTexts(view)).toEqual([]);
    },
  );

  it('删除前缀行自身文字("- item" 删成 "-")→ 仍无角标(空列表项不是标题)', () => {
    view = createView('- item\n---\n');
    // 删掉 "item" 4 个字符
    const start = view.state.doc.toString().indexOf('item');
    deleteRange(view, start, start + 4);
    expect(toggleLineTexts(view)).toEqual([]);
  });
});

// ============================================================================
// 五、编辑器层:合法场景不回归(角标该在的时候必须在)
// ============================================================================

describe('编辑器:合法 heading 场景角标必须在', () => {
  let view: EditorView | null = null;

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    if (view && !view.destroyed) {
      const parent = view.dom.parentElement;
      view.destroy();
      parent?.remove();
    }
    view = null;
    document.body.innerHTML = '';
  });

  it('ATX:输入 "# abc" → 角标出现', () => {
    view = createView('');
    type(view, '# abc');
    expect(toggleLineTexts(view)).toEqual(['▼# abc']);
  });

  it('ATX 输入中:"#" 与 "# " 单独存在 → 无角标(空标题)', () => {
    view = createView('');
    type(view, '#');
    expect(toggleLineTexts(view)).toEqual([]);
    type(view, ' ');
    expect(toggleLineTexts(view)).toEqual([]);
    type(view, 'abc');
    expect(toggleLineTexts(view)).toEqual(['▼# abc']);
  });

  it('setext:段落 Enter 后输入 "---" → 角标出现在段落行(合法 setext H2)', () => {
    view = createView('text');
    type(view, '\n---');
    expect(toggleLineTexts(view)).toEqual(['▼text']);
  });

  it('setext:段落 Enter 后输入 "===" → 角标出现(合法 setext H1)', () => {
    view = createView('text');
    type(view, '\n===');
    expect(toggleLineTexts(view)).toEqual(['▼text']);
  });

  it('setext 合法场景逐字删除:删到单 "-" 角标仍在,删空后消失', () => {
    view = createView('text\n---\n');
    expect(toggleLineTexts(view)).toEqual(['▼text']);
    deleteRange(view, view.state.doc.length - 2, view.state.doc.length - 1); // --- → --
    expect(toggleLineTexts(view)).toEqual(['▼text']);
    deleteRange(view, view.state.doc.length - 2, view.state.doc.length - 1); // -- → -
    expect(toggleLineTexts(view)).toEqual(['▼text']);
    deleteRange(view, view.state.doc.length - 2, view.state.doc.length - 1); // - → 空
    expect(toggleLineTexts(view)).toEqual([]);
  });

  it('空行隔断:前缀行 Enter Enter 后输入 "---" → 无角标', () => {
    view = createView('- item');
    type(view, '\n'); // Enter
    type(view, '\n'); // 再 Enter,产生空行
    type(view, '---');
    expect(toggleLineTexts(view)).toEqual([]);
  });

  it('行中拆分:标题行 "# Tit|le" 拆成两段 → 角标只在 "# Tit"', () => {
    view = createView('# Title');
    const at = view.state.doc.toString().indexOf('le');
    type(view, '\n', at); // 在 "le" 前 Enter
    expect(toggleLineTexts(view)).toEqual(['▼# Tit']);
  });

  it('行中拆分:列表项 "- it|em" 拆开后无角标,续行再接 "---" 角标落在续行(合法 setext)', () => {
    view = createView('- item');
    const at = view.state.doc.toString().indexOf('em');
    type(view, '\n', at); // "- it" / "em"
    expect(toggleLineTexts(view)).toEqual([]);
    type(view, '\n---');
    // "em" 是普通段落 + "---" → 合法 setext H2;"- it" 不得有角标
    expect(toggleLineTexts(view)).toEqual(['▼em']);
  });

  it('普通文字编辑:段落中间逐字输入不产生角标', () => {
    view = createView('hello');
    for (const ch of ' world') type(view, ch);
    expect(toggleLineTexts(view)).toEqual([]);
  });

  it('代码块内编辑:输入 "# x" 不产生角标', () => {
    view = createView('```\n');
    type(view, '# x\n');
    type(view, '```');
    expect(toggleLineTexts(view)).toEqual([]);
  });
});
