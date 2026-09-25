import { useEffect, useRef, useState } from 'react';

type PromptDialogProps = {
  open: boolean;
  title: string;
  /** 受控初始值;open 变 true 时重置为该值。 */
  defaultValue: string;
  okLabel?: string;
  cancelLabel?: string;
  placeholder?: string;
  /** 返回 false 表示校验失败,对话框保持打开并显示 errorMessage。 */
  validate?: (value: string) => string | null;
  onSubmit: (value: string) => void;
  onCancel: () => void;
};

/**
 * 通用单输入对话框。dialogService 的 confirm/message/save 无文本输入能力,
 * 归档命名等场景复用本组件;样式复用 rename-dialog 系列类保持视觉一致。
 */
export function PromptDialog({
  open,
  title,
  defaultValue,
  okLabel = '确定',
  cancelLabel = '取消',
  placeholder,
  validate,
  onSubmit,
  onCancel,
}: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  const inputRef = useRef<HTMLInputElement>(null);

  // 打开瞬间重置为新的默认值。放在 render 阶段而非 useEffect:组件常驻挂载(关闭时 return null),
  // useEffect 要等首帧提交后才跑,会先画出上一次的默认值(或空值)闪一下。
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setValue(defaultValue);
      setError(null);
    }
  }

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  const submit = () => {
    const trimmed = value.trim();
    const message = validate?.(trimmed) ?? null;
    if (message) {
      setError(message);
      return;
    }
    onSubmit(trimmed);
  };

  return (
    <div className="rename-dialog-overlay" role="presentation" onClick={onCancel}>
      <form
        className="rename-dialog"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <h3>{title}</h3>
        <input
          ref={inputRef}
          autoFocus
          value={value}
          placeholder={placeholder}
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
          onFocus={() => inputRef.current?.select()}
        />
        {error && <p>{error}</p>}
        <div className="rename-dialog-actions">
          <button type="button" onClick={onCancel}>{cancelLabel}</button>
          <button type="submit">{okLabel}</button>
        </div>
      </form>
    </div>
  );
}
