import { invoke } from '@tauri-apps/api/core';
import type { AgentProvider } from './provider';

export type SkillSource = 'claude' | 'opencode';

export type Skill = {
  name: string;
  description?: string;
  source: SkillSource;
  path: string;
};

export function listLocalSkills(provider: AgentProvider, workspaceRoot?: string): Promise<Skill[]> {
  return invoke<Skill[]>('list_local_skills', { provider, workspaceRoot });
}

export function readSkillHub(): Promise<string> {
  return invoke<string>('read_skill_hub');
}

export function writeSkillHub(content: string): Promise<void> {
  return invoke<void>('write_skill_hub', { content });
}
