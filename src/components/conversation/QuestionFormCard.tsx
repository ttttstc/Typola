import { useState } from 'react';
import type { QuestionFormBlock } from './questionForm';
import { formatQuestionFormAnswers } from './questionForm';

type AnswerValue = string | string[];

type QuestionFormCardProps = {
  form: QuestionFormBlock;
  submittedText?: string;
  // stream-json 通道:write 失败时显示错误条并允许重试(answers 由组件本地 state 保留)。
  submitError?: string;
  // 提交中:禁用输入框 + 提交按钮 + 改文案,防双击 / 重复 write stdin。
  submitting?: boolean;
  onSubmit: (text: string) => void;
  formatAnswers?: (form: QuestionFormBlock, answers: Record<string, string | string[]>) => string;
};

function toggleCheckbox(current: AnswerValue | undefined, option: string): string[] {
  const values = Array.isArray(current) ? current : [];
  return values.includes(option)
    ? values.filter((value) => value !== option)
    : [...values, option];
}

export function QuestionFormCard({
  form,
  submittedText,
  submitError,
  submitting = false,
  onSubmit,
  formatAnswers = formatQuestionFormAnswers,
}: QuestionFormCardProps) {
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [error, setError] = useState('');

  if (submittedText) {
    return (
      <section className="question-form-card submitted">
        <header>
          <strong>{form.title}</strong>
          <span>已提交</span>
        </header>
        <pre>{submittedText}</pre>
      </section>
    );
  }

  const setAnswer = (id: string, value: AnswerValue) => {
    setError('');
    setAnswers((current) => ({ ...current, [id]: value }));
  };

  const hasAnyAnswer = form.questions.some((question) => {
    const value = answers[question.id];
    if (Array.isArray(value)) return value.length > 0;
    return typeof value === 'string' && value.trim().length > 0;
  });

  const submit = () => {
    if (submitting) return;
    if (!hasAnyAnswer) {
      setError('请至少填写一个答案后再提交。');
      return;
    }
    setError('');
    onSubmit(formatAnswers(form, answers));
  };

  return (
    <section className={`question-form-card${submitError ? ' has-error' : ''}`}>
      <header>
        <strong>{form.title}</strong>
        <span>需要你补充</span>
      </header>
      {submitError && (
        <div className="question-form-error" role="alert">
          提交失败:{submitError}
        </div>
      )}
      <div className="question-form-fields">
        {form.questions.map((question) => {
          const value = answers[question.id];
          if (question.type === 'checkbox') {
            return (
              <fieldset key={question.id} className="question-form-field" disabled={submitting}>
                <legend>{question.label}</legend>
                {question.options.map((option) => (
                  <label key={option}>
                    <input
                      type="checkbox"
                      checked={Array.isArray(value) && value.includes(option)}
                      onChange={() => setAnswer(question.id, toggleCheckbox(value, option))}
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </fieldset>
            );
          }
          if (question.type === 'radio') {
            return (
              <fieldset key={question.id} className="question-form-field" disabled={submitting}>
                <legend>{question.label}</legend>
                {question.options.map((option) => (
                  <label key={option}>
                    <input
                      type="radio"
                      name={`${form.id}-${question.id}`}
                      checked={value === option}
                      onChange={() => setAnswer(question.id, option)}
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </fieldset>
            );
          }
          if (question.type === 'select') {
            return (
              <label key={question.id} className="question-form-field">
                <span>{question.label}</span>
                <select
                  value={typeof value === 'string' ? value : ''}
                  onChange={(event) => setAnswer(question.id, event.target.value)}
                  disabled={submitting}
                >
                  <option value="">请选择</option>
                  {question.options.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
            );
          }
          return (
            <label key={question.id} className="question-form-field">
              <span>{question.label}</span>
              <input
                type="text"
                value={typeof value === 'string' ? value : ''}
                onChange={(event) => setAnswer(question.id, event.target.value)}
                placeholder="输入答案"
                disabled={submitting}
              />
            </label>
          );
        })}
      </div>
      <footer>
        {error && <span className="question-form-error" role="alert">{error}</span>}
        <button type="button" onClick={submit} disabled={submitting || !hasAnyAnswer}>
          {submitting ? '提交中...' : submitError ? '重新提交' : '提交答案'}
        </button>
      </footer>
    </section>
  );
}
