import { describe, expect, it } from 'vitest';
import {
  parseFlowScenariosJson,
  serializeFlowScenarios,
} from './flowScenarioService';

describe('parseFlowScenariosJson (P1-D JSON 失败可见)', () => {
  it('空字符串:返回 seed,无 error', () => {
    const result = parseFlowScenariosJson('');
    expect(result.error).toBeUndefined();
    expect(result.scenarios.length).toBeGreaterThan(0);
  });

  it('空白字符串:返回 seed,无 error', () => {
    const result = parseFlowScenariosJson('   \n\t  ');
    expect(result.error).toBeUndefined();
    expect(result.scenarios.length).toBeGreaterThan(0);
  });

  it('合法 JSON 数组:返回解析结果,无 error', () => {
    const raw = JSON.stringify([{
      id: 'a',
      label: 'A',
      promptTemplate: '{file}',
    }]);
    const result = parseFlowScenariosJson(raw);
    expect(result.error).toBeUndefined();
    expect(result.scenarios).toEqual([{
      id: 'a',
      label: 'A',
      promptTemplate: '{file}',
      description: '',
    }]);
  });

  it('JSON 语法错误:返回空 + 错误消息(不静默回退 seed)', () => {
    const result = parseFlowScenariosJson('{ "id": "a", }');
    expect(result.scenarios).toEqual([]);
    expect(result.error).toContain('JSON 解析失败');
  });

  it('JSON 不是数组:返回空 + 错误消息', () => {
    const result = parseFlowScenariosJson('{ "id": "a" }');
    expect(result.scenarios).toEqual([]);
    expect(result.error).toBe('场景注册表必须为 JSON 数组');
  });

  it('数组但全是无效 entry:返回空 + 错误消息(不静默回退 seed)', () => {
    const result = parseFlowScenariosJson(JSON.stringify([
      { id: 'no-label' },
      { label: 'no-id' },
      {},
    ]));
    expect(result.scenarios).toEqual([]);
    expect(result.error).toContain('所有场景都缺少必填字段');
  });

  it('部分 entry 无效:返回有效部分,无 error', () => {
    const result = parseFlowScenariosJson(JSON.stringify([
      { id: 'a', label: 'A', promptTemplate: 'p' },
      { id: 'no-label' },
    ]));
    expect(result.error).toBeUndefined();
    expect(result.scenarios).toHaveLength(1);
    expect(result.scenarios[0]?.id).toBe('a');
  });

  it('serializeFlowScenarios 正确序列化', () => {
    const out = serializeFlowScenarios([{
      id: 'a',
      label: 'A',
      promptTemplate: 'p',
      description: 'd',
    }]);
    expect(JSON.parse(out)).toEqual([{
      id: 'a',
      label: 'A',
      promptTemplate: 'p',
      description: 'd',
    }]);
  });
});
