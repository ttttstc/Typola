import {
  GenerateTextRequest,
  GenerateTextResponse,
  LLMError,
  ResolvedAnthropicSettings,
  StreamChunk,
  mapHttpStatusToErrorCode,
} from './types';

const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';

interface AnthropicMessageContent {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

interface AnthropicMessageResponse {
  content?: AnthropicMessageContent[];
  stop_reason?: string;
}

export class AnthropicAdapter {
  private readonly settings: ResolvedAnthropicSettings;

  constructor(settings: ResolvedAnthropicSettings) {
    this.settings = settings;
  }

  async generateText(request: GenerateTextRequest): Promise<GenerateTextResponse> {
    const response = await this.requestJson<AnthropicMessageResponse>(request, false);
    const content = response.content ?? [];
    const text = content
      .filter((item) => item.type === 'text')
      .map((item) => item.text ?? '')
      .join('');
    const toolCalls = content
      .filter((item) => item.type === 'tool_use' && item.id && item.name)
      .map((item) => ({
        id: item.id as string,
        name: item.name as string,
        input: item.input ?? {},
      }));

    return {
      text,
      toolCalls,
      stopReason: response.stop_reason,
      raw: response,
    };
  }

  async *streamText(request: GenerateTextRequest): AsyncGenerator<StreamChunk, GenerateTextResponse, void> {
    const reader = await this.requestStream(request);
    const decoder = new TextDecoder();
    let buffer = '';
    let accumulatedText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() ?? '';

      for (const chunk of chunks) {
        const lines = chunk
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim())
          .filter((line) => line.length > 0 && line !== '[DONE]');

        for (const data of lines) {
          const event = JSON.parse(data) as {
            type?: string;
            delta?: { type?: string; text?: string };
          };

          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
            accumulatedText += event.delta.text;
            yield {
              type: 'text-delta',
              text: event.delta.text,
            };
          }
        }
      }
    }

    return {
      text: accumulatedText,
      toolCalls: [],
    };
  }

  async testConnection() {
    await this.generateText({
      model: this.settings.model,
      maxTokens: 8,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: 'Reply with OK.',
        },
      ],
    });
  }

  private buildBody(request: GenerateTextRequest, stream: boolean) {
    return {
      model: request.model,
      max_tokens: request.maxTokens ?? 1024,
      temperature: request.temperature ?? 0,
      stream,
      messages: request.messages
        .filter((message) => message.role !== 'tool')
        .map((message) => ({
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: message.content,
        })),
      tools: request.tools?.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema ?? {
          type: 'object',
          properties: {},
        },
      })),
    };
  }

  private async requestJson<T>(request: GenerateTextRequest, stream: boolean) {
    const response = await this.fetchMessages(request, stream);
    const text = await response.text();

    if (!response.ok) {
      throw new LLMError(mapHttpStatusToErrorCode(response.status, text), this.buildHttpMessage(response.status, text), {
        provider: 'anthropic',
        status: response.status,
      });
    }

    return JSON.parse(text) as T;
  }

  private async requestStream(request: GenerateTextRequest) {
    const response = await this.fetchMessages(request, true);
    const text = response.ok ? '' : await response.text();

    if (!response.ok) {
      throw new LLMError(mapHttpStatusToErrorCode(response.status, text), this.buildHttpMessage(response.status, text), {
        provider: 'anthropic',
        status: response.status,
      });
    }

    if (!response.body) {
      throw new LLMError('network', 'Streaming response body is empty.', {
        provider: 'anthropic',
      });
    }

    return response.body.getReader();
  }

  private async fetchMessages(request: GenerateTextRequest, stream: boolean) {
    const timeoutSignal = AbortSignal.timeout(request.signal ? this.settings.requestTimeoutMs : this.settings.requestTimeoutMs);
    const signal = request.signal ? AbortSignal.any([request.signal, timeoutSignal]) : timeoutSignal;

    try {
      return await fetch(`${ANTHROPIC_BASE_URL}/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.settings.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(this.buildBody(request, stream)),
        signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new LLMError('timeout', 'Request timed out.', {
          provider: 'anthropic',
        });
      }

      throw new LLMError('network', 'Network request failed.', {
        provider: 'anthropic',
      });
    }
  }

  private buildHttpMessage(status: number, bodyText: string) {
    const trimmedBody = bodyText.trim();
    return trimmedBody ? `HTTP ${status}. ${trimmedBody}` : `HTTP ${status}. Request failed.`;
  }
}
