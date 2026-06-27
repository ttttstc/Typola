import { describe, expect, it } from 'vitest';
import {
  addSkillToScene,
  buildSkillInstallPrompt,
  EMPTY_SKILL_HUB,
  getSceneAdditionsForProvider,
  getSystemSkillScenesForProvider,
  parseSkillHubJson,
  removeCustomSkillFromScene,
  serializeSkillHub,
  SYSTEM_SKILL_SCENES,
} from './skillHub';

describe('parseSkillHubJson', () => {
  it('returns empty v2 hub for blank input', () => {
    expect(parseSkillHubJson('')).toEqual({ hub: { ...EMPTY_SKILL_HUB } });
    expect(parseSkillHubJson('   \n  ')).toEqual({ hub: { ...EMPTY_SKILL_HUB } });
  });

  it('returns error on invalid JSON', () => {
    const result = parseSkillHubJson('{not valid');
    expect(result.error).toMatch(/JSON 解析失败/);
    expect(result.hub).toEqual(EMPTY_SKILL_HUB);
  });

  it('parses v2 scene additions and strips leading slash from skill names', () => {
    const raw = JSON.stringify({
      version: 2,
      sceneAdditions: {
        ppt: [
          { name: '/baoyu-slide-deck' },
          { name: 'reviewer', description: '审稿助手' },
          { name: 'reviewer', description: '重复项' },
        ],
      },
      hiddenSystemSkills: { ppt: ['/x'] },
    });
    const { hub, error } = parseSkillHubJson(raw);
    expect(error).toBeUndefined();
    expect(hub.sceneAdditions.ppt).toEqual([
      { name: 'baoyu-slide-deck' },
      { name: 'reviewer', description: '审稿助手' },
    ]);
    expect(hub.hiddenSystemSkills.ppt).toEqual(['x']);
  });

  it('converts legacy v1 categories into user scene additions', () => {
    const raw = JSON.stringify({
      version: 1,
      categories: [
        {
          id: 'ppt',
          label: 'PPT',
          skills: [
            { name: '/baoyu-slide-deck' },
            { name: 'reviewer', description: '审稿助手' },
          ],
        },
      ],
    });
    const { hub, error } = parseSkillHubJson(raw);
    expect(error).toBeUndefined();
    expect(hub.version).toBe(2);
    expect(hub.sceneAdditions.ppt).toEqual([
      { name: 'baoyu-slide-deck' },
      { name: 'reviewer', description: '审稿助手' },
    ]);
  });

  it('round-trips through serializeSkillHub', () => {
    const hub = {
      version: 2 as const,
      sceneAdditions: {
        report: [{ name: 'reporter', description: 'desc' }],
      },
      hiddenSystemSkills: {},
    };
    const text = serializeSkillHub(hub);
    const { hub: parsed, error } = parseSkillHubJson(text);
    expect(error).toBeUndefined();
    expect(parsed).toEqual(hub);
  });
});

describe('skill hub helpers', () => {
  it('adds and removes only custom scene additions', () => {
    const added = addSkillToScene(EMPTY_SKILL_HUB, 'ppt', { name: '/custom-ppt', description: '自定义' });
    expect(added.sceneAdditions.ppt).toEqual([{ name: 'custom-ppt', description: '自定义' }]);
    expect(removeCustomSkillFromScene(added, 'ppt', 'custom-ppt').sceneAdditions.ppt).toEqual([]);
  });

  it('defines the first system templates', () => {
    expect(SYSTEM_SKILL_SCENES.map((scene) => scene.id)).toEqual([
      'daily', 'summary', 'ppt', 'html', 'wechat', 'data',
    ]);
    expect(SYSTEM_SKILL_SCENES.find((scene) => scene.id === 'ppt')?.skills.map((skill) => skill.name)).toEqual([
      'huawei-style-ppt-skill',
      'guizang-ppt-skill',
      'huashu-slides',
      'baoyu-slide-deck',
      'ppt-master',
    ]);
    expect(SYSTEM_SKILL_SCENES.find((scene) => scene.id === 'html')?.skills.map((skill) => skill.name)).toEqual([
      'frontend-slides',
      'guizang-ppt-skill',
      'baoyu-markdown-to-html',
      'html-ppt-skill',
      'md2html',
    ]);
    expect(SYSTEM_SKILL_SCENES.find((scene) => scene.id === 'wechat')?.skills.map((skill) => skill.name)).toEqual([
      'ni-writer',
    ]);
  });

  it('每个系统场景都带 icon 和 accent(场景卡渲染依赖)', () => {
    for (const scene of SYSTEM_SKILL_SCENES) {
      expect(scene.icon, `${scene.id} 缺 icon`).toBeTruthy();
      expect(scene.accent, `${scene.id} 缺 accent`).toMatch(/^oklch\(/);
    }
  });

  it('filters system templates by supported CLI provider', () => {
    expect(getSystemSkillScenesForProvider('claude').find((scene) => scene.id === 'ppt')?.skills.map((skill) => skill.name)).toEqual([
      'huawei-style-ppt-skill',
      'guizang-ppt-skill',
      'huashu-slides',
      'baoyu-slide-deck',
      'ppt-master',
    ]);
    expect(getSystemSkillScenesForProvider('opencode').flatMap((scene) => scene.skills)).toEqual([]);
  });

  it('filters user-added Claude skills out for OpenCode provider', () => {
    const hub = addSkillToScene(EMPTY_SKILL_HUB, 'ppt', { name: 'frontend-slides' });
    expect(getSceneAdditionsForProvider(hub, 'ppt', 'claude')).toEqual([{ name: 'frontend-slides' }]);
    expect(getSceneAdditionsForProvider(hub, 'ppt', 'opencode')).toEqual([]);
  });

  it('keeps user-added OpenCode commands visible for OpenCode provider', () => {
    const hub = addSkillToScene(EMPTY_SKILL_HUB, 'ppt', { name: 'write-report', supportedProviders: ['opencode'] });
    expect(getSceneAdditionsForProvider(hub, 'ppt', 'claude')).toEqual([]);
    expect(getSceneAdditionsForProvider(hub, 'ppt', 'opencode')).toEqual([
      { name: 'write-report', supportedProviders: ['opencode'] },
    ]);
    expect(parseSkillHubJson(serializeSkillHub(hub)).hub).toEqual(hub);
  });

  it('builds install prompt with source fallback', () => {
    const skill = SYSTEM_SKILL_SCENES.find((scene) => scene.id === 'html')!.skills[0];
    expect(buildSkillInstallPrompt(skill)).toContain('请帮我安装 Claude skill：frontend-slides');
    expect(buildSkillInstallPrompt(skill)).toContain(skill.expectedPath);
  });
});
