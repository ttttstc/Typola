// ToolCard 派发器 — 按 tool name 把渲染分派到对应家族 card。
//
// Lookup 顺序(照搬 OpenDesign ToolCard.tsx):
//  1. TodoWrite / todowrite / todo_write / update_plan  → TodoCard
//  2. Write / write / create_file                       → FileWriteCard
//  3. Edit / str_replace_edit                           → FileEditCard
//  4. Read / read_file                                  → FileReadCard
//  5. Bash                                              → BashCard
//  6. Glob / list_files                                 → GlobCard
//  7. Grep                                              → GrepCard
//  8. WebFetch / web_fetch                              → WebFetchCard
//  9. WebSearch / web_search                            → WebSearchCard
// 10. AskUserQuestion / ask_user_question               → AskUserQuestionCard
// 11. else                                              → GenericCard
//
// v1 只跳过 OpenDesign 的 getToolRenderer 第三方注册表。

import {
  AskUserQuestionCard,
  BashCard,
  FileEditCard,
  FileReadCard,
  FileWriteCard,
  GenericCard,
  GlobCard,
  GrepCard,
  TodoCard,
  WebFetchCard,
  WebSearchCard,
} from './cards';
import { isTodoWriteToolName, type ResultShape } from './shared';

type Props = {
  id: string;
  name: string;
  input: unknown;
  result?: ResultShape;
  runStreaming: boolean;
  runSucceeded: boolean;
  submittedText?: string;
  onSubmitQuestionForm?: (text: string) => void;
  onSubmitAskUserQuestionToolResult?: (toolUseId: string, text: string) => void;
};

function isAskUserQuestionName(name: string): boolean {
  return name === 'AskUserQuestion' || name === 'ask_user_question';
}

export function ToolCardDispatcher({
  id,
  name,
  input,
  result,
  runStreaming,
  runSucceeded,
  submittedText,
  onSubmitQuestionForm,
  onSubmitAskUserQuestionToolResult,
}: Props) {
  if (isTodoWriteToolName(name)) {
    return <TodoCard input={input} result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />;
  }
  if (name === 'Write' || name === 'write' || name === 'create_file') {
    return <FileWriteCard input={input} result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />;
  }
  if (name === 'Edit' || name === 'str_replace_edit') {
    return <FileEditCard input={input} result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />;
  }
  if (name === 'Read' || name === 'read_file') {
    return <FileReadCard input={input} result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />;
  }
  if (name === 'Bash') {
    return <BashCard input={input} result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />;
  }
  if (name === 'Glob' || name === 'list_files') {
    return <GlobCard input={input} result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />;
  }
  if (name === 'Grep') {
    return <GrepCard input={input} result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />;
  }
  if (name === 'WebFetch' || name === 'web_fetch') {
    return <WebFetchCard input={input} result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />;
  }
  if (name === 'WebSearch' || name === 'web_search') {
    return <WebSearchCard input={input} result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />;
  }
  if (isAskUserQuestionName(name)) {
    return (
      <AskUserQuestionCard
        toolId={id}
        input={input}
        result={result}
        runStreaming={runStreaming}
        runSucceeded={runSucceeded}
        submittedText={submittedText}
        onSubmit={
          onSubmitAskUserQuestionToolResult
            ? (text) => onSubmitAskUserQuestionToolResult(id, text)
            : onSubmitQuestionForm
        }
      />
    );
  }
  return (
    <GenericCard
      name={name}
      input={input}
      result={result}
      runStreaming={runStreaming}
      runSucceeded={runSucceeded}
    />
  );
}
