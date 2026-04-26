export type AIProvider = 'anthropic' | 'openai-compatible';
export type OpenAICompatiblePreset =
  | 'openai'
  | 'deepseek'
  | 'minimax'
  | 'glm'
  | 'kimi'
  | 'ollama'
  | 'custom';

export type AIRightClickAction = 'explain' | 'rewrite' | 'summarize' | 'translate';
export type LLMMessageRole = 'system' | 'user' | 'assistant' | 'tool';
export type LLMChunkType = 'text-delta' | 'tool-call' | 'done';
export type LLMErrorCode =
  | 'missing_api_key'
  | 'unauthorized'
  | 'forbidden'
  | 'rate_limited'
  | 'model_not_found'
  | 'network'
  | 'timeout'
  | 'invalid_request'
  | 'unknown';

export interface LLMMessage {
  role: LLMMessageRole;
  content: string;
  name?: string;
  toolCallId?: string;
}

export interface LLMTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface LLMToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface StreamChunk {
  type: LLMChunkType;
  text?: string;
  toolCall?: LLMToolCall;
}

export interface GenerateTextRequest {
  model: string;
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  tools?: LLMTool[];
  signal?: AbortSignal;
}

export interface GenerateTextResponse {
  text: string;
  toolCalls: LLMToolCall[];
  stopReason?: string;
  raw?: unknown;
}

interface BaseProviderInput {
  model: string;
  apiKey: string;
  requestTimeoutMs?: number;
}

export interface AnthropicProviderInput extends BaseProviderInput {
  provider: 'anthropic';
}

export interface OpenAICompatibleProviderInput extends BaseProviderInput {
  provider: 'openai-compatible';
  baseUrl: string;
  preset: OpenAICompatiblePreset;
}

export type AIProviderSetupInput = AnthropicProviderInput | OpenAICompatibleProviderInput;

export interface StoredAnthropicSettings {
  provider: 'anthropic';
  model: string;
  apiKeyEncrypted: string;
  requestTimeoutMs: number;
  updatedAt: number;
}

export interface StoredOpenAICompatibleSettings {
  provider: 'openai-compatible';
  model: string;
  apiKeyEncrypted: string;
  baseUrl: string;
  preset: OpenAICompatiblePreset;
  requestTimeoutMs: number;
  updatedAt: number;
}

export type StoredAISettings = StoredAnthropicSettings | StoredOpenAICompatibleSettings;

export interface ResolvedAnthropicSettings extends AnthropicProviderInput {
  requestTimeoutMs: number;
}

export interface ResolvedOpenAICompatibleSettings extends OpenAICompatibleProviderInput {
  requestTimeoutMs: number;
}

export type ResolvedAISettings = ResolvedAnthropicSettings | ResolvedOpenAICompatibleSettings;

export interface AISettingsSummaryBase {
  provider: AIProvider;
  model: string;
  requestTimeoutMs: number;
  configured: boolean;
  hasApiKey: boolean;
  providerLabel: string;
  updatedAt?: number;
}

export interface AnthropicSettingsSummary extends AISettingsSummaryBase {
  provider: 'anthropic';
}

export interface OpenAICompatibleSettingsSummary extends AISettingsSummaryBase {
  provider: 'openai-compatible';
  baseUrl: string;
  preset: OpenAICompatiblePreset;
}

export type AISettingsSummary = AnthropicSettingsSummary | OpenAICompatibleSettingsSummary;

export interface AIRightClickRequest {
  action: AIRightClickAction;
  text: string;
}

export interface AIRightClickResult {
  text: string;
  action: AIRightClickAction;
  providerLabel: string;
  model: string;
}

export interface LLMErrorPayload {
  code: LLMErrorCode;
  message: string;
  provider?: AIProvider;
  status?: number;
  retryable: boolean;
}

export type LLMOperationResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: LLMErrorPayload;
    };

export interface OpenAICompatPresetDefinition {
  id: OpenAICompatiblePreset;
  label: string;
  baseUrl: string;
  defaultModel: string;
}

const LEGACY_MINIMAX_BASE_URLS = [
  'https://api.minimaxi.chat/v1',
  'https://api.minimax.io/v1',
];
const LEGACY_MINIMAX_MODEL = 'MiniMax-Text-01';

export const ANTHROPIC_MODELS = [
  'claude-3-5-haiku-latest',
  'claude-3-7-sonnet-latest',
  'claude-sonnet-4-0',
] as const;

export const OPENAI_COMPAT_PRESETS: Record<
  Exclude<OpenAICompatiblePreset, 'custom'>,
  OpenAICompatPresetDefinition
> = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4.1-mini',
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
  },
  minimax: {
    id: 'minimax',
    label: 'MiniMax',
    baseUrl: 'https://api.minimaxi.com/v1',
    defaultModel: 'MiniMax-M2.7',
  },
  glm: {
    id: 'glm',
    label: 'GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
  },
  kimi: {
    id: 'kimi',
    label: 'Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama',
    baseUrl: 'http://127.0.0.1:11434/v1',
    defaultModel: 'qwen2.5:7b',
  },
};

export class LLMError extends Error {
  code: LLMErrorCode;
  provider?: AIProvider;
  status?: number;
  retryable: boolean;

  constructor(
    code: LLMErrorCode,
    message: string,
    options?: {
      provider?: AIProvider;
      status?: number;
      retryable?: boolean;
    }
  ) {
    super(message);
    this.name = 'LLMError';
    this.code = code;
    this.provider = options?.provider;
    this.status = options?.status;
    this.retryable =
      options?.retryable ?? (code === 'rate_limited' || code === 'network' || code === 'timeout');
  }
}

export function getProviderLabel(settings: { provider: AIProvider; preset?: OpenAICompatiblePreset }) {
  if (settings.provider === 'anthropic') {
    return 'Anthropic';
  }

  if (settings.preset && settings.preset !== 'custom' && settings.preset in OPENAI_COMPAT_PRESETS) {
    return OPENAI_COMPAT_PRESETS[settings.preset as Exclude<OpenAICompatiblePreset, 'custom'>].label;
  }

  return 'OpenAI Compatible';
}

export function getDefaultAISettings(provider: AIProvider = 'anthropic'): AISettingsSummary {
  if (provider === 'anthropic') {
    return {
      provider: 'anthropic',
      model: ANTHROPIC_MODELS[0],
      requestTimeoutMs: 30000,
      configured: false,
      hasApiKey: false,
      providerLabel: 'Anthropic',
    };
  }

  const preset = OPENAI_COMPAT_PRESETS.openai;
  return {
    provider: 'openai-compatible',
    model: preset.defaultModel,
    baseUrl: preset.baseUrl,
    preset: preset.id,
    requestTimeoutMs: 30000,
    configured: false,
    hasApiKey: false,
    providerLabel: preset.label,
  };
}

export function normalizeOpenAICompatibleConfig(
  preset: OpenAICompatiblePreset,
  config: {
    baseUrl: string;
    model: string;
  }
) {
  if (preset !== 'minimax') {
    return config;
  }

  return {
    baseUrl: LEGACY_MINIMAX_BASE_URLS.includes(config.baseUrl)
      ? OPENAI_COMPAT_PRESETS.minimax.baseUrl
      : config.baseUrl,
    model: config.model === LEGACY_MINIMAX_MODEL ? OPENAI_COMPAT_PRESETS.minimax.defaultModel : config.model,
  };
}

export function mapHttpStatusToErrorCode(status: number, bodyText = ''): LLMErrorCode {
  const normalizedBody = bodyText.toLowerCase();

  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 429) return 'rate_limited';
  if (status === 404 || normalizedBody.includes('model') && normalizedBody.includes('not found')) {
    return 'model_not_found';
  }
  if (status >= 400 && status < 500) return 'invalid_request';
  return 'unknown';
}

export function serializeLLMError(error: unknown): LLMErrorPayload {
  if (error instanceof LLMError) {
    return {
      code: error.code,
      message: error.message,
      provider: error.provider,
      status: error.status,
      retryable: error.retryable,
    };
  }

  if (error instanceof Error) {
    return {
      code: 'unknown',
      message: error.message,
      retryable: false,
    };
  }

  return {
    code: 'unknown',
    message: 'Unknown error.',
    retryable: false,
  };
}

export function getErrorMessage(error: LLMErrorPayload) {
  switch (error.code) {
    case 'missing_api_key':
      return 'API key is missing.';
    case 'unauthorized':
      return error.status ? `HTTP ${error.status}. API key is invalid.` : 'API key is invalid.';
    case 'forbidden':
      return error.status ? `HTTP ${error.status}. Request was denied.` : 'Request was denied.';
    case 'rate_limited':
      return error.status ? `HTTP ${error.status}. Rate limit exceeded.` : 'Rate limit exceeded.';
    case 'model_not_found':
      return error.status ? `HTTP ${error.status}. Model does not exist.` : 'Model does not exist.';
    case 'network':
      return 'Network request failed.';
    case 'timeout':
      return 'Request timed out.';
    case 'invalid_request':
      return error.status ? `HTTP ${error.status}. Request is invalid.` : 'Request is invalid.';
    default:
      return error.status ? `HTTP ${error.status}. Request failed.` : error.message;
  }
}
