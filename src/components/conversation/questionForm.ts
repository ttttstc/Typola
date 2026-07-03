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
  errors: QuestionFormParseError[];
};

export type QuestionFormParseError = {
  raw: string;
  attrs: string;
  body: string;
  reason: string;
};

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
  const errors: QuestionFormParseError[] = [];
  const stripped = markdown.replace(QUESTION_FORM_RE, (raw, attrs: string, body: string) => {
    let parsedRecord: Record<string, unknown> = {};
    try {
      const parsed = parseQuestionFormPayload(body);
      parsedRecord = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
      const id = attr(attrs, 'id') || (typeof parsedRecord.id === 'string' ? parsedRecord.id : '') || `form-${forms.length + 1}`;
      const title = attr(attrs, 'title') || (typeof parsedRecord.title === 'string' ? parsedRecord.title : '') || '需要你确认';
      const description = typeof parsedRecord.description === 'string' ? parsedRecord.description : undefined;
      const submitLabel = typeof parsedRecord.submitLabel === 'string' ? parsedRecord.submitLabel : undefined;
      const skipLabel = typeof parsedRecord.skipLabel === 'string' ? parsedRecord.skipLabel : undefined;
      const autoSkipSeconds = typeof parsedRecord.autoSkipSeconds === 'number' ? parsedRecord.autoSkipSeconds : undefined;
      const questions = normalizeQuestions(parsed);
      if (questions.length === 0) {
        errors.push({ raw, attrs, body, reason: 'empty-questions' });
        return '';
      }
      forms.push({ id, title, description, questions, raw, submitLabel, skipLabel, autoSkipSeconds });
      return '';
    } catch (error) {
      errors.push({ raw, attrs, body, reason: error instanceof Error ? error.message : String(error) });
      return '';
    }
  });
  return { markdown: stripped.trim(), forms, errors };
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

// ── Streaming: detect if there's any unclosed <question-form> mid-stream ──
// P0-7: streaming 兜底用,即使 JSON 还没写完也能识别已开口的 form,展示"加载中"占位。
export function hasOpenQuestionForm(content: string): boolean {
  return stripTrailingOpenQuestionForm(content).hasOpenForm;
}
