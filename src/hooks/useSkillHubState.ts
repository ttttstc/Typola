import { useCallback, useEffect, useState } from 'react';
import { EMPTY_SKILL_HUB, loadSkillHub, migrateFlowScenariosIfStale, saveSkillHub, type SkillHub } from '../services/agent/skillHub';

type UseSkillHubStateResult = {
  skillHub: SkillHub;
  skillHubError?: string;
  /** @deprecated Prefer awaiting handleReloadSkillHub; kept for old reload-key callers. */
  skillHubReloadKey: number;
  handleSaveSkillHub: (hub: SkillHub) => Promise<void>;
  handleReloadSkillHub: () => Promise<void>;
};

/**
 * Loads SkillHub categories and keeps the one-time legacy migration in one place.
 */
export function useSkillHubState(): UseSkillHubStateResult {
  const [skillHub, setSkillHub] = useState<SkillHub>(EMPTY_SKILL_HUB);
  const [skillHubError, setSkillHubError] = useState<string | undefined>(undefined);
  const [skillHubReloadKey, setSkillHubReloadKey] = useState(0);

  const reloadSkillHub = useCallback(async () => {
    const result = await loadSkillHub();
    setSkillHub(result.hub);
    setSkillHubError(result.error);
    setSkillHubReloadKey((key) => key + 1);
  }, []);

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
      setSkillHubReloadKey((key) => key + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleReloadSkillHub = useCallback(() => {
    return reloadSkillHub();
  }, [reloadSkillHub]);

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
