import { CircleHelp, Check, SkipForward } from 'lucide-react';
import type { QuestionFormBlock } from './questionForm';

type QuestionsBannerProps = {
  form: QuestionFormBlock;
  status: 'pending' | 'answered' | 'skipped';
  onOpen: () => void;
};

export function QuestionsBanner({ form, status, onOpen }: QuestionsBannerProps) {
  return (
    <button
      type="button"
      className={`questions-banner questions-banner-${status}`}
      onClick={onOpen}
    >
      {status === 'answered' ? (
        <Check size={14} />
      ) : status === 'skipped' ? (
        <SkipForward size={14} />
      ) : (
        <CircleHelp size={14} />
      )}
      <span className="questions-banner-title">
        {status === 'answered' ? '已回答' : status === 'skipped' ? '已跳过' : form.title || '需要你补充'}
      </span>
      <span className="questions-banner-action">
        {status === 'answered' ? '查看答案' : status === 'skipped' ? '查看表单' : '回答问题'}
      </span>
    </button>
  );
}
