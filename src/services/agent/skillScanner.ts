import { invoke } from '@tauri-apps/api/core';

export type SkillSource = 'local';

export type Skill = {
  name: string;
  description?: string;
  source: SkillSource;
  path: string;
};

export function listLocalSkills(): Promise<Skill[]> {
  return invoke<Skill[]>('list_local_skills');
}

export function readSkillHub(): Promise<string> {
  return invoke<string>('read_skill_hub');
}

export function writeSkillHub(content: string): Promise<void> {
  return invoke<void>('write_skill_hub', { content });
}