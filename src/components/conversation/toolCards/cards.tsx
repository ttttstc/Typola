// 11 个工具家族专用 card + 共享子组件。
//
// 设计原则:
// - 每个 card 接收 4 个 props: input, result, runStreaming, runSucceeded
// - 头(`.op-card-head`)统一:状态徽章 + 标题 + meta + 右侧 chevron
// - 折叠内容(`.op-card-detail`)按 card 复杂度:文件类显路径,bash 类显 cmd+output,其它不展开
// - 错误结果(`.op-output`)单独在头下方铺一条红色 pre
// - 每张卡底部追加 RawJsonDisclosure (用户要求保留展开 JSON)

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useSettings } from '../../../hooks/useSettings';
import { translate } from '../../../services/i18n';
import {
  basenameOf,
  describeInput,
  parseTodoWriteInput,
  truncate,
  type ResultShape,
  type TodoItem,
} from './shared';
import { ResultBadge } from './ResultBadge';

// 通用 props,所有 card 共享
type CardProps = {
  input: unknown;
  result?: ResultShape;
  runStreaming: boolean;
  runSucceeded: boolean;
};

// 翻译 hook(组件内联)
function useT() {
  const locale = useSettings().locale;
  return (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => {
    let text = translate(locale, key);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }
    return text;
  };
}

// 文件路径打开按钮 — v1 暂未接入文件树回调,直接返回 null。占位以备后续
// 从 AppLayout 透传 onRequestOpenFile 时只改这里。
function OpenInTabButton({ filePath }: { filePath: string }) {
  if (!filePath || filePath === '(unnamed)') return null;
  const baseName = basenameOf(filePath);
  if (!baseName) return null;
  return null;
}

// 错误细节:仅在 result.isError 且有内容时显示
function FileErrorDetail({ result }: { result?: ResultShape }) {
  if (!result?.isError || !result.content.trim()) return null;
  return <pre className="op-output">{truncate(result.content, 1200)}</pre>;
}

// 折叠容器 — OpenDesign 用的 max-height 动画方案
function Collapsible({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div className={`accordion-collapsible${open ? ' open' : ''}`}>
      <div className="accordion-collapsible-inner">{children}</div>
    </div>
  );
}

// 卡片头(可点击折叠) — 共享 onClick 切换逻辑
function CardHead({
  title,
  meta,
  open,
  isRunning,
  result,
  runStreaming,
  runSucceeded,
  onClick,
  onTitleClick,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  open: boolean;
  isRunning: boolean;
  result?: ResultShape;
  runStreaming: boolean;
  runSucceeded: boolean;
  onClick?: () => void;
  onTitleClick?: () => void;
}) {
  return (
    <div className="op-card-head">
      <ResultBadge result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />
      <button
        type="button"
        className="op-card-head-toggle"
        onClick={onClick ?? onTitleClick}
        aria-expanded={open}
      >
        <span className={`op-title${isRunning ? ' shimmer-text' : ''}`}>{title}</span>
        {meta ? <span className="op-meta">{meta}</span> : null}
        <span className="op-expand-chev" aria-hidden>
          {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </span>
      </button>
    </div>
  );
}

// 底部"显示原始 JSON"折叠 — 用户要求保留 JSON 展开
function RawJsonDisclosure({ data }: { data: unknown }) {
  const t = useT();
  let json: string;
  try {
    json = JSON.stringify(data, null, 2);
  } catch {
    json = String(data);
  }
  return (
    <details className="op-raw-json">
      <summary>{t('toolShowRawJson')}</summary>
      <pre>{json}</pre>
    </details>
  );
}

// ============= TodoCard =============
//
// 解析 input.todos 渲染四态列表(○/◐/✓/!),有 in_progress 时默认展开,
// 否则折叠成 "完成数/总数" + 当前 activeForm 一行。
export function TodoCard({ input, runStreaming, runSucceeded }: CardProps) {
  const t = useT();
  const todos = parseTodoWriteInput(input);
  if (todos.length === 0) {
    return (
      <div className="op-card op-todo op-generic">
        <GenericCard
          name="TodoWrite"
          input={input}
          result={undefined}
          runStreaming={runStreaming}
          runSucceeded={runSucceeded}
        />
      </div>
    );
  }
  const hasInProgress = todos.some((todo) => todo.status === 'in_progress');
  const hasPending = todos.some((todo) => todo.status === 'pending' || todo.status === 'in_progress');
  const defaultExpanded = todos.length > 0 && (hasInProgress || hasPending || runStreaming);
  const [overrideExpanded, setOverrideExpanded] = useState<boolean | null>(null);
  const expanded = overrideExpanded ?? defaultExpanded;
  const inProgressTodo = todos.find((todo) => todo.status === 'in_progress');
  const done = todos.filter((todo) => todo.status === 'completed' || todo.status === 'in_progress').length;
  return (
    <div className={`op-card op-todo${expanded ? '' : ' op-todo-collapsed'}`}>
      <div className="op-card-head op-todo-head">
        <button
          type="button"
          className="op-todo-toggle"
          aria-expanded={expanded}
          onClick={() => setOverrideExpanded(!expanded)}
          title={expanded ? t('toolTodosCollapse') : t('toolTodosExpand')}
        >
          <span className="op-icon" aria-hidden>☐</span>
          <span className="op-title">{t('toolTodos')}</span>
          <span className="op-meta">
            {done}/{todos.length}
          </span>
          {!expanded && inProgressTodo ? (
            <span className="op-todo-current">
              {inProgressTodo.activeForm || inProgressTodo.content}
            </span>
          ) : null}
          <span className="op-todo-chev" aria-hidden>
            {expanded ? '▾' : '▸'}
          </span>
        </button>
      </div>
      <Collapsible open={expanded}>
        <div className="op-card-detail">
          <ul className="todo-list">
            {todos.map((todo, i) => (
              <TodoRow key={i} todo={todo} />
            ))}
          </ul>
        </div>
      </Collapsible>
      <RawJsonDisclosure data={{ input }} />
    </div>
  );
}

function TodoRow({ todo }: { todo: TodoItem }) {
  return (
    <li className={`todo-item todo-${todo.status}`}>
      <span className="todo-check" aria-hidden>
        {todo.status === 'completed'
          ? '✓'
          : todo.status === 'in_progress'
            ? '◐'
            : todo.status === 'stopped'
              ? '!'
              : '○'}
      </span>
      <span className="todo-text">
        {todo.status === 'in_progress' && todo.activeForm ? todo.activeForm : todo.content}
      </span>
    </li>
  );
}

// ============= FileWriteCard =============
export function FileWriteCard({ input, result, runStreaming, runSucceeded }: CardProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const obj = (input ?? {}) as { file_path?: string; filePath?: string; path?: string; content?: string };
  const file = obj.file_path ?? obj.filePath ?? obj.path ?? '(unnamed)';
  const baseName = basenameOf(file);
  const lines = typeof obj.content === 'string' ? obj.content.split('\n').length : null;
  const isRunning = runStreaming && !result;
  return (
    <div className="op-card op-file">
      <CardHead
        title={t('toolWrite')}
        meta={
          baseName +
          (lines !== null ? ` · ${t('toolLines', { n: lines })}` : '')
        }
        open={open}
        isRunning={isRunning}
        result={result}
        runStreaming={runStreaming}
        runSucceeded={runSucceeded}
        onClick={() => setOpen((o) => !o)}
      />
      <Collapsible open={open}>
        <div className="op-card-detail op-card-file-detail">
          <code className="op-path">{file}</code>
          <OpenInTabButton filePath={file} />
        </div>
      </Collapsible>
      <FileErrorDetail result={result} />
      <RawJsonDisclosure data={{ input, result }} />
    </div>
  );
}

// ============= FileEditCard =============
export function FileEditCard({ input, result, runStreaming, runSucceeded }: CardProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const obj = (input ?? {}) as {
    file_path?: string;
    filePath?: string;
    path?: string;
    edits?: unknown[];
  };
  const file = obj.file_path ?? obj.filePath ?? obj.path ?? '(unnamed)';
  const baseName = basenameOf(file);
  const editCount = Array.isArray(obj.edits) ? obj.edits.length : 1;
  const isRunning = runStreaming && !result;
  const changeLabel = editCount === 1 ? t('toolChangeSingular') : t('toolChangePlural');
  return (
    <div className="op-card op-file">
      <CardHead
        title={t('toolEdit')}
        meta={`${baseName} · ${editCount} ${changeLabel}`}
        open={open}
        isRunning={isRunning}
        result={result}
        runStreaming={runStreaming}
        runSucceeded={runSucceeded}
        onClick={() => setOpen((o) => !o)}
      />
      <Collapsible open={open}>
        <div className="op-card-detail op-card-file-detail">
          <code className="op-path">{file}</code>
          <OpenInTabButton filePath={file} />
        </div>
      </Collapsible>
      <FileErrorDetail result={result} />
      <RawJsonDisclosure data={{ input, result }} />
    </div>
  );
}

// ============= FileReadCard =============
export function FileReadCard({ input, result, runStreaming, runSucceeded }: CardProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const obj = (input ?? {}) as { file_path?: string; filePath?: string; path?: string };
  const file = obj.file_path ?? obj.filePath ?? obj.path ?? '(unnamed)';
  const baseName = basenameOf(file);
  const isRunning = runStreaming && !result;
  return (
    <div className="op-card op-file">
      <CardHead
        title={t('toolRead')}
        meta={baseName}
        open={open}
        isRunning={isRunning}
        result={result}
        runStreaming={runStreaming}
        runSucceeded={runSucceeded}
        onClick={() => setOpen((o) => !o)}
      />
      <Collapsible open={open}>
        <div className="op-card-detail op-card-file-detail">
          <code className="op-path">{file}</code>
          <OpenInTabButton filePath={file} />
        </div>
      </Collapsible>
      <FileErrorDetail result={result} />
      <RawJsonDisclosure data={{ input, result }} />
    </div>
  );
}

// ============= BashCard =============
export function BashCard({ input, result, runStreaming, runSucceeded }: CardProps) {
  const t = useT();
  const obj = (input ?? {}) as { command?: string; description?: string };
  const command = obj.command ?? '';
  const desc = obj.description;
  const [open, setOpen] = useState(false);
  const isRunning = runStreaming && !result;
  return (
    <div className="op-card op-bash">
      <CardHead
        title={t('toolBash')}
        meta={desc ? <span className="op-desc">{desc}</span> : undefined}
        open={open}
        isRunning={isRunning}
        result={result}
        runStreaming={runStreaming}
        runSucceeded={runSucceeded}
        onClick={() => setOpen((o) => !o)}
      />
      <Collapsible open={open}>
        <div className="op-card-detail">
          <pre className="op-command">{truncate(command, 400)}</pre>
          {result?.content ? (
            <pre className="op-output">{truncate(result.content, 4000)}</pre>
          ) : null}
        </div>
      </Collapsible>
      <RawJsonDisclosure data={{ input, result }} />
    </div>
  );
}

// ============= GlobCard / GrepCard / WebFetchCard / WebSearchCard =============
//
// 纯头部单行卡片,不展开,只在 head 显 search 关键参数。
export function GlobCard({ input, runStreaming, runSucceeded, result }: CardProps) {
  const t = useT();
  const obj = (input ?? {}) as { pattern?: string; path?: string };
  return (
    <div className="op-card op-search">
      <div className="op-card-head op-card-head-static">
        <ResultBadge result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />
        <span className="op-title">{t('toolGlob')}</span>
        <span className="op-meta">
          {obj.pattern ?? '*'}
          {obj.path ? ` in ${obj.path}` : ''}
        </span>
      </div>
      <RawJsonDisclosure data={{ input, result }} />
    </div>
  );
}

export function GrepCard({ input, runStreaming, runSucceeded, result }: CardProps) {
  const t = useT();
  const obj = (input ?? {}) as { pattern?: string; path?: string; glob?: string };
  return (
    <div className="op-card op-search">
      <div className="op-card-head op-card-head-static">
        <ResultBadge result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />
        <span className="op-title">{t('toolGrep')}</span>
        <span className="op-meta">
          {obj.pattern ?? ''}
          {obj.path ? ` in ${obj.path}` : ''}
        </span>
      </div>
      <RawJsonDisclosure data={{ input, result }} />
    </div>
  );
}

export function WebFetchCard({ input, runStreaming, runSucceeded, result }: CardProps) {
  const t = useT();
  const obj = (input ?? {}) as { url?: string };
  return (
    <div className="op-card op-web">
      <div className="op-card-head op-card-head-static">
        <ResultBadge result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />
        <span className="op-title">{t('toolFetch')}</span>
        <span className="op-meta">{obj.url ?? ''}</span>
      </div>
      <RawJsonDisclosure data={{ input, result }} />
    </div>
  );
}

export function WebSearchCard({ input, runStreaming, runSucceeded, result }: CardProps) {
  const t = useT();
  const obj = (input ?? {}) as { query?: string };
  return (
    <div className="op-card op-web">
      <div className="op-card-head op-card-head-static">
        <ResultBadge result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />
        <span className="op-title">{t('toolSearch')}</span>
        <span className="op-meta">{obj.query ?? ''}</span>
      </div>
      <RawJsonDisclosure data={{ input, result }} />
    </div>
  );
}

// ============= GenericCard =============
export function GenericCard({
  name,
  input,
  result,
  runStreaming,
  runSucceeded,
}: {
  name: string;
  input: unknown;
  result?: ResultShape;
  runStreaming: boolean;
  runSucceeded: boolean;
}) {
  const summary = describeInput(input);
  return (
    <div className="op-card op-generic">
      <div className="op-card-head op-card-head-static">
        <ResultBadge result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />
        <span className="op-title">{name}</span>
        {summary ? <span className="op-meta">{truncate(summary, 200)}</span> : null}
      </div>
      <RawJsonDisclosure data={{ input, result }} />
    </div>
  );
}
