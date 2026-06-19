import { PreviewPane } from '../PreviewPane';
import type { AgentMessage } from '../../services/agent/types';
import { ThoughtCard } from './ThoughtCard';
import { ToolCard } from './ToolCard';
import { DoneBar } from './DoneBar';
import { ErrorRetryCard } from './ErrorRetryCard';

type AssistantMessageProps = {
  message: Extract<AgentMessage, { role: 'assistant' }>;
  hasSelection?: boolean;
  onInsertText?: (text: string) => void;
  onReplaceSelection?: (text: string) => void;
};

function extractCodeBlocks(markdown: string): Array<{ lang: string; code: string }> {
  const blocks: Array<{ lang: string; code: string }> = [];
  const regex = /```([^\n`]*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(markdown)) !== null) {
    blocks.push({ lang: match[1].trim(), code: match[2].trimEnd() });
  }
  return blocks;
}

function MessageActions({
  text,
  hasSelection,
  onInsertText,
  onReplaceSelection,
}: {
  text: string;
  hasSelection?: boolean;
  onInsertText?: (text: string) => void;
  onReplaceSelection?: (text: string) => void;
}) {
  const copy = () => {
    void navigator.clipboard?.writeText(text).catch((error) => {
      console.warn('Failed to copy assistant text:', error);
    });
  };

  return (
    <div className="conversation-message-actions">
      <button type="button" onClick={copy}>复制</button>
      <button type="button" onClick={() => onInsertText?.(text)} disabled={!onInsertText}>插入光标处</button>
      <button
        type="button"
        onClick={() => onReplaceSelection?.(text)}
        disabled={!onReplaceSelection || !hasSelection}
        title={hasSelection ? '替换当前选区' : '无选区时不可替换'}
      >
        替换选区
      </button>
    </div>
  );
}

export function AssistantMessage({
  message,
  hasSelection = false,
  onInsertText,
  onReplaceSelection,
}: AssistantMessageProps) {
  const codeBlocks = extractCodeBlocks(message.content);
  return (
    <article className="conversation-message assistant">
      <ThoughtCard text={message.thinking} />
      {message.content ? (
        <>
          <div className="conversation-assistant-markdown">
            <PreviewPane source={message.content} tocIds={[]} />
          </div>
          <MessageActions
            text={message.content}
            hasSelection={hasSelection}
            onInsertText={onInsertText}
            onReplaceSelection={onReplaceSelection}
          />
          {codeBlocks.length > 0 && (
            <div className="conversation-code-actions">
              {codeBlocks.map((block, index) => (
                <div key={`${block.lang}-${index}`} className="conversation-code-action-row">
                  <span>{block.lang || 'code'} #{index + 1}</span>
                  <MessageActions
                    text={block.code}
                    hasSelection={hasSelection}
                    onInsertText={onInsertText}
                    onReplaceSelection={onReplaceSelection}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        !message.error && message.tools.length === 0 && <p className="conversation-muted">Claude 正在思考...</p>
      )}
      {message.tools.map((tool) => <ToolCard key={tool.id} tool={tool} />)}
      <ErrorRetryCard message={message.error ?? ''} />
      <DoneBar usage={message.usage} />
    </article>
  );
}
