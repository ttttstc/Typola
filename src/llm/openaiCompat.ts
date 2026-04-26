import {
  GenerateTextRequest,
  GenerateTextResponse,
  LLMError,
  ResolvedOpenAICompatibleSettings,
  StreamChunk,
  mapHttpStatusToErrorCode,
} from './types';

interface OpenAICompatResponse {
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
  }>;
}

export class OpenAICompatibleAdapter {
  private readonly settings: ResolvedOpenAICompatibleSettings;

  constructor(settings: ResolvedOpenAICompatibleSettings) {
    this.settings = settings;
  }

  async generateText(request: GenerateTextRequest): Promise<GenerateTextResponse> {
    const response = await this.requestJson<OpenAICompatResponse>(request, false);
    const choice = response.choices?.[0];
    const toolCalls =
      choice?.message?.tool_calls?.map((toolCall) => ({
        id: toolCall.id ?? crypto.randomUUID(),
        name: toolCall.function?.name ?? 'tool',
        input: this.parseToolArguments(toolCall.function?.arguments),
      })) ?? [];

    return {
      text: choice?.message?.content ?? '',
      toolCalls,
      stopReason: choice?.finish_reason,
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
            choices?: Array<{
              delta?: {
                content?: string;
              };
            }>;
          };
          const deltaText = event.choices?.[0]?.delta?.content;
          if (deltaText) {
            accumulatedText += deltaText;
            yield {
              type: 'text-delta',
              text: deltaText,
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
      messages: request.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      stream,
      temperature: request.temperature ?? 0,
      max_tokens: request.maxTokens ?? 1024,
      tools: request.tools?.map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema ?? {
            type: 'object',
            properties: {},
          },
        },
      })),
    };
  }

  private async requestJson<T>(request: GenerateTextRequest, stream: boolean) {
    const response = await this.fetchChatCompletions(request, stream);
    const text = await response.text();

    if (!response.ok) {
      throw new LLMError(mapHttpStatusToErrorCode(response.status, text), this.buildHttpMessage(response.status, text), {
        provider: 'openai-compatible',
        status: response.status,
      });
    }

    return JSON.parse(text) as T;
  }

  private async requestStream(request: GenerateTextRequest) {
    const response = await this.fetchChatCompletions(request, true);
    const text = response.ok ? '' : await response.text();

    if (!response.ok) {
      throw new LLMError(mapHttpStatusToErrorCode(response.status, text), this.buildHttpMessage(response.status, text), {
        provider: 'openai-compatible',
        status: response.status,
      });
    }

    if (!response.body) {
      throw new LLMError('network', 'Streaming response body is empty.', {
        provider: 'openai-compatible',
      });
    }

    return response.body.getReader();
  }

  private async fetchChatCompletions(request: GenerateTextRequest, stream: boolean) {
    const timeoutSignal = AbortSignal.timeout(this.settings.requestTimeoutMs);
    const signal = request.signal ? AbortSignal.any([request.signal, timeoutSignal]) : timeoutSignal;
    const baseUrl = this.settings.baseUrl.replace(/\/$/, '');

    try {
      return await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.settings.apiKey}`,
        },
        body: JSON.stringify(this.buildBody(request, stream)),
        signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new LLMError('timeout', 'Request timed out.', {
          provider: 'openai-compatible',
        });
      }

      throw new LLMError('network', 'Network request failed.', {
        provider: 'openai-compatible',
      });
    }
  }

  private buildHttpMessage(status: number, bodyText: string) {
    const trimmedBody = bodyText.trim();
    return trimmedBody ? `HTTP ${status}. ${trimmedBody}` : `HTTP ${status}. Request failed.`;
  }

  private parseToolArguments(argumentsText?: string) {
    if (!argumentsText) {
      return {};
    }

    try {
      return JSON.parse(argumentsText) as unknown;
    } catch {
      return {
        raw: argumentsText,
      };
    }
  }
}
