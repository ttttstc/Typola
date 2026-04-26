import { app, safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import {
  AIProvider,
  AIProviderSetupInput,
  AISettingsSummary,
  LLMError,
  OpenAICompatiblePreset,
  ResolvedAISettings,
  StoredAISettings,
  getDefaultAISettings,
  getProviderLabel,
  normalizeOpenAICompatibleConfig,
} from '../src/llm/types';

const AI_CONFIG_PATH = () => path.join(app.getPath('userData'), 'ai-settings.json');

function ensureParentDir() {
  fs.mkdirSync(path.dirname(AI_CONFIG_PATH()), { recursive: true });
}

function encryptApiKey(apiKey: string) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new LLMError('unknown', 'safeStorage is not available.');
  }

  return safeStorage.encryptString(apiKey).toString('base64');
}

function decryptApiKey(apiKeyEncrypted: string) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new LLMError('unknown', 'safeStorage is not available.');
  }

  return safeStorage.decryptString(Buffer.from(apiKeyEncrypted, 'base64'));
}

export function readStoredAISettings(): StoredAISettings | null {
  try {
    if (!fs.existsSync(AI_CONFIG_PATH())) {
      return null;
    }

    return JSON.parse(fs.readFileSync(AI_CONFIG_PATH(), 'utf-8')) as StoredAISettings;
  } catch {
    return null;
  }
}

export function getAISettingsSummary(provider?: AIProvider): AISettingsSummary {
  const stored = readStoredAISettings();
  if (!stored) {
    return getDefaultAISettings(provider);
  }

  if (stored.provider === 'anthropic') {
    return {
      provider: 'anthropic',
      model: stored.model,
      requestTimeoutMs: stored.requestTimeoutMs,
      configured: true,
      hasApiKey: Boolean(stored.apiKeyEncrypted),
      providerLabel: 'Anthropic',
      updatedAt: stored.updatedAt,
    };
  }

  const normalized = normalizeOpenAICompatibleConfig(stored.preset, {
    baseUrl: stored.baseUrl,
    model: stored.model,
  });

  return {
    provider: 'openai-compatible',
    model: normalized.model,
    baseUrl: normalized.baseUrl,
    preset: stored.preset,
    requestTimeoutMs: stored.requestTimeoutMs,
    configured: true,
    hasApiKey: Boolean(stored.apiKeyEncrypted),
    providerLabel: getProviderLabel(stored),
    updatedAt: stored.updatedAt,
  };
}

export function saveAISettings(input: AIProviderSetupInput) {
  const existing = readStoredAISettings();
  const apiKey = input.apiKey.trim();
  const apiKeyEncrypted =
    apiKey.length > 0
      ? encryptApiKey(apiKey)
      : existing && existing.provider === input.provider
        ? existing.apiKeyEncrypted
        : null;

  if (!apiKeyEncrypted) {
    throw new LLMError('missing_api_key', 'API key is missing.', {
      provider: input.provider,
    });
  }

  const common = {
    model: input.model.trim(),
    apiKeyEncrypted,
    requestTimeoutMs: input.requestTimeoutMs ?? 30000,
    updatedAt: Date.now(),
  };

  if (!common.model) {
    throw new LLMError('invalid_request', 'Model is required.', {
      provider: input.provider,
    });
  }

  let stored: StoredAISettings;
  if (input.provider === 'anthropic') {
    stored = {
      provider: 'anthropic',
      ...common,
    };
  } else {
    const normalized = normalizeOpenAICompatibleConfig(input.preset, {
      baseUrl: input.baseUrl.trim(),
      model: common.model,
    });
    const baseUrl = normalized.baseUrl;
    if (!baseUrl) {
      throw new LLMError('invalid_request', 'Base URL is required.', {
        provider: input.provider,
      });
    }

    stored = {
      provider: 'openai-compatible',
      ...common,
      model: normalized.model,
      baseUrl,
      preset: input.preset,
    };
  }

  ensureParentDir();
  fs.writeFileSync(AI_CONFIG_PATH(), JSON.stringify(stored, null, 2), 'utf-8');
  return getAISettingsSummary(stored.provider);
}

export function clearAISettings() {
  if (fs.existsSync(AI_CONFIG_PATH())) {
    fs.unlinkSync(AI_CONFIG_PATH());
  }
}

export function getResolvedAISettings(): ResolvedAISettings {
  const stored = readStoredAISettings();
  if (!stored) {
    throw new LLMError('missing_api_key', 'AI settings are not configured.');
  }

  if (stored.provider === 'anthropic') {
    return {
      provider: 'anthropic',
      model: stored.model,
      apiKey: decryptApiKey(stored.apiKeyEncrypted),
      requestTimeoutMs: stored.requestTimeoutMs,
    };
  }

  const normalized = normalizeOpenAICompatibleConfig(stored.preset, {
    baseUrl: stored.baseUrl,
    model: stored.model,
  });

  return {
    provider: 'openai-compatible',
    model: normalized.model,
    apiKey: decryptApiKey(stored.apiKeyEncrypted),
    baseUrl: normalized.baseUrl,
    preset: stored.preset as OpenAICompatiblePreset,
    requestTimeoutMs: stored.requestTimeoutMs,
  };
}
