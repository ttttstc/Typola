export type QuestionFormFieldType = 'radio' | 'checkbox' | 'select' | 'text';

export type QuestionFormField = {
  id: string;
  label: string;
  type: QuestionFormFieldType;
  options: string[];
};

export type QuestionFormBlock = {
  id: string;
  title: string;
  questions: QuestionFormField[];
  raw: string;
};

export type ParsedQuestionForms = {
  markdown: string;
  forms: QuestionFormBlock[];
};

const QUESTION_FORM_RE = /<question-form\b([^>]*)>([\s\S]*?)<\/question-form>/gi;

function attr(attrs: string, name: string): string {
  const match = attrs.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return match?.[1]?.trim() ?? '';
}

function normalizeType(value: unknown, hasOptions = false): QuestionFormFieldType {
  return value === 'checkbox' || value === 'select' || value === 'text' || value === 'radio'
    ? value
    : hasOptions
      ? 'radio'
      : 'text';
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
    return { id, label, type, options };
  }).filter((question) => question.label);
}

export function parseQuestionForms(markdown: string): ParsedQuestionForms {
  const forms: QuestionFormBlock[] = [];
  const stripped = markdown.replace(QUESTION_FORM_RE, (raw, attrs: string, body: string) => {
    try {
      const parsed = JSON.parse(body.trim());
      const id = attr(attrs, 'id') || `form-${forms.length + 1}`;
      const title = attr(attrs, 'title') || '需要你确认';
      const questions = normalizeQuestions(parsed);
      if (questions.length > 0) forms.push({ id, title, questions, raw });
    } catch {
      return '';
    }
    return '';
  });
  return { markdown: stripped.trim(), forms };
}

export function formatQuestionFormAnswers(form: QuestionFormBlock, answers: Record<string, string | string[]>): string {
  const lines = [`[form answers - ${form.id}]`];
  for (const question of form.questions) {
    const value = answers[question.id];
    const text = Array.isArray(value) ? value.join(', ') : value;
    lines.push(`${question.label}: ${text || '未填写'}`);
  }
  return lines.join('\n');
}
