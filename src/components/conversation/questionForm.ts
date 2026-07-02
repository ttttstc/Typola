export type QuestionFormFieldType = 'radio' | 'checkbox' | 'select' | 'text' | 'textarea';

export type QuestionFormField = {
  id: string;
  label: string;
  type: QuestionFormFieldType;
  options: string[];
  required?: boolean;
  placeholder?: string;
  description?: string;
};

export type QuestionFormBlock = {
  id: string;
  title: string;
  description?: string;
  questions: QuestionFormField[];
  raw: string;
  submitLabel?: string;
  skipLabel?: string;
  autoSkipSeconds?: number;
};

export type ParsedQuestionForms = {
  markdown: string;
  forms: QuestionFormBlock[];
};

// ── Segment types for splitOnQuestionForms ──

export type MessageSegment =
  | { type: 'text'; content: string }
  | { type: 'question_form'; raw: string; form: QuestionFormBlock };

const QUESTION_FORM_RE = /<question-form\b([^>]*)>([\s\S]*?)<\/question-form>/gi;

function attr(attrs: string, name: string): string {
  const match = attrs.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return match?.[1]?.trim() ?? '';
}

function normalizeType(value: unknown, hasOptions = false): QuestionFormFieldType {
  if (value === 'checkbox' || value === 'multi_select') return 'checkbox';
  if (value === 'radio' || value === 'single_select') return 'radio';
  if (value === 'select') return 'select';
  if (value === 'textarea') return 'textarea';
  if (value === 'text') return 'text';
  return hasOptions ? 'radio' : 'text';
}

function normalizeOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((option) => {
      if (typeof option === 'string') return option;
      if (option && typeof option === 'object') {
        const record = option as Record<string, unknown>;
        const label = record.label ?? record.title ?? record.value;
        return typeof label === 'string' ? label : '';
      }
      return '';
    })
    .filter(Boolean);
}

function stripJsonFence(body: string): string {
  const trimmed = body.trim();
  const fenced = trimmed.match(/^```(?:json|JSON)?\s*\r?\n([\s\S]*?)\r?\n```$/u);
  return fenced ? fenced[1].trim() : trimmed;
}

function parseQuestionFormPayload(body: string): unknown {
  return JSON.parse(stripJsonFence(body));
}

function normalizeQuestions(payload: unknown): QuestionFormField[] {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const source = Array.isArray(record.questions) ? record.questions : Array.isArray(payload) ? payload : [];
  return source.map((item, index) => {
    const question = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const id = typeof question.id === 'string' && question.id.trim() ? question.id.trim() : `q${index + 1}`;
    const labelCandidate = question.label ?? question.title ?? question.question ?? id;
    const label = typeof labelCandidate === 'string' && labelCandidate.trim() ? labelCandidate.trim() : id;
    const options = normalizeOptions(question.options ?? question.choices);
    const type = normalizeType(question.type, options.length > 0);
    const required = question.required === true;
    const placeholder = typeof question.placeholder === 'string' ? question.placeholder : undefined;
    const description = typeof question.description === 'string' ? question.description : undefined;
    return { id, label, type, options, required, placeholder, description };
  }).filter((question) => question.label);
}

export function parseQuestionForms(markdown: string): ParsedQuestionForms {
  const forms: QuestionFormBlock[] = [];
  const stripped = markdown.replace(QUESTION_FORM_RE, (raw, attrs: string, body: string) => {
    try {
      const parsed = parseQuestionFormPayload(body);
      const parsedRecord = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
      const id = attr(attrs, 'id') || (typeof parsedRecord.id === 'string' ? parsedRecord.id : '') || `form-${forms.length + 1}`;
      const title = attr(attrs, 'title') || (typeof parsedRecord.title === 'string' ? parsedRecord.title : '') || '需要你确认';
      const description = typeof parsedRecord.description === 'string' ? parsedRecord.description : undefined;
      const submitLabel = typeof parsedRecord.submitLabel === 'string' ? parsedRecord.submitLabel : undefined;
      const skipLabel = typeof parsedRecord.skipLabel === 'string' ? parsedRecord.skipLabel : undefined;
      const autoSkipSeconds = typeof parsedRecord.autoSkipSeconds === 'number' ? parsedRecord.autoSkipSeconds : undefined;
      const questions = normalizeQuestions(parsed);
      if (questions.length > 0) forms.push({ id, title, description, questions, raw, submitLabel, skipLabel, autoSkipSeconds });
    } catch {
      return '\n\n> Question Form 解析失败，请让 AI 重新输出有效的 JSON 表单。\n\n';
    }
    return '';
  });
  return { markdown: stripped.trim(), forms };
}

export function formatQuestionFormAnswers(form: QuestionFormBlock, answers: Record<string, string | string[]>): string {
  const lines = [`[form answers — ${form.id}]`];
  for (const question of form.questions) {
    const value = answers[question.id];
    if (Array.isArray(value)) {
      lines.push(`- ${question.label}: ${value.length > 0 ? value.join(', ') : '未填写'}`);
    } else {
      lines.push(`- ${question.label}: ${value || '未填写'}`);
    }
  }
  return lines.join('\n');
}

export function formatQuestionFormSkipped(form: QuestionFormBlock, autoSkipped: boolean): string {
  return [
    `[form answers — ${form.id}]`,
    '- Form status: skipped',
    `- Reason: ${autoSkipped ? 'auto skipped after timeout' : 'user skipped the form'}`,
  ].join('\n');
}

export function questionFormFromAskUserQuestion(input: unknown, fallbackId: string): QuestionFormBlock | null {
  const record = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const source = Array.isArray(record.questions)
    ? record.questions
    : record.question || record.prompt
      ? [record]
      : [];
  const questions = normalizeQuestions({ questions: source });
  if (questions.length === 0) return null;
  const titleCandidate = record.title ?? record.header ?? record.name;
  const firstQuestion = source[0] && typeof source[0] === 'object' ? source[0] as Record<string, unknown> : {};
  const firstHeader = firstQuestion.header;
  const title = typeof titleCandidate === 'string' && titleCandidate.trim()
    ? titleCandidate.trim()
    : typeof firstHeader === 'string' && firstHeader.trim()
      ? firstHeader.trim()
      : '需要你确认';
  return {
    id: fallbackId,
    title,
    questions,
    raw: JSON.stringify(input ?? {}),
  };
}

export function formatAskUserQuestionAnswers(form: QuestionFormBlock, answers: Record<string, string | string[]>): string {
  return form.questions.map((question) => {
    const value = answers[question.id];
    const lines = Array.isArray(value)
      ? value.map((item) => `- ${item}`)
      : [String(value ?? '')];
    return [question.label, ...lines.filter((line) => line.trim())].join('\n');
  }).join('\n\n');
}

// ── Segment parser: split assistant text into text + question-form segments ──

export function splitOnQuestionForms(content: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  const regex = /<question-form\b([^>]*)>([\s\S]*?)<\/question-form>/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let formIndex = 0;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: content.slice(lastIndex, match.index) });
    }
    try {
      const parsed = parseQuestionFormPayload(match[2]);
      const parsedRecord = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
      const id = attr(match[1], 'id') || (typeof parsedRecord.id === 'string' ? parsedRecord.id : '') || `form-${++formIndex}`;
      const title = attr(match[1], 'title') || (typeof parsedRecord.title === 'string' ? parsedRecord.title : '') || '需要你确认';
      const description = typeof parsedRecord.description === 'string' ? parsedRecord.description : undefined;
      const submitLabel = typeof parsedRecord.submitLabel === 'string' ? parsedRecord.submitLabel : undefined;
      const skipLabel = typeof parsedRecord.skipLabel === 'string' ? parsedRecord.skipLabel : undefined;
      const autoSkipSeconds = typeof parsedRecord.autoSkipSeconds === 'number' ? parsedRecord.autoSkipSeconds : undefined;
      const questions = normalizeQuestions(parsed);
      if (questions.length > 0) {
        segments.push({
          type: 'question_form',
          raw: match[0],
          form: { id, title, description, questions, raw: match[0], submitLabel, skipLabel, autoSkipSeconds },
        });
      } else {
        segments.push({ type: 'text', content: match[0] });
      }
    } catch {
      segments.push({ type: 'text', content: match[0] });
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < content.length) {
    segments.push({ type: 'text', content: content.slice(lastIndex) });
  }

  return segments;
}

// ── Streaming: strip unclosed <question-form> from the tail ──

export function stripTrailingOpenQuestionForm(content: string): {
  visibleContent: string;
  hasOpenForm: boolean;
} {
  const openIndex = content.lastIndexOf('<question-form');
  if (openIndex === -1) return { visibleContent: content, hasOpenForm: false };
  const closeIndex = content.indexOf('</question-form>', openIndex);
  if (closeIndex !== -1) return { visibleContent: content, hasOpenForm: false };
  return { visibleContent: content.slice(0, openIndex), hasOpenForm: true };
}
