import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { QuestionFormBlock, QuestionFormField } from './questionForm';
import { formatQuestionFormAnswers, formatQuestionFormSkipped } from './questionForm';

type AnswerValue = string | string[];

type QuestionsPanelProps = {
  form: QuestionFormBlock;
  status: 'pending' | 'answered' | 'skipped';
  submittedText?: string;
  onSubmit: (text: string) => void;
  onClose: () => void;
};

function toggleCheckbox(current: AnswerValue | undefined, option: string): string[] {
  const values = Array.isArray(current) ? current : [];
  return values.includes(option)
    ? values.filter((v) => v !== option)
    : [...values, option];
}

function isAnswered(value: AnswerValue | undefined): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === 'string' && value.trim().length > 0;
}

function QuestionField({
  question,
  value,
  onChange,
}: {
  question: QuestionFormField;
  value: AnswerValue | undefined;
  onChange: (id: string, value: AnswerValue) => void;
}) {
  const handleChange = useCallback(
    (v: AnswerValue) => onChange(question.id, v),
    [onChange, question.id],
  );

  if (question.type === 'checkbox') {
    return (
      <fieldset className="question-form-field">
        <legend>
          {question.label}
          {question.required && <span className="question-form-required">*</span>}
        </legend>
        {question.description && <p className="question-form-desc">{question.description}</p>}
        {question.options.map((option) => (
          <label key={option}>
            <input
              type="checkbox"
              checked={Array.isArray(value) && value.includes(option)}
              onChange={() => handleChange(toggleCheckbox(value, option))}
            />
            <span>{option}</span>
          </label>
        ))}
      </fieldset>
    );
  }

  if (question.type === 'radio') {
    return (
      <fieldset className="question-form-field">
        <legend>
          {question.label}
          {question.required && <span className="question-form-required">*</span>}
        </legend>
        {question.description && <p className="question-form-desc">{question.description}</p>}
        {question.options.map((option) => (
          <label key={option}>
            <input
              type="radio"
              name={`qf-${question.id}`}
              checked={value === option}
              onChange={() => handleChange(option)}
            />
            <span>{option}</span>
          </label>
        ))}
      </fieldset>
    );
  }

  if (question.type === 'select') {
    return (
      <label className="question-form-field">
        <span>
          {question.label}
          {question.required && <span className="question-form-required">*</span>}
        </span>
        {question.description && <p className="question-form-desc">{question.description}</p>}
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => handleChange(e.target.value)}
        >
          <option value="">{question.placeholder || '请选择'}</option>
          {question.options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </label>
    );
  }

  if (question.type === 'textarea') {
    return (
      <label className="question-form-field">
        <span>
          {question.label}
          {question.required && <span className="question-form-required">*</span>}
        </span>
        {question.description && <p className="question-form-desc">{question.description}</p>}
        <textarea
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={question.placeholder || '输入答案'}
          rows={3}
        />
      </label>
    );
  }

  // text
  return (
    <label className="question-form-field">
      <span>
        {question.label}
        {question.required && <span className="question-form-required">*</span>}
      </span>
      {question.description && <p className="question-form-desc">{question.description}</p>}
      <input
        type="text"
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={question.placeholder || '输入答案'}
      />
    </label>
  );
}

export function QuestionsPanel({ form, status, submittedText, onSubmit, onClose }: QuestionsPanelProps) {
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [error, setError] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSkipSeconds = form.autoSkipSeconds ?? 120;
  const [countdown, setCountdown] = useState(autoSkipSeconds);

  const setAnswer = useCallback((id: string, value: AnswerValue) => {
    setError('');
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }, []);

  // auto-skip timer
  useEffect(() => {
    if (status !== 'pending') return;
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [status]);

  useEffect(() => {
    if (status === 'pending' && countdown === 0) {
      onSubmit(formatQuestionFormSkipped(form, true));
    }
  }, [status, countdown, form, onSubmit]);

  // cleanup
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  if (status === 'answered' || status === 'skipped') {
    return (
      <div className="questions-panel questions-panel-readonly">
        <div className="questions-panel-header">
          <strong>{form.title}</strong>
          <span>{status === 'answered' ? '已回答' : '已跳过'}</span>
          <button type="button" className="questions-panel-close" onClick={onClose} aria-label="关闭">
            <X size={14} />
          </button>
        </div>
        {submittedText && <pre className="questions-panel-submitted">{submittedText}</pre>}
      </div>
    );
  }

  const hasRequiredAnswered = form.questions
    .filter((q) => q.required)
    .every((q) => isAnswered(answers[q.id]));

  const hasAnyAnswer = form.questions.some((q) => isAnswered(answers[q.id]));

  const handleSubmit = () => {
    if (!hasRequiredAnswered) {
      setError('请填写所有必填问题。');
      return;
    }
    if (!hasAnyAnswer) {
      setError('请至少填写一个答案后再提交。');
      return;
    }
    onSubmit(formatQuestionFormAnswers(form, answers));
  };

  const handleSkip = () => {
    onSubmit(formatQuestionFormSkipped(form, false));
  };

  return (
    <div className="questions-panel">
      <div className="questions-panel-header">
        <strong>{form.title}</strong>
        <button type="button" className="questions-panel-close" onClick={onClose} aria-label="关闭">
          <X size={14} />
        </button>
      </div>
      {form.description && <p className="questions-panel-desc">{form.description}</p>}
      <div className="questions-panel-fields">
        {form.questions.map((question) => (
          <QuestionField
            key={question.id}
            question={question}
            value={answers[question.id]}
            onChange={setAnswer}
          />
        ))}
      </div>
      {error && <span className="question-form-error" role="alert">{error}</span>}
      <div className="questions-panel-footer">
        <button type="button" className="questions-panel-skip" onClick={handleSkip}>
          {form.skipLabel || '跳过'}
          <span className="questions-panel-countdown">{countdown}s</span>
        </button>
        <button
          type="button"
          className="questions-panel-submit"
          onClick={handleSubmit}
          disabled={!hasRequiredAnswered || !hasAnyAnswer}
        >
          {form.submitLabel || '继续'}
        </button>
      </div>
    </div>
  );
}
