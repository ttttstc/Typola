import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  ArrowLeft, BarChart3, CalendarDays, Check, ClipboardList, Globe, PenLine,
  Plus, Presentation, RefreshCw, Search, Sparkles, Trash2, TriangleAlert, type LucideProps,
} from 'lucide-react';
import type { AgentProvider } from '../services/agent/provider';
import { listLocalSkills, type Skill } from '../services/agent/skillScanner';
import {
  addSkillToScene,
  buildSkillInstallPrompt,
  getSceneAdditionsForProvider,
  getSystemSkillScenesForProvider,
  removeCustomSkillFromScene,
  skillCapabilityLabel,
  type SkillHub,
  type SkillRef,
  type SkillSceneTemplate,
  type SkillTemplateRef,
} from '../services/agent/skillHub';

type SkillHubPanelProps = {
  activeProvider: AgentProvider;
  activeWorkspaceRoot?: string;
  hub: SkillHub;
  loadError?: string;
  onPickSkill: (skillName: string) => void;
  onInstallSkill: (prompt: string) => void;
  onSaveHub: (hub: SkillHub) => Promise<void>;
  onReload: () => Promise<void>;
};

type SkillCard = {
  name: string;
  label: string;
  summary?: string;
  system: boolean;
  installed: boolean;
  path?: string;
  template?: SkillTemplateRef;
};

const SCENE_ICONS: Record<string, ComponentType<LucideProps>> = {
  CalendarDays, ClipboardList, Presentation, Globe, PenLine, BarChart3,
};

function normalizeKey(name: string): string {
  return name.trim().replace(/^\/+/u, '').toLowerCase();
}

function skillTitle(skill: SkillRef | SkillTemplateRef, local?: Skill): string {
  return 'label' in skill ? skill.label : local?.name ?? skill.name;
}

function skillSummary(skill: SkillRef | SkillTemplateRef, local?: Skill): string | undefined {
  return 'summary' in skill ? skill.summary : skill.description ?? local?.description;
}

/** 简易 GitHub 图标（inline SVG），lucide 无品牌图标 */
function GitHubIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 98 96" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.362 19.412-6.518 33.405-24.934 33.405-46.691C97.707 22 75.788 0 48.854 0z" />
    </svg>
  );
}

function openSourceUrl(url: string) {
  void openUrl(url).catch((error) => {
    console.warn('Failed to open skill source URL:', error);
    window.open(url, '_blank', 'noopener,noreferrer');
  });
}

function buildLocalMaps(localSkills: Skill[]) {
  const byName = new Map<string, Skill>();
  const byPath = new Map<string, Skill>();
  for (const skill of localSkills) {
    byName.set(normalizeKey(skill.name), skill);
    byPath.set(skill.path.replace(/\//g, '\\').toLowerCase(), skill);
  }
  return { byName, byPath };
}

function resolveSystemLocal(skill: SkillTemplateRef, localSkills: Skill[]) {
  const { byName, byPath } = buildLocalMaps(localSkills);
  const bySkillName = byName.get(normalizeKey(skill.name));
  if (bySkillName) return bySkillName;
  if (!skill.expectedPath) return undefined;
  return byPath.get(skill.expectedPath.replace(/\//g, '\\').toLowerCase());
}

function AddSkillDialog({
  scene,
  hub,
  localSkills,
  activeProvider,
  capabilityLabel,
  saving,
  onClose,
  onSaveHub,
}: {
  scene: SkillSceneTemplate;
  hub: SkillHub;
  localSkills: Skill[];
  activeProvider: AgentProvider;
  capabilityLabel: string;
  saving: boolean;
  onClose: () => void;
  onSaveHub: (hub: SkillHub) => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [manualName, setManualName] = useState('');
  const [error, setError] = useState('');

  const existing = new Set([
    ...scene.skills.map((skill) => normalizeKey(skill.name)),
    ...(hub.sceneAdditions[scene.id] ?? []).map((skill) => normalizeKey(skill.name)),
  ]);
  const filtered = localSkills.filter((skill) => {
    const text = `${skill.name} ${skill.description ?? ''} ${skill.path}`.toLowerCase();
    return !query.trim() || text.includes(query.trim().toLowerCase());
  });

  const addSkill = async (skill: SkillRef) => {
    try {
      setError('');
      await onSaveHub(addSkillToScene(hub, scene.id, { ...skill, supportedProviders: [activeProvider] }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const addManual = async () => {
    const name = manualName.trim().replace(/^\/+/u, '');
    if (!name) return;
    await addSkill({ name, supportedProviders: [activeProvider] });
    setManualName('');
  };

  return (
    <div className="skill-hub-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="skill-hub-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header className="skill-hub-modal-header">
          <div>
            <strong>添加到 {scene.label}</strong>
            <span>从本机已安装 {capabilityLabel} 中选择</span>
          </div>
          <button type="button" onClick={onClose}>关闭</button>
        </header>
        <label className="skill-hub-search">
          <Search size={14} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索名称、路径或说明"
          />
        </label>
        <div className="skill-hub-local-list">
          {filtered.length === 0 ? (
            <p className="skill-hub-category-empty">没有匹配的本机 {capabilityLabel}。</p>
          ) : filtered.map((skill) => {
            const added = existing.has(normalizeKey(skill.name));
            return (
              <button
                type="button"
                key={skill.path}
                className="skill-hub-local-item"
                disabled={added || saving}
                onClick={() => void addSkill({ name: skill.name, description: skill.description })}
                title={skill.path}
              >
                <span>
                  <strong>/{skill.name}</strong>
                  {skill.description && <em>{skill.description}</em>}
                  <small>{skill.path}</small>
                </span>
                {added ? <Check size={14} /> : <Plus size={14} />}
              </button>
            );
          })}
        </div>
        <div className="skill-hub-manual-add">
          <input
            value={manualName}
            onChange={(event) => setManualName(event.target.value)}
            placeholder={`手动输入 ${capabilityLabel} 名称`}
          />
          <button type="button" disabled={!manualName.trim() || saving} onClick={() => void addManual()}>
            添加
          </button>
        </div>
        {error && <div className="skill-hub-error" role="alert">{error}</div>}
      </div>
    </div>
  );
}

export function SkillHubPanel({
  activeProvider,
  activeWorkspaceRoot,
  hub,
  loadError,
  onPickSkill,
  onInstallSkill,
  onSaveHub,
  onReload,
}: SkillHubPanelProps) {
  const [localSkills, setLocalSkills] = useState<Skill[]>([]);
  const [scanError, setScanError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [selectedSceneId, setSelectedSceneId] = useState<SkillSceneTemplate['id'] | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reloading, setReloading] = useState(false);
  const systemScenes = useMemo(() => getSystemSkillScenesForProvider(activeProvider), [activeProvider]);
  const capabilityLabel = skillCapabilityLabel(activeProvider);
  const installActionLabel = activeProvider === 'opencode' ? '让 OpenCode 配置' : '让 Claude 安装';

  const scanLocal = useCallback(async () => {
    setScanning(true);
    try {
      setLocalSkills(await listLocalSkills(activeProvider, activeWorkspaceRoot));
      setScanError('');
    } catch (error) {
      setScanError(error instanceof Error ? error.message : String(error));
    } finally {
      setScanning(false);
    }
  }, [activeProvider, activeWorkspaceRoot]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void scanLocal();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [scanLocal]);

  const reloadAll = async () => {
    setReloading(true);
    try {
      await Promise.all([onReload(), scanLocal()]);
    } finally {
      setReloading(false);
    }
  };

  const selectedScene = systemScenes.find((scene) => scene.id === selectedSceneId) ?? null;
  const cards = useMemo<SkillCard[]>(() => {
    if (!selectedScene) return [];
    const custom = getSceneAdditionsForProvider(hub, selectedScene.id, activeProvider);
    return [
      ...selectedScene.skills.map((skill) => {
        const local = resolveSystemLocal(skill, localSkills);
        return {
          name: skill.name,
          label: skillTitle(skill, local),
          summary: skillSummary(skill, local),
          system: true,
          installed: Boolean(local),
          path: local?.path ?? skill.expectedPath,
          template: skill,
        };
      }),
      ...custom.map((skill) => {
        const local = localSkills.find((entry) => normalizeKey(entry.name) === normalizeKey(skill.name));
        return {
          name: skill.name,
          label: skillTitle(skill, local),
          summary: skillSummary(skill, local),
          system: false,
          installed: Boolean(local),
          path: local?.path,
        };
      }),
    ];
  }, [activeProvider, hub, localSkills, selectedScene]);

  const saveHub = async (nextHub: SkillHub) => {
    setSaving(true);
    try {
      await onSaveHub(nextHub);
    } finally {
      setSaving(false);
    }
  };

  const removeCustomSkill = async (sceneId: string, skillName: string) => {
    await saveHub(removeCustomSkillFromScene(hub, sceneId, skillName));
  };

  const installedCount = cards.filter((card) => card.installed).length;

  return (
    <div className="skill-hub-panel">
      <div className="skill-hub-header">
        <strong>
          <Sparkles size={12} />
          <span>{selectedScene ? selectedScene.label : '场景模板'}</span>
        </strong>
        <button
          type="button"
          className="skill-hub-reload"
          disabled={reloading || scanning}
          onClick={() => void reloadAll()}
          title={`重新加载 skill-hub.json 和本机 ${capabilityLabel}`}
          aria-label={`重新加载 skill-hub.json 和本机 ${capabilityLabel}`}
        >
          <RefreshCw size={11} />
        </button>
      </div>
      {loadError && (
        <div className="skill-hub-error" role="alert">
          skill-hub.json 加载失败：{loadError}
        </div>
      )}
      {scanError && (
        <div className="skill-hub-error" role="alert">
          本地 {capabilityLabel} 扫描失败：{scanError}
        </div>
      )}
      {!selectedScene ? (
        <div className="skill-hub-scene-list">
          {systemScenes.map((scene) => {
            const customCount = getSceneAdditionsForProvider(hub, scene.id, activeProvider).length;
            const total = scene.skills.length + customCount;
            const Icon = SCENE_ICONS[scene.icon] ?? Sparkles;
            return (
              <button
                type="button"
                key={scene.id}
                className="skill-hub-scene-card"
                style={{ '--scene-accent': scene.accent } as React.CSSProperties}
                onClick={() => setSelectedSceneId(scene.id)}
              >
                <span className="skill-hub-scene-icon" aria-hidden>
                  <Icon size={18} strokeWidth={2} />
                </span>
                <span className="skill-hub-scene-body">
                  <strong className="skill-hub-scene-title">{scene.label}</strong>
                  <em className="skill-hub-scene-desc">{scene.description}</em>
                  <span className="skill-hub-scene-count">
                    {total > 0 ? `${total} 个 ${capabilityLabel}` : `待添加 ${capabilityLabel}`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <>
          <div className="skill-hub-scene-toolbar">
            <button type="button" onClick={() => setSelectedSceneId(null)}>
              <ArrowLeft size={13} /> 返回
            </button>
            <button type="button" onClick={() => setAddDialogOpen(true)}>
              <Plus size={13} /> 添加 {capabilityLabel}
            </button>
          </div>
          {cards.length === 0 ? (
            <div className="skill-hub-empty">
              <p>该场景还没有预置 {capabilityLabel}。</p>
              <p className="skill-hub-hint">点击右上角添加本机已有 {capabilityLabel}。</p>
            </div>
          ) : (
            <ul className="skill-hub-items">
              {cards.map((skill) => {
                const sourceUrl = skill.template?.installSource;
                return (
                <li key={`${skill.system ? 'system' : 'custom'}-${skill.name}`}>
                  <div className={`skill-hub-item ${skill.installed ? '' : 'is-disabled'}`}>
                    <button
                      type="button"
                      className="skill-hub-item-main"
                      onClick={() => {
                        if (skill.installed) onPickSkill(skill.name);
                        else if (skill.template) onInstallSkill(buildSkillInstallPrompt(skill.template, activeProvider));
                      }}
                      title={skill.path ? `${skill.name} — ${skill.path}` : skill.name}
                    >
                      <span className="skill-hub-item-topline">
                        <span className="skill-hub-item-name">
                          /{skill.name}
                          {sourceUrl && (
                            <button
                              type="button"
                              className="skill-hub-item-source"
                              title={`来源：${sourceUrl}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                openSourceUrl(sourceUrl);
                              }}
                            >
                              <GitHubIcon size={12} />
                            </button>
                          )}
                          {skill.system && !sourceUrl && (
                            <span className="skill-hub-item-no-source" title="缺少 GitHub 来源 URL">
                              <TriangleAlert size={10} />
                            </span>
                          )}
                        </span>
                      </span>
                      <strong>{skill.label}</strong>
                      {skill.summary && <span className="skill-hub-item-desc">{skill.summary}</span>}
                    </button>
                    <div className="skill-hub-item-actions">
                      {skill.system ? (
                        !skill.installed && (
                          <button type="button" onClick={() => skill.template && onInstallSkill(buildSkillInstallPrompt(skill.template, activeProvider))}>
                            {installActionLabel}
                          </button>
                        )
                      ) : (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void removeCustomSkill(selectedScene.id, skill.name)}
                          title="移除自定义 skill"
                          aria-label="移除自定义 skill"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                      <span className={`skill-hub-badge ${skill.installed ? 'installed' : 'missing'}`}>
                        {skill.installed ? '已安装' : '未安装'}
                      </span>
                    </div>
                  </div>
                </li>
                );
              })}
            </ul>
          )}
        </>
      )}
      <div className="skill-hub-footer">
        <span>{selectedScene ? `${installedCount}/${cards.length} 可用` : `${systemScenes.length} 个场景`}</span>
        {(scanning || reloading) && <span className="skill-hub-footer-meta">扫描中…</span>}
      </div>
      {selectedScene && addDialogOpen && (
        <AddSkillDialog
          scene={selectedScene}
          hub={hub}
          localSkills={localSkills}
          activeProvider={activeProvider}
          capabilityLabel={capabilityLabel}
          saving={saving}
          onClose={() => setAddDialogOpen(false)}
          onSaveHub={saveHub}
        />
      )}
    </div>
  );
}
