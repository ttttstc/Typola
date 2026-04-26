// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { OPENAI_COMPAT_PRESETS, normalizeOpenAICompatibleConfig } from '../src/llm/types';

describe('llm preset config', () => {
  it('uses the official MiniMax OpenAI-compatible endpoint and model', () => {
    expect(OPENAI_COMPAT_PRESETS.minimax.baseUrl).toBe('https://api.minimaxi.com/v1');
    expect(OPENAI_COMPAT_PRESETS.minimax.defaultModel).toBe('MiniMax-M2.7');
  });

  it('migrates legacy MiniMax defaults to the current official values', () => {
    const normalized = normalizeOpenAICompatibleConfig('minimax', {
      baseUrl: 'https://api.minimaxi.chat/v1',
      model: 'MiniMax-Text-01',
    });

    expect(normalized).toEqual({
      baseUrl: 'https://api.minimaxi.com/v1',
      model: 'MiniMax-M2.7',
    });
  });

  it('migrates the previous api.minimax.io endpoint to the current minimaxi.com domain', () => {
    const normalized = normalizeOpenAICompatibleConfig('minimax', {
      baseUrl: 'https://api.minimax.io/v1',
      model: 'MiniMax-M2.7',
    });

    expect(normalized).toEqual({
      baseUrl: 'https://api.minimaxi.com/v1',
      model: 'MiniMax-M2.7',
    });
  });

  it('does not override custom OpenAI-compatible values', () => {
    const normalized = normalizeOpenAICompatibleConfig('minimax', {
      baseUrl: 'https://api.minimaxi.com/v1',
      model: 'MiniMax-M2.7-highspeed',
    });

    expect(normalized).toEqual({
      baseUrl: 'https://api.minimaxi.com/v1',
      model: 'MiniMax-M2.7-highspeed',
    });
  });
});
