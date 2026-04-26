import { create } from 'zustand';
import {
  AIRightClickAction,
  AIRightClickResult,
  AISettingsSummary,
  LLMOperationResult,
  getDefaultAISettings,
  getErrorMessage,
} from '../llm/types';
import type { SelectionSnapshot } from '../ai/selection';

export interface PendingAIAction {
  action: AIRightClickAction;
  selection: SelectionSnapshot;
}

export interface AIResultState {
  action: AIRightClickAction;
  selection: SelectionSnapshot;
  result: AIRightClickResult;
}

interface AIState {
  settings: AISettingsSummary;
  loading: boolean;
  running: boolean;
  lastError: string | null;
  lastSuccess: string | null;
  pendingAction: PendingAIAction | null;
  resultState: AIResultState | null;
  initialize: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  setSettings: (settings: AISettingsSummary) => void;
  setLastError: (message: string | null) => void;
  setLastSuccess: (message: string | null) => void;
  setPendingAction: (action: PendingAIAction | null) => void;
  clearPendingAction: () => void;
  setResultState: (result: AIResultState | null) => void;
  clearResultState: () => void;
  clearMessages: () => void;
  runAction: (
    action: AIRightClickAction,
    selection: SelectionSnapshot
  ) => Promise<LLMOperationResult<AIRightClickResult>>;
}

export const useAIStore = create<AIState>((set) => ({
  settings: getDefaultAISettings(),
  loading: false,
  running: false,
  lastError: null,
  lastSuccess: null,
  pendingAction: null,
  resultState: null,
  initialize: async () => {
    set({ loading: true });
    try {
      const settings = await window.electronAPI.getAISettings();
      set({
        settings,
        loading: false,
      });
    } catch {
      set({
        loading: false,
      });
    }
  },
  refreshSettings: async () => {
    try {
      const settings = await window.electronAPI.getAISettings();
      set({ settings });
    } catch {
      // Keep the last known summary if refresh fails.
    }
  },
  setSettings: (settings) =>
    set({
      settings,
    }),
  setLastError: (lastError) =>
    set({
      lastError,
    }),
  setLastSuccess: (lastSuccess) =>
    set({
      lastSuccess,
    }),
  setPendingAction: (pendingAction) =>
    set({
      pendingAction,
    }),
  clearPendingAction: () =>
    set({
      pendingAction: null,
    }),
  setResultState: (resultState) =>
    set({
      resultState,
    }),
  clearResultState: () =>
    set({
      resultState: null,
    }),
  clearMessages: () =>
    set({
      lastError: null,
      lastSuccess: null,
    }),
  runAction: async (action, selection) => {
    set({
      running: true,
      lastError: null,
      lastSuccess: null,
    });

    try {
      const result = await window.electronAPI.runAIAction({
        action,
        text: selection.text,
      });

      if (result.ok) {
        set({
          running: false,
          resultState: {
            action,
            selection,
            result: result.data,
          },
          lastSuccess: `${result.data.providerLabel} · ${result.data.model}`,
        });
      } else {
        set({
          running: false,
          lastError: getErrorMessage(result.error),
        });
      }

      return result;
    } catch (error) {
      set({
        running: false,
        lastError: error instanceof Error ? error.message : 'Unknown error.',
      });
      return {
        ok: false,
        error: {
          code: 'unknown',
          message: error instanceof Error ? error.message : 'Unknown error.',
          retryable: false,
        },
      };
    }
  },
}));
