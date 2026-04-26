import { AnthropicAdapter } from './anthropic';
import { OpenAICompatibleAdapter } from './openaiCompat';
import {
  GenerateTextRequest,
  GenerateTextResponse,
  ResolvedAISettings,
  StreamChunk,
} from './types';

type Adapter = AnthropicAdapter | OpenAICompatibleAdapter;

function getAdapter(settings: ResolvedAISettings): Adapter {
  if (settings.provider === 'anthropic') {
    return new AnthropicAdapter(settings);
  }

  return new OpenAICompatibleAdapter(settings);
}

export async function generateText(settings: ResolvedAISettings, request: GenerateTextRequest): Promise<GenerateTextResponse> {
  return getAdapter(settings).generateText(request);
}

export async function* streamText(
  settings: ResolvedAISettings,
  request: GenerateTextRequest
): AsyncGenerator<StreamChunk, GenerateTextResponse, void> {
  return yield* getAdapter(settings).streamText(request);
}

export async function testConnection(settings: ResolvedAISettings) {
  await getAdapter(settings).testConnection();
}
