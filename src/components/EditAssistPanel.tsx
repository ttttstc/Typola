import { useState } from 'react';

type EditAssistPanelProps = {
  visible: boolean;
  readOnly: boolean;
  onClose: () => void;
  onInsertLink: (label: string, url: string) => void;
  onInsertImage: (alt: string, path: string) => void;
  onInsertTable: (rows: number, columns: number) => void;
};

export function EditAssistPanel({
  visible,
  readOnly,
  onClose,
  onInsertLink,
  onInsertImage,
  onInsertTable,
}: EditAssistPanelProps) {
  const [linkLabel, setLinkLabel] = useState('链接文字');
  const [linkUrl, setLinkUrl] = useState('https://');
  const [imageAlt, setImageAlt] = useState('图片描述');
  const [imagePath, setImagePath] = useState('./assets/image.png');
  const [rows, setRows] = useState(3);
  const [columns, setColumns] = useState(3);

  if (!visible) return null;

  return (
    <div className="edit-assist-overlay" role="dialog" aria-label="编辑辅助" onMouseDown={onClose}>
      <div className="edit-assist-panel" onMouseDown={(event) => event.stopPropagation()}>
        <div className="edit-assist-header">
          <strong>编辑辅助</strong>
          <button type="button" onClick={onClose} aria-label="关闭编辑辅助">×</button>
        </div>
        <section className="edit-assist-section">
          <label>链接文字<input value={linkLabel} onChange={(event) => setLinkLabel(event.target.value)} /></label>
          <label>链接地址<input value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} /></label>
          <button type="button" disabled={readOnly} onClick={() => onInsertLink(linkLabel, linkUrl)}>插入链接</button>
        </section>
        <section className="edit-assist-section">
          <label>图片描述<input value={imageAlt} onChange={(event) => setImageAlt(event.target.value)} /></label>
          <label>图片路径<input value={imagePath} onChange={(event) => setImagePath(event.target.value)} /></label>
          <button type="button" disabled={readOnly} onClick={() => onInsertImage(imageAlt, imagePath)}>插入图片</button>
        </section>
        <section className="edit-assist-section edit-assist-grid">
          <label>行数<input type="number" min={2} max={12} value={rows} onChange={(event) => setRows(Number(event.target.value))} /></label>
          <label>列数<input type="number" min={2} max={8} value={columns} onChange={(event) => setColumns(Number(event.target.value))} /></label>
          <button type="button" disabled={readOnly} onClick={() => onInsertTable(rows, columns)}>插入表格</button>
        </section>
      </div>
    </div>
  );
}
