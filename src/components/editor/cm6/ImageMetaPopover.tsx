import { useEffect, useRef, useState } from 'react';

export type ImageMetaRequest = { x: number; y: number; alt: string; title: string; width: string; onSave: (value: { alt: string; title: string; width: string }) => void };

export function ImageMetaPopover({ request, onClose }: { request: ImageMetaRequest | null; onClose: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState({ alt: '', title: '', width: '' });
  useEffect(() => { if (request) { setValue({ alt: request.alt, title: request.title, width: request.width }); window.requestAnimationFrame(() => input.current?.focus()); } }, [request]);
  if (!request) return null;
  return <form className="cm6-edit-popover" role="dialog" aria-label="编辑图片信息" style={{ left: request.x, top: request.y }} onSubmit={(event) => { event.preventDefault(); if (value.width && !/^\d+(?:\.\d+)?(?:px|%)$/u.test(value.width)) return; request.onSave(value); onClose(); }}>
    <label>替代文字<input ref={input} value={value.alt} onChange={(event) => setValue({ ...value, alt: event.target.value })} /></label>
    <label>标题<input value={value.title} onChange={(event) => setValue({ ...value, title: event.target.value })} /></label>
    <label>宽度（px 或 %）<input value={value.width} placeholder="50%" onChange={(event) => setValue({ ...value, width: event.target.value })} /></label>
    <div className="cm6-edit-popover-actions"><button type="button" onClick={onClose}>取消</button><button type="submit">保存</button></div>
  </form>;
}
