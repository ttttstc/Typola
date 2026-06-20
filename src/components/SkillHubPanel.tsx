import { useEffect, useMemo, useState, type ComponentType } from 'react';
import {
  ArrowLeft, BarChart3, CalendarDays, Check, ClipboardList, Globe, PenLine,
  Plus, Presentation, RefreshCw, Search, Sparkles, Trash2, type LucideProps,
} from 'lucide-react';
import { listLocalSkills, type Skill } from '../services/agent/skillScanner';
import {
  addSkillToScene,
  buildSkillInstallPrompt,
  removeCustomSkillFromScene,
  SYSTEM_SKILL_SCENES,
  type SkillHub,
  type SkillRef,
  type SkillSceneTemplate,
  type SkillTemplateRef,
} from '../services/agent/skillHub';

type SkillHubPanelProps = {
  hub: SkillHub;
  loadError?: string;
  onPickSkill: (skillName: string) => void;
  onInstallSkill: (prompt: string) => void;
  onSaveHub: (hub: SkillHub) => Promise<void>;
  onReload: () => void;
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
  saving,
  onClose,
  onSaveHub,
}: {
  scene: SkillSceneTemplate;
  hub: SkillHub;
  localSkills: Skill[];
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
      await onSaveHub(addSkillToScene(hub, scene.id, skill));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const addManual = async () => {
    const name = manualName.trim().replace(/^\/+/u, '');
    if (!name) return;
    await addSkill({ name });
    setManualName('');
  };

  return (
    <div className="skill-hub-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="skill-hub-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header className="skill-hub-modal-header">
          <div>
            <strong>添加到 {scene.label}</strong>
            <span>从本机已安装 skill 中选择</span>
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
            <p className="skill-hub-category-empty">没有匹配的本机 skill。</p>
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
            placeholder="手动输入 skill 名称"
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

  const scanLocal = async () => {
    setScanning(true);
    try {
      setLocalSkills(await listLocalSkills());
      setScanError('');
    } catch (error) {
      setScanError(error instanceof Error ? error.message : String(error));
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    void scanLocal();
  }, []);

  const selectedScene = SYSTEM_SKILL_SCENES.find((scene) => scene.id === selectedSceneId) ?? null;
  const cards = useMemo<SkillCard[]>(() => {
    if (!selectedScene) return [];
    const custom = hub.sceneAdditions[selectedScene.id] ?? [];
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
  }, [hub.sceneAdditions, localSkills, selectedScene]);

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
          onClick={() => {
            onReload();
            void scanLocal();
          }}
          title="重新加载 skill-hub.json 和本机 skill"
          aria-label="重新加载 skill-hub.json 和本机 skill"
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
          本地 skill 扫描失败：{scanError}
        </div>
      )}
      {!selectedScene ? (
        <div className="skill-hub-scene-list">
          {SYSTEM_SKILL_SCENES.map((scene) => {
            const customCount = hub.sceneAdditions[scene.id]?.length ?? 0;
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
                    {total > 0 ? `${total} 个 skill` : '待添加 skill'}
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
              <Plus size={13} /> 添加 skill
            </button>
          </div>
          {cards.length === 0 ? (
            <div className="skill-hub-empty">
              <p>该场景还没有预置 skill。</p>
              <p className="skill-hub-hint">点击右上角添加本机已有 skill。</p>
            </div>
          ) : (
            <ul className="skill-hub-items">
              {cards.map((skill) => (
                <li key={`${skill.system ? 'system' : 'custom'}-${skill.name}`}>
                  <div className={`skill-hub-item ${skill.installed ? '' : 'is-disabled'}`}>
                    <button
                      type="button"
                      className="skill-hub-item-main"
                      onClick={() => {
                        if (skill.installed) onPickSkill(skill.name);
                        else if (skill.template) onInstallSkill(buildSkillInstallPrompt(skill.template));
                      }}
                      title={skill.path ? `${skill.name} — ${skill.path}` : skill.name}
                    >
                      <span className="skill-hub-item-topline">
                        <span className="skill-hub-item-name">/{skill.name}</span>
                        <span className={`skill-hub-badge ${skill.installed ? 'installed' : 'missing'}`}>
                          {skill.installed ? '已安装' : '未安装'}
                        </span>
                      </span>
                      <strong>{skill.label}</strong>
                      {skill.summary && <span className="skill-hub-item-desc">{skill.summary}</span>}
                    </button>
                    <div className="skill-hub-item-actions">
                      {skill.system ? (
                        !skill.installed && (
                          <button type="button" onClick={() => skill.template && onInstallSkill(buildSkillInstallPrompt(skill.template))}>
                            让 Claude 安装
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
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <div className="skill-hub-footer">
        <span>{selectedScene ? `${installedCount}/${cards.length} 可用` : `${SYSTEM_SKILL_SCENES.length} 个场景`}</span>
        {scanning && <span className="skill-hub-footer-meta">扫描中…</span>}
      </div>
      {selectedScene && addDialogOpen && (
        <AddSkillDialog
          scene={selectedScene}
          hub={hub}
          localSkills={localSkills}
          saving={saving}
          onClose={() => setAddDialogOpen(false)}
          onSaveHub={saveHub}
        />
      )}
    </div>
  );
}
