import { useState } from 'react';
import { Loader2 } from 'lucide-react';

type ThoughtCardProps = {
  text: string;
  /** 当前 assistant 消息是否已完成(usage 事件触发后置 true)。流式中加 spinner + 心跳计数,避免"看起来卡住"。 */
  done?: boolean;
};

export function ThoughtCard({ text, done = false }: ThoughtCardProps) {
  const [open, setOpen] = useState(false);
  if (!text.trim()) return null;
  const thinking = !done;
  const label = open
    ? (thinking ? `思考中… ${text.length} 字（点击收起）` : '隐藏思考过程')
    : (thinking ? `思考中… ${text.length} 字（点击展开实时查看）` : '显示思考过程');
  return (
    <div className={`conversation-thought-card ${thinking ? 'thinking' : ''}`}>
      <button type="button" onClick={() => setOpen((value) => !value)}>
        {thinking
          ? <Loader2 size={12} className="conversation-thought-spinner" aria-hidden />
          : <span aria-hidden>💭</span>}
        <span>{label}</span>
      </button>
      {open && <pre>{text}</pre>}
    </div>
  );
}
