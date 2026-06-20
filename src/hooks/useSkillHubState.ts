import { useCallback, useEffect, useState } from 'react';
import { EMPTY_SKILL_HUB, loadSkillHub, migrateFlowScenariosIfStale, saveSkillHub, type SkillHub } from '../services/agent/skillHub';

type UseSkillHubStateResult = {
  skillHub: SkillHub;
  skillHubError?: string;
  skillHubReloadKey: number;
  handleSaveSkillHub: (hub: SkillHub) => Promise<void>;
  handleReloadSkillHub: () => void;
};

/**
 * Loads SkillHub categories and keeps the one-time legacy migration in one place.
 */
export function useSkillHubState(): UseSkillHubStateResult {
  const [skillHub, setSkillHub] = useState<SkillHub>(EMPTY_SKILL_HUB);
  const [skillHubError, setSkillHubError] = useState<string | undefined>(undefined);
  const [skillHubReloadKey, setSkillHubReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await migrateFlowScenariosIfStale();
      } catch (error) {
        console.warn('SkillHub 迁移失败:', error);
      }
      if (cancelled) return;
      const result = await loadSkillHub();
      if (cancelled) return;
      setSkillHub(result.hub);
      setSkillHubError(result.error);
    })();
    return () => {
      cancelled = true;
    };
  }, [skillHubReloadKey]);

  const handleReloadSkillHub = useCallback(() => {
    setSkillHubReloadKey((key) => key + 1);
  }, []);

  const handleSaveSkillHub = useCallback(async (hub: SkillHub) => {
    await saveSkillHub(hub);
    setSkillHub(hub);
    setSkillHubError(undefined);
  }, []);

  return {
    skillHub,
    skillHubError,
    skillHubReloadKey,
    handleSaveSkillHub,
    handleReloadSkillHub,
  };
}
