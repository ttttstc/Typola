// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { translate } from './i18n';

describe('i18n translate — 平台修饰键', () => {
  // jsdom 的 navigator.platform 为空字符串(非 macOS),字典里的 Cmd 应渲染为 Ctrl。
  it('非 macOS 平台把 tooltip 里的 Cmd 渲染为 Ctrl', () => {
    expect(translate('zh-CN', 'toolbarNewTitle')).toContain('Ctrl+N');
    expect(translate('zh-CN', 'toolbarNewTitle')).not.toContain('Cmd');
    expect(translate('zh-CN', 'toolbarSaveTitle')).toContain('Ctrl+S');
    expect(translate('zh-CN', 'toolbarSettingsTitle')).toContain('Ctrl+,');
  });

  it('三种语言的 Cmd 都被替换', () => {
    for (const locale of ['zh-CN', 'en-US', 'ja-JP'] as const) {
      expect(translate(locale, 'toolbarOpenTitle')).not.toContain('Cmd');
    }
  });

  it('不含 Cmd 的文案原样返回', () => {
    expect(translate('zh-CN', 'toolbarBoldLabel')).toBe('加粗 (Ctrl+B)');
  });
});
