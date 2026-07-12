import { useEffect, useRef, useState } from 'react';
import { useDismissableDialog } from './useDismissableDialog';

export type Cm6EditRequest =
  | { kind: 'link'; x: number; y: number; label: string; url: string; title: string; apply: (value: { label: string; url: string; title: string }) => void }
  | { kind: 'code'; x: number; y: number; language: string; apply: (language: string) => void };

export function Cm6EditPopover({ request, onClose }: { request: Cm6EditRequest | null; onClose: () => void }) {
  const firstInput = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState({ label: '', url: '', title: '', language: '' });
  useDismissableDialog(request !== null, onClose);
  useEffect(() => {
    if (!request) return;
    setValues(request.kind === 'link'
      ? { label: request.label, url: request.url, title: request.title, language: '' }
      : { label: '', url: '', title: '', language: request.language });
    window.requestAnimationFrame(() => firstInput.current?.focus());
  }, [request]);
  if (!request) return null;
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (request.kind === 'link') {
      if (!values.url.trim()) return;
      request.apply({ label: values.label.trim(), url: values.url.trim(), title: values.title.trim() });
    } else request.apply(values.language.trim());
    onClose();
  };
  return (
    <form className="cm6-edit-popover" role="dialog" aria-label={request.kind === 'link' ? '编辑链接' : '编辑代码语言'} style={{ left: request.x, top: request.y }} onSubmit={submit}>
      {request.kind === 'link' ? <>
        <label>文字<input ref={firstInput} value={values.label} onChange={(event) => setValues({ ...values, label: event.target.value })} /></label>
        <label>网址<input value={values.url} required onChange={(event) => setValues({ ...values, url: event.target.value })} /></label>
        <label>标题<input value={values.title} onChange={(event) => setValues({ ...values, title: event.target.value })} /></label>
      </> : <label>代码语言<input ref={firstInput} value={values.language} placeholder="例如 ts" onChange={(event) => setValues({ ...values, language: event.target.value })} /></label>}
      <div className="cm6-edit-popover-actions"><button type="button" onClick={onClose}>取消</button><button type="submit">保存</button></div>
    </form>
  );
}
