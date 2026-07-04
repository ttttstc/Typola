import { describe, expect, it } from 'vitest';
import {
  addSkillToScene,
  buildSkillPrefill,
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

  it('defines the M2.5 system templates', () => {
    expect(SYSTEM_SKILL_SCENES.map((scene) => scene.id)).toEqual([
      'common', 'daily', 'report', 'ppt', 'html', 'longform', 'knowledge', 'research',
    ]);
    expect(SYSTEM_SKILL_SCENES.find((scene) => scene.id === 'common')?.skills.map((skill) => skill.name)).toEqual([
      'markitdown',
      'baoyu-url-to-markdown',
      'humanizer',
      'huashu-proofreading',
      'baoyu-translate',
      'huashu-md-to-pdf',
    ]);
    expect(SYSTEM_SKILL_SCENES.find((scene) => scene.id === 'ppt')?.skills.map((skill) => skill.name)).toEqual([
      'huawei-style-ppt-skill',
      'guizang-ppt-skill',
      'huashu-slides',
      'baoyu-slide-deck',
      'ppt-master',
      'huashu-design',
    ]);
    expect(SYSTEM_SKILL_SCENES.find((scene) => scene.id === 'html')?.skills.map((skill) => skill.name)).toEqual([
      'frontend-slides',
      'guizang-ppt-skill',
      'baoyu-markdown-to-html',
      'html-ppt-skill',
      'md2html',
      'huashu-md-html',
      'huashu-design',
    ]);
    expect(SYSTEM_SKILL_SCENES.find((scene) => scene.id === 'report')?.skills.map((skill) => skill.name)).toEqual([
      // 3 个 builtin prompt-only skill + 2 个 installSource-based skill。
      'report-summary',
      'project-retro-report',
      'executive-summary',
      'editorial-card-screenshot',
      'info-card-designer',
    ]);
    const dailySkills = SYSTEM_SKILL_SCENES.find((scene) => scene.id === 'daily')!.skills;
    expect(dailySkills.map((skill) => skill.name)).toEqual([
      'nb',
      'data-report-html',
    ]);
    // data-report-html 是 builtin prompt-only skill,执行完全靠 prefill。
    expect(dailySkills.find((skill) => skill.name === 'data-report-html')?.builtin).toBe(true);
    expect(dailySkills.find((skill) => skill.name === 'data-report-html')?.prefill?.length).toBeGreaterThan(0);
    expect(SYSTEM_SKILL_SCENES.find((scene) => scene.id === 'knowledge')?.skills).toEqual([]);
  });

  it('每个系统场景都带 icon 和 accent(场景卡渲染依赖)', () => {
    for (const scene of SYSTEM_SKILL_SCENES) {
      expect(scene.icon, `${scene.id} 缺 icon`).toBeTruthy();
      expect(scene.accent, `${scene.id} 缺 accent`).toMatch(/^oklch\(/);
    }
  });

  it('filters system templates by supported CLI provider', () => {
    // M2.5 起系统模板默认仅 claude,opencode provider 看不到任何系统模板。
    // 若要让某个 skill 同时支持 opencode,在数据里显式加 supportedProviders。
    expect(getSystemSkillScenesForProvider('claude').find((scene) => scene.id === 'ppt')?.skills.map((skill) => skill.name)).toEqual([
      'huawei-style-ppt-skill',
      'guizang-ppt-skill',
      'huashu-slides',
      'baoyu-slide-deck',
      'ppt-master',
      'huashu-design',
    ]);
    expect(getSystemSkillScenesForProvider('opencode').find((scene) => scene.id === 'ppt')?.skills).toEqual([]);
    expect(getSystemSkillScenesForProvider('opencode').find((scene) => scene.id === 'html')?.skills).toEqual([]);
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

  it('merges providers when adding the same custom capability name for another provider', () => {
    const claudeHub = addSkillToScene(EMPTY_SKILL_HUB, 'html', {
      name: 'frontend-slides',
      description: 'Claude version',
      supportedProviders: ['claude'],
    });
    const mixedHub = addSkillToScene(claudeHub, 'html', {
      name: 'frontend-slides',
      description: 'OpenCode version',
      supportedProviders: ['opencode'],
    });

    expect(mixedHub.sceneAdditions.html).toEqual([
      { name: 'frontend-slides', description: 'Claude version', supportedProviders: ['claude', 'opencode'] },
    ]);
    expect(getSceneAdditionsForProvider(mixedHub, 'html', 'claude')).toHaveLength(1);
    expect(getSceneAdditionsForProvider(mixedHub, 'html', 'opencode')).toHaveLength(1);
  });

  it('builds install prompt with source fallback', () => {
    const skill = SYSTEM_SKILL_SCENES.find((scene) => scene.id === 'html')!.skills[0];
    expect(buildSkillInstallPrompt(skill)).toContain('请帮我安装 Claude skill：frontend-slides');
    // M2.5: 预置 skill 仅提供 installSource(GitHub URL),不再有 expectedPath(绝对路径)。
    expect(buildSkillInstallPrompt(skill)).toContain(skill.installSource!);
  });

  it('builds OpenCode command install prompt without Claude copy', () => {
    const skill = SYSTEM_SKILL_SCENES.find((scene) => scene.id === 'html')!.skills[0];
    const prompt = buildSkillInstallPrompt(skill, 'opencode');
    expect(prompt).toContain('请帮我创建或安装 OpenCode command：frontend-slides');
    expect(prompt).toContain('opencode run --command frontend-slides');
    expect(prompt).not.toContain('Claude');
    expect(prompt).not.toContain('.claude');
    expect(prompt).toContain('%USERPROFILE%\\.config\\opencode\\commands\\frontend-slides.md');
  });

  it('builds provider-specific skill prefill text', () => {
    // 普通 Claude skill (无 prefill 模板) 走 fallback goal 分支。
    expect(buildSkillPrefill('claude', { name: 'frontend-slides' })).toBe(
      '/frontend-slides\n\n请使用 frontend-slides 完成当前任务。',
    );
    expect(buildSkillPrefill('opencode', { name: 'frontend-slides' })).toBe(
      '请使用 frontend-slides：\n\n请使用 frontend-slides 完成当前任务。',
    );
  });

  it('buildSkillPrefill builtin skill returns prefill only (no slash)', () => {
    // builtin skill 不生成 /name slash,执行完全靠自然语言。
    const builtinSkill = {
      name: 'data-report-html',
      label: '数据报表 HTML',
      summary: '...',
      system: true as const,
      builtin: true,
      prefill: '请基于当前文档生成数据报表 HTML。',
    };
    expect(buildSkillPrefill('claude', builtinSkill)).toBe('请基于当前文档生成数据报表 HTML。');
    expect(buildSkillPrefill('opencode', builtinSkill)).toBe('请基于当前文档生成数据报表 HTML。');
  });

  it('buildSkillPrefill skill with prefill template injects /name + template', () => {
    const skill = {
      name: 'editorial-card-screenshot',
      label: '编辑风信息卡',
      summary: '...',
      system: true as const,
      prefill: '请基于当前文档生成信息卡。',
    };
    expect(buildSkillPrefill('claude', skill)).toBe(
      '/editorial-card-screenshot\n\n请基于当前文档生成信息卡。',
    );
    expect(buildSkillPrefill('opencode', skill)).toBe(
      '请使用 editorial-card-screenshot：\n\n请基于当前文档生成信息卡。',
    );
  });

  it('buildSkillPrefill uses scene label for fallback goal', () => {
    const scene = {
      id: 'report' as const,
      label: '报告总结',
      description: '',
      icon: 'ClipboardList',
      accent: '',
      skills: [],
    };
    expect(buildSkillPrefill('claude', { name: 'nb' }, scene)).toBe(
      '/nb\n\n请基于当前文档执行「报告总结」场景下的「nb」任务。',
    );
    // skill.label 优先于 name 用于 fallback 文案。
    expect(buildSkillPrefill('claude', { name: 'nb', label: '本地笔记周报' }, scene)).toBe(
      '/nb\n\n请基于当前文档执行「报告总结」场景下的「本地笔记周报」任务。',
    );
  });

  it('buildSkillPrefill strips leading slash from skill name', () => {
    expect(buildSkillPrefill('claude', { name: '/frontend-slides' })).toBe(
      '/frontend-slides\n\n请使用 frontend-slides 完成当前任务。',
    );
  });

  it('buildSkillPrefill returns empty for empty skill name', () => {
    expect(buildSkillPrefill('claude', { name: '' })).toBe('');
    expect(buildSkillPrefill('claude', { name: '   ' })).toBe('');
  });
});
