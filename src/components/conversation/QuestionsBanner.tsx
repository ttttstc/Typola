import { Check, ChevronDown, ChevronRight, CircleHelp, Loader2, SkipForward } from 'lucide-react';
import type { QuestionFormBlock } from './questionForm';

type QuestionsBannerProps = {
  form: QuestionFormBlock;
  status: 'pending' | 'answered' | 'skipped' | 'loading';
  open: boolean;
  onOpen: () => void;
};

export function QuestionsBanner({ form, status, open, onOpen }: QuestionsBannerProps) {
  const statusText = status === 'answered'
    ? '已回答'
    : status === 'skipped'
      ? '已跳过'
      : status === 'loading'
        ? '表单加载中'
        : '等待回答';
  return (
    <button
      type="button"
      className={`questions-banner questions-banner-${status}`}
      onClick={onOpen}
      aria-expanded={open}
      disabled={status === 'loading'}
    >
      <span className="questions-banner-status" aria-hidden>
        {status === 'answered' ? (
          <Check size={13} />
        ) : status === 'skipped' ? (
          <SkipForward size={13} />
        ) : status === 'loading' ? (
          <Loader2 size={13} className="spin" />
        ) : (
          <CircleHelp size={13} />
        )}
      </span>
      <span className="questions-banner-title">
        {form.title || '需要你补充'}
      </span>
      <span className="questions-banner-action">
        {statusText}
      </span>
      <span className="questions-banner-chevron" aria-hidden>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </span>
    </button>
  );
}
