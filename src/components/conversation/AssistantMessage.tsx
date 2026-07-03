import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { PreviewPane } from '../PreviewPane';
import type { AgentMessage, AgentToolCall } from '../../services/agent/types';
import { ThoughtCard } from './ThoughtCard';
import { ToolCard } from './ToolCard';
import { DoneBar } from './DoneBar';
import { ErrorRetryCard } from './ErrorRetryCard';
import { formatAbsoluteTime, formatRelativeTime } from '../../services/timeFormat';
import { saveFileDialog, messageDialog } from '../../services/dialogService';
import { QuestionsBanner } from './QuestionsBanner';
import { QuestionsPanel } from './QuestionsPanel';
import { parseQuestionForms, stripTrailingOpenQuestionForm, type QuestionFormBlock } from './questionForm';

type AssistantMessageProps = {
  message: Extract<AgentMessage, { role: 'assistant' }>;
  submittedQuestionForms?: Record<string, string>;
  onSubmitQuestionForm?: (formId: string, text: string) => void;
};

function isResearchTool(tool: AgentToolCall): boolean {
  return [
    'Read',
    'read_file',
    'Glob',
    'list_files',
    'Grep',
    'WebFetch',
    'web_fetch',
    'WebSearch',
    'web_search',
    'Bash',
    'bash',
    'Shell',
    'shell',
    'run_command',
    'execute_command',
  ]
    .includes(tool.name);
}

function isTodoTool(tool: AgentToolCall): boolean {
  const name = tool.name.toLowerCase();
  return name === 'todowrite' || name === 'todo_write' || name === 'update_plan';
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

export function AssistantMessage({
  message,
  submittedQuestionForms = {},
  onSubmitQuestionForm,
}: AssistantMessageProps) {
  const visibleQuestionFormContent = useMemo(
    () => stripTrailingOpenQuestionForm(message.content).visibleContent,
    [message.content],
  );
  const parsed = useMemo(() => parseQuestionForms(visibleQuestionFormContent), [visibleQuestionFormContent]);
  // 从 parsed.markdown 而非原始 content 提取代码块,避免 question-form 内 ```json``` 围栏被误判为可保存代码。
  const codeBlocks = useMemo(() => extractCodeBlocks(parsed.markdown), [parsed.markdown]);
  const [openFormId, setOpenFormId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
  }, []);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // 剪贴板不可用(非 Tauri / 权限拒绝)时静默忽略,不弹错误打断对话流。
    }
  };
  // P1-9: 仅在用户还没主动展开某个 form 时自动展开第一个。
  // 用 current ?? firstPending 守卫:openFormId=null 才自动打开,避免 effect 覆盖用户当前选择。
  useEffect(() => {
    const firstPending = parsed.forms.find((form) => !submittedQuestionForms[form.id]);
    if (firstPending) setOpenFormId((current) => current ?? firstPending.id);
  }, [parsed.forms, submittedQuestionForms]);

  // 工具分类：TodoCard 一级展示，其余折叠
  const todoTools = message.tools.filter(isTodoTool);
  const researchTools = message.tools.filter((tool) => !isTodoTool(tool) && isResearchTool(tool));
  const otherTools = message.tools.filter((tool) => !isTodoTool(tool) && !isResearchTool(tool));
  const foldedTools = [...researchTools, ...otherTools];

  const renderTool = (tool: AgentToolCall) => (
    <ToolCard
      key={tool.id}
      tool={tool}
      message={message}
    />
  );

  // 每个 form 的状态：pending / answered / skipped
  const getFormStatus = (form: QuestionFormBlock): 'pending' | 'answered' | 'skipped' => {
    const submitted = submittedQuestionForms[form.id];
    if (!submitted) return 'pending';
    return submitted.includes('Form status: skipped') ? 'skipped' : 'answered';
  };

  return (
    <article className="conversation-message assistant">
      <div className="conversation-message-meta">
        <span className="conversation-time" title={formatAbsoluteTime(message.createdAt)}>
          {formatRelativeTime(message.createdAt)}
        </span>
        {message.content.trim() && (
          <button
            type="button"
            className={`conversation-copy-button${copied ? ' copied' : ''}`}
            onClick={() => void handleCopy()}
            aria-label={copied ? '已复制' : '复制整条消息'}
            title={copied ? '已复制' : '复制整条消息'}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
        )}
      </div>
      <ThoughtCard text={message.thinking} done={message.done ?? false} />
      {message.content ? (
        <>
          {parsed.markdown && (
            <div className="conversation-assistant-markdown">
              <PreviewPane source={parsed.markdown} tocIds={[]} />
            </div>
          )}
          {/* TodoCard: 一级展示，不折叠 */}
          {todoTools.map((tool) => (
            <ToolCard
              key={tool.id}
              tool={tool}
              message={message}
            />
          ))}
          {/* QuestionForm: QuestionsBanner + QuestionsPanel */}
          {parsed.forms.map((form) => {
            const status = getFormStatus(form);
            const isOpen = openFormId === form.id;
            return (
              <div key={form.id} className="question-form-container">
                <QuestionsBanner
                  form={form}
                  status={status}
                  open={isOpen}
                  onOpen={() => setOpenFormId(isOpen ? null : form.id)}
                />
                {isOpen && (
                  <QuestionsPanel
                    form={form}
                    status={status}
                    submittedText={submittedQuestionForms[form.id]}
                    onSubmit={(text) => {
                      onSubmitQuestionForm?.(form.id, text);
                      setOpenFormId(null);
                    }}
                    onClose={() => setOpenFormId(null)}
                  />
                )}
              </div>
            );
          })}
          {message.done && codeBlocks.length > 0 && (
            <div className="conversation-code-actions">
              {codeBlocks.map((block, index) => (
                <div key={`${block.lang}-${index}`} className="conversation-code-action-row">
                  <span>{block.lang || 'code'} #{index + 1}</span>
                  <button
                    type="button"
                    className="conversation-code-save"
                    onClick={() => void handleSaveAs(block.lang, block.code)}
                  >
                    另存为
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        !message.error && message.tools.length === 0 && <p className="conversation-muted">AI Provider 正在思考...</p>
      )}
      <ToolCallGroup tools={foldedTools} renderTool={renderTool} />
      <ErrorRetryCard message={message.error ?? ''} />
      <DoneBar usage={message.usage} />
    </article>
  );
}

function ToolCallGroup({
  tools,
  renderTool,
}: {
  tools: AgentToolCall[];
  renderTool: (tool: AgentToolCall) => ReactNode;
}) {
  if (tools.length === 0) return null;
  const summary = summarizeToolNames(tools);
  return (
    <details className="conversation-tool-group">
      <summary>
        <span>工具调用</span>
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
  if (name === 'Bash' || name === 'bash' || name === 'Shell' || name === 'shell' || name === 'run_command' || name === 'execute_command') return 'Command';
  return name;
}
