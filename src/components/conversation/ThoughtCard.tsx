import { useState } from 'react';

export function ThoughtCard({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  if (!text.trim()) return null;
  return (
    <div className="conversation-thought-card">
      <button type="button" onClick={() => setOpen((value) => !value)}>
        {open ? '隐藏思考过程' : '显示思考过程'}
      </button>
      {open && <pre>{text}</pre>}
    </div>
  );
}
