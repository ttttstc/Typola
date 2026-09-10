import { useEffect, useRef, useState } from 'react';

type GoToLinePopoverProps = {
  visible: boolean;
  /** 当前文档总行数,用于 placeholder 提示。 */
  totalLines: number;
  onClose: () => void;
  onGoToLine: (line: number, col?: number) => void;
};

/** 解析 "行号" 或 "行号:列号"(均 1-based);不合法输入返回 null。 */
export function parseGoToLineInput(input: string): { line: number; col?: number } | null {
  const match = input.trim().match(/^(\d+)(?::(\d+))?$/u);
  if (!match) return null;
  const line = Number(match[1]);
  if (!Number.isInteger(line) || line < 1) return null;
  if (match[2] === undefined) return { line };
  const col = Number(match[2]);
  if (!Number.isInteger(col) || col < 1) return null;
  return { line, col };
}

/**
 * 跳转到行弹窗(Typora Ctrl+G 惯例):输入行号(可选 :列号),
 * Enter 跳转、Esc 关闭。CM6 侧 Mod-g dispatch 'typola:goto-line',
 * AppLayout 监听后打开本弹窗。
 */
export function GoToLinePopover({ visible, totalLines, onClose, onGoToLine }: GoToLinePopoverProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setValue('');
    setError('');
    // 与 FindReplacePanel 相同的多段抢焦兜底(React commit 后首帧 + 50ms)。
    const grab = () => {
      inputRef.current?.focus();
    };
    grab();
    const raf = window.requestAnimationFrame(grab);
    const timer = window.setTimeout(grab, 50);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [visible]);

  if (!visible) return null;

  const submit = () => {
    const parsed = parseGoToLineInput(value);
    if (!parsed) {
      setError('请输入行号，如 12 或 12:34');
      return;
    }
    onGoToLine(parsed.line, parsed.col);
    onClose();
  };

  return (
    <div className="goto-line-popover" role="dialog" aria-label="跳转到行">
      <input
        ref={inputRef}
        className="goto-line-input"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setError('');
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            submit();
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          }
        }}
        placeholder={`行号 (1-${totalLines})`}
        aria-label="行号"
        aria-invalid={error !== ''}
      />
      <button type="button" className="goto-line-go" onClick={submit}>跳转</button>
      <button type="button" className="goto-line-close" onClick={onClose} aria-label="关闭" title="关闭 (Esc)">×</button>
      {error && <span className="goto-line-error" role="alert">{error}</span>}
    </div>
  );
}
