// 文档模式切换器 —— 凹槽容器 + 滑动指示器 + 三段(阅读/心流/检视)。
//
// 视觉:secondary 背景的圆角凹槽,active 段是白底凸起 + 0.5px 边,
// 滑动指示器用 transform translateX 跟着 docMode 索引动,
// 缓动 cubic-bezier(.32,.72,0,1) 0.42s(跟编辑器面板收放同节奏)。
//
// 跟普通 toolbar 图标按钮的区分:有外壳(凹槽)、文字常驻、active 凸起,
// 一眼能看出是"模式切换"而非单点 toggle。

import { BookOpen, MessageSquare, Sparkles } from 'lucide-react';
import type { DocMode } from '../hooks/useDocumentMode';

type Props = {
  mode: DocMode;
  onChange: (next: DocMode) => void;
  disabled?: boolean;
};

const SEGMENTS: ReadonlyArray<{ id: DocMode; label: string; Icon: typeof BookOpen }> = [
  { id: 'read', label: '阅读模式', Icon: BookOpen },
  { id: 'flow', label: '心流模式', Icon: Sparkles },
  { id: 'review', label: '检视模式', Icon: MessageSquare },
];

export function DocumentModeSwitcher({ mode, onChange, disabled = false }: Props) {
  const activeIndex = SEGMENTS.findIndex((s) => s.id === mode);
  return (
    <div
      className={`document-mode-switcher${disabled ? ' is-disabled' : ''}`}
      role="tablist"
      aria-label="文档模式"
      data-no-window-drag="true"
    >
      <span
        className="document-mode-switcher-indicator"
        aria-hidden="true"
        style={{ transform: `translateX(${activeIndex * 100}%)` }}
      />
      {SEGMENTS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={mode === id}
          className={`document-mode-switcher-segment${mode === id ? ' is-active' : ''}`}
          disabled={disabled}
          onClick={() => {
            if (disabled || mode === id) return;
            onChange(id);
          }}
          title={label}
        >
          <Icon size={14} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
