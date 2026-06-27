import { useEffect, useRef, useState } from 'react';
import { ChevronDown, MessageSquare, Pencil, Plus, X } from 'lucide-react';
import type { ConversationData } from '../../services/agent/conversationStore';

type ConversationPillProps = {
  conversations: Map<string, ConversationData>;
  activeConvId: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onClose: (id: string) => void;
  onRename: (id: string, title: string) => void;
};

export function ConversationPill({ conversations, activeConvId, onSelect, onCreate, onClose, onRename }: ConversationPillProps) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const active = conversations.get(activeConvId);
  const count = conversations.size;

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setEditingId(null);
      }
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [open]);

  const commitRename = (id: string) => {
    onRename(id, draft);
    setEditingId(null);
  };

  return (
    <div className="conversation-pill-container" ref={containerRef}>
      <button
        type="button"
        className="conversation-pill"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <MessageSquare size={13} />
        <span className="conversation-pill-title">{active?.title ?? '会话'}</span>
        {count > 1 && <span className="conversation-pill-count">{count}</span>}
        <ChevronDown size={12} className={`conversation-pill-chevron ${open ? 'open' : ''}`} />
      </button>
      {open && (
        <div className="conversation-pill-dropdown" role="listbox">
          {[...conversations.values()].map((conv) => (
            <div
              key={conv.id}
              className={`conversation-pill-item ${conv.id === activeConvId ? 'active' : ''}`}
              onClick={() => { if (editingId !== conv.id) { onSelect(conv.id); setOpen(false); } }}
              role="option"
              aria-selected={conv.id === activeConvId}
            >
              {editingId === conv.id ? (
                <input
                  autoFocus
                  className="conversation-pill-item-input"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onClick={(event) => event.stopPropagation()}
                  onBlur={() => commitRename(conv.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') commitRename(conv.id);
                    else if (event.key === 'Escape') setEditingId(null);
                  }}
                />
              ) : (
                <span
                  className="conversation-pill-item-title"
                  onDoubleClick={(event) => { event.stopPropagation(); setEditingId(conv.id); setDraft(conv.title); }}
                  title="双击重命名"
                >
                  {conv.title}
                </span>
              )}
              {conv.runState === 'running' && <span className="conversation-pill-item-running" />}
              <button
                type="button"
                className="conversation-pill-item-rename"
                onClick={(event) => {
                  event.stopPropagation();
                  setEditingId(conv.id);
                  setDraft(conv.title);
                }}
                aria-label={`重命名 ${conv.title}`}
                title="重命名"
              >
                <Pencil size={11} />
              </button>
              {conversations.size > 1 && (
                <button
                  type="button"
                  className="conversation-pill-item-close"
                  onClick={(event) => { event.stopPropagation(); onClose(conv.id); }}
                  aria-label={`关闭 ${conv.title}`}
                >
                  <X size={11} />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="conversation-pill-new"
            onClick={() => { onCreate(); setOpen(false); }}
          >
            <Plus size={12} />
            <span>新建会话</span>
          </button>
        </div>
      )}
    </div>
  );
}
