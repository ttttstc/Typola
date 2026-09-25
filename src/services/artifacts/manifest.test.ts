import { describe, expect, it } from 'vitest';
import { deriveArtifactTitle, isArtifactCandidatePath } from './manifest';

describe('isArtifactCandidatePath', () => {
  it('收有扩展名的文件', () => {
    expect(isArtifactCandidatePath('D:/ws/.typola-output/conv-1/report.html')).toBe(true);
    expect(isArtifactCandidatePath('D:/ws/.typola-output/conv-1/notes.md')).toBe(true);
    expect(isArtifactCandidatePath('D:\\ws\\.typola-output\\conv-1\\data.json')).toBe(true);
  });

  it('排除会话目录(watcher 的 mkdir 事件)与 manifest 元数据', () => {
    expect(isArtifactCandidatePath('D:/ws/.typola-output/conv-1')).toBe(false);
    expect(isArtifactCandidatePath('D:/ws/.typola-output/conv-1/artifact.json')).toBe(false);
    expect(isArtifactCandidatePath('D:/ws/.typola-output/conv-1/ARTIFACT.JSON')).toBe(false);
    expect(isArtifactCandidatePath('D:/ws/.typola-output/conv-1/README')).toBe(false);
  });
});

describe('deriveArtifactTitle', () => {
  it('HTML 制品优先取 <title>', () => {
    const html = '<html><head><title>季度汇报图表</title></head><body><h1>备用标题</h1></body></html>';
    expect(deriveArtifactTitle('conv-1/report.html', html)).toBe('季度汇报图表');
  });

  it('HTML 无 <title> 时回落首个 <h1>', () => {
    const html = '<html><body><h1 class="big">数据概览</h1></body></html>';
    expect(deriveArtifactTitle('conv-1/report.html', html)).toBe('数据概览');
  });

  it('wechat-html / ppt-html 同样按 HTML 推导', () => {
    const html = '<head><title>公众号排版</title></head>';
    expect(deriveArtifactTitle('conv-1/wechat-2024.html', html)).toBe('公众号排版');
    expect(deriveArtifactTitle('conv-1/ppt-final.html', html)).toBe('公众号排版');
  });

  it('Markdown 取首个一级标题', () => {
    const md = '前言段落\n\n# 项目复盘报告\n\n正文';
    expect(deriveArtifactTitle('conv-1/notes.md', md)).toBe('项目复盘报告');
  });

  it('Markdown 标题剥掉闭合 # 与首尾空白', () => {
    expect(deriveArtifactTitle('a.md', '#  标题带空格  ##\n')).toBe('标题带空格');
  });

  it('取不到标题时返回 undefined(调用方回落默认命名)', () => {
    expect(deriveArtifactTitle('a.md', '没有标题的正文')).toBeUndefined();
    expect(deriveArtifactTitle('a.html', '<p>无标题</p>')).toBeUndefined();
    expect(deriveArtifactTitle('data.csv', 'a,b,c')).toBeUndefined();
  });

  it('标题中的内联标签被剥掉、实体与多余空白被清理', () => {
    const html = '<title>图表 <b>2026</b>&nbsp;版</title>';
    expect(deriveArtifactTitle('a.html', html)).toBe('图表 2026 版');
  });

  it('超过 40 字符截断并加省略号', () => {
    const long = '一'.repeat(50);
    const result = deriveArtifactTitle('a.md', `# ${long}`);
    expect(result).toBe(`${'一'.repeat(40)}…`);
  });

  it('清理后为空串返回 undefined', () => {
    expect(deriveArtifactTitle('a.html', '<title>   </title>')).toBeUndefined();
    expect(deriveArtifactTitle('a.md', '# <b></b>')).toBeUndefined();
  });
});
