import { useMemo, type ReactNode } from 'react';
import { PreviewPane } from '../PreviewPane';
import type { AgentMessage, AgentToolCall, AnchorStatus, SelectionAnchor } from '../../services/agent/types';
import { ThoughtCard } from './ThoughtCard';
import { ToolCard } from './ToolCard';
import { DoneBar } from './DoneBar';
import { ErrorRetryCard } from './ErrorRetryCard';
import { formatAbsoluteTime, formatRelativeTime } from '../../services/timeFormat';
import { saveFileDialog, messageDialog } from '../../services/dialogService';
import { QuestionFormCard } from './QuestionFormCard';
import { parseQuestionForms } from './questionForm';

type AssistantMessageProps = {
  message: Extract<AgentMessage, { role: 'assistant' }>;
  hasSelection?: boolean;
  selectionAnchor?: SelectionAnchor;
  onInsertText?: (text: string) => void;
  onReplaceSelection?: (text: string) => void;
  onReplaceAnchor?: (text: string, anchor: SelectionAnchor) => void;
  validateAnchor?: (anchor: SelectionAnchor) => AnchorStatus;
  submittedQuestionForms?: Record<string, string>;
  onSubmitQuestionForm?: (formId: string, text: string) => void;
};

function isAskUserQuestionTool(tool: AgentToolCall): boolean {
  return tool.name === 'AskUserQuestion' || tool.name === 'ask_user_question';
}

function isResearchTool(tool: AgentToolCall): boolean {
  return ['Read', 'read_file', 'Glob', 'list_files', 'Grep', 'WebFetch', 'web_fetch', 'WebSearch', 'web_search']
    .includes(tool.name);
}

function extractCodeBlocks(markdown: string): Array<{ lang: string; code: string }> {
  const blocks: Array<{ lang: string; code: string }> = [];
  const regex = /```([^\n`]*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(markdown)) !== null) {
    const code = match[2].trimEnd();
    if (code.trim()) blocks.push({ lang: match[1].trim(), code });
  }
  return blocks;
}

function extForLang(lang: string): string {
  const map: Record<string, string> = {
    html: '.html', htm: '.html',
    python: '.py', py: '.py',
    javascript: '.js', js: '.js',
    typescript: '.ts', ts: '.ts',
    css: '.css',
    json: '.json',
    markdown: '.md', md: '.md',
    rust: '.rs', rs: '.rs',
    go: '.go',
    bash: '.sh', sh: '.sh', shell: '.sh',
    sql: '.sql',
  };
  return map[lang.toLowerCase()] ?? '.txt';
}

async function handleSaveAs(lang: string, code: string) {
  const ext = extForLang(lang);
  const savedPath = await saveFileDialog(`snippet${ext}`);
  if (!savedPath) return;
  try {
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    await writeTextFile(savedPath, code);
    await messageDialog(`已保存：${savedPath}`, { title: '另存为' });
  } catch (error) {
    await messageDialog(`保存失败：${String(error)}`, { title: '另存为' });
  }
}

function MessageActions({
  text,
  hasSelection,
  selectionAnchor,
  onInsertText,
  onReplaceSelection,
  onReplaceAnchor,
  validateAnchor,
}: {
  text: string;
  hasSelection?: boolean;
  selectionAnchor?: SelectionAnchor;
  onInsertText?: (text: string) => void;
  onReplaceSelection?: (text: string) => void;
  onReplaceAnchor?: (text: string, anchor: SelectionAnchor) => void;
  validateAnchor?: (anchor: SelectionAnchor) => AnchorStatus;
}) {
  const copy = () => {
    void navigator.clipboard?.writeText(text).catch((error) => {
      console.warn('Failed to copy assistant text:', error);
    });
  };

  const anchorStatus: AnchorStatus | null = useMemo(() => {
    if (!selectionAnchor || !validateAnchor) return null;
    return validateAnchor(selectionAnchor);
  }, [selectionAnchor, validateAnchor]);

  // 优先用 anchor 替换；fallback 走当前选区
  const canReplaceAnchor = !!selectionAnchor && anchorStatus === 'valid' && !!onReplaceAnchor;
  const canReplaceSelection = !selectionAnchor && !!onReplaceSelection && hasSelection;
  const replaceDisabled = !(canReplaceAnchor || canReplaceSelection);
  const replaceTitle = anchorStatus === 'wrong-file'
    ? '原文档已切换，请回到原文档'
    : anchorStatus === 'stale'
      ? '原选区已变，请手动定位'
      : !hasSelection && !selectionAnchor
        ? '无选区时不可替换'
        : '';

  return (
    <div className="conversation-message-actions">
      <button type="button" onClick={copy}>复制</button>
      <button type="button" onClick={() => onInsertText?.(text)} disabled={!onInsertText}>插入光标处</button>
      <button
        type="button"
        onClick={() => {
          if (canReplaceAnchor && selectionAnchor) onReplaceAnchor?.(text, selectionAnchor);
          else if (canReplaceSelection) onReplaceSelection?.(text);
        }}
        disabled={replaceDisabled}
        title={replaceTitle}
      >
        替换选区
      </button>
    </div>
  );
}

export function AssistantMessage({
  message,
  hasSelection = false,
  selectionAnchor,
  onInsertText,
  onReplaceSelection,
  onReplaceAnchor,
  validateAnchor,
  submittedQuestionForms = {},
  onSubmitQuestionForm,
}: AssistantMessageProps) {
  const codeBlocks = extractCodeBlocks(message.content);
  const parsed = useMemo(() => parseQuestionForms(message.content), [message.content]);
  const questionTools = message.tools.filter(isAskUserQuestionTool);
  const researchTools = message.tools.filter((tool) => !isAskUserQuestionTool(tool) && isResearchTool(tool));
  const otherTools = message.tools.filter((tool) => !isAskUserQuestionTool(tool) && !isResearchTool(tool));
  const renderTool = (tool: AgentToolCall) => (
    <ToolCard
      key={tool.id}
      tool={tool}
      message={message}
      submittedText={submittedQuestionForms[`tool:${tool.id}`]}
      onSubmitQuestionForm={(text) => onSubmitQuestionForm?.(`tool:${tool.id}`, text)}
    />
  );
  return (
    <article className="conversation-message assistant">
      <span className="conversation-time" title={formatAbsoluteTime(message.createdAt)}>
        {formatRelativeTime(message.createdAt)}
      </span>
      <ThoughtCard text={message.thinking} done={message.done ?? false} />
      {message.content ? (
        <>
          {parsed.markdown && (
            <div className="conversation-assistant-markdown">
              <PreviewPane source={parsed.markdown} tocIds={[]} />
            </div>
          )}
          {parsed.forms.map((form) => (
            <QuestionFormCard
              key={form.id}
              form={form}
              submittedText={submittedQuestionForms[form.id]}
              onSubmit={(text) => onSubmitQuestionForm?.(form.id, text)}
            />
          ))}
          {message.done && (
            <MessageActions
              text={message.content}
              hasSelection={hasSelection}
              selectionAnchor={selectionAnchor}
              onInsertText={onInsertText}
              onReplaceSelection={onReplaceSelection}
              onReplaceAnchor={onReplaceAnchor}
              validateAnchor={validateAnchor}
            />
          )}
          {codeBlocks.length > 0 && (
            <div className="conversation-code-actions">
              {codeBlocks.map((block, index) => (
                <div key={`${block.lang}-${index}`} className="conversation-code-action-row">
                  <span>{block.lang || 'code'} #{index + 1}</span>
                  {message.done && (
                    <>
                      <MessageActions
                        text={block.code}
                        hasSelection={hasSelection}
                        selectionAnchor={selectionAnchor}
                      onInsertText={onInsertText}
                      onReplaceSelection={onReplaceSelection}
                      onReplaceAnchor={onReplaceAnchor}
                      validateAnchor={validateAnchor}
                    />
                      <button
                        type="button"
                        className="conversation-code-save"
                        onClick={() => void handleSaveAs(block.lang, block.code)}
                      >
                        另存为
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        !message.error && message.tools.length === 0 && <p className="conversation-muted">AI Provider 正在思考...</p>
      )}
      {questionTools.map(renderTool)}
      <ResearchToolGroup tools={researchTools} message={message} renderTool={renderTool} />
      {otherTools.map(renderTool)}
      <ErrorRetryCard message={message.error ?? ''} />
      <DoneBar usage={message.usage} />
    </article>
  );
}

function ResearchToolGroup({
  tools,
  message,
  renderTool,
}: {
  tools: AgentToolCall[];
  message: Extract<AgentMessage, { role: 'assistant' }>;
  renderTool: (tool: AgentToolCall) => ReactNode;
}) {
  if (tools.length === 0) return null;
  if (tools.length <= 2) return <>{tools.map(renderTool)}</>;
  const summary = summarizeToolNames(tools);
  return (
    <details className="conversation-tool-group" open={!message.done} key={message.done ? 'done' : 'running'}>
      <summary>
        <span>资料检索与读取</span>
        <small>{tools.length} 个工具调用 · {summary}</small>
      </summary>
      <div className="conversation-tool-group-scroll">
        {tools.map(renderTool)}
      </div>
    </details>
  );
}

function summarizeToolNames(tools: AgentToolCall[]): string {
  const counts = new Map<string, number>();
  for (const tool of tools) {
    const label = normalizeToolLabel(tool.name);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, count]) => `${name}×${count}`)
    .join(' / ');
}

function normalizeToolLabel(name: string): string {
  if (name === 'Read' || name === 'read_file') return 'Read';
  if (name === 'Glob' || name === 'list_files') return 'Glob';
  if (name === 'Grep') return 'Grep';
  if (name === 'WebFetch' || name === 'web_fetch') return 'Fetch';
  if (name === 'WebSearch' || name === 'web_search') return 'Search';
  return name;
}
