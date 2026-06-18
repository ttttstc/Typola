import { PreviewPane } from '../PreviewPane';
import type { AgentMessage } from '../../services/agent/types';
import { ThoughtCard } from './ThoughtCard';
import { ToolCard } from './ToolCard';
import { DoneBar } from './DoneBar';
import { ErrorRetryCard } from './ErrorRetryCard';

type AssistantMessageProps = {
  message: Extract<AgentMessage, { role: 'assistant' }>;
};

export function AssistantMessage({ message }: AssistantMessageProps) {
  return (
    <article className="conversation-message assistant">
      <ThoughtCard text={message.thinking} />
      {message.content ? (
        <div className="conversation-assistant-markdown">
          <PreviewPane source={message.content} tocIds={[]} />
        </div>
      ) : (
        !message.error && message.tools.length === 0 && <p className="conversation-muted">Claude 正在思考...</p>
      )}
      {message.tools.map((tool) => <ToolCard key={tool.id} tool={tool} />)}
      <ErrorRetryCard message={message.error ?? ''} />
      <DoneBar usage={message.usage} />
    </article>
  );
}
