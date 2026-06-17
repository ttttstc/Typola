import { useEffect, useState } from 'react';
import { FileText, Presentation, X } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { PreviewPane } from './PreviewPane';

export type ArtifactItem = {
  path: string;
  name: string;
  ts: number;
  kind: 'markdown' | 'html' | 'text' | 'other';
};

type ArtifactPreviewProps = {
  artifacts: ArtifactItem[];
  onOpenFile?: (path: string) => void;
  onClose?: () => void;
};

function iconFor(kind: ArtifactItem['kind']) {
  if (kind === 'html') return <Presentation size={13} />;
  return <FileText size={13} />;
}

export function ArtifactPreview({ artifacts, onOpenFile, onClose }: ArtifactPreviewProps) {
  const [activePath, setActivePath] = useState<string | null>(null);
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (artifacts.length === 0) {
      setActivePath(null);
      setContent('');
      return;
    }
    if (!activePath || !artifacts.some((a) => a.path === activePath)) {
      setActivePath(artifacts[0].path);
    }
  }, [artifacts, activePath]);

  useEffect(() => {
    if (!activePath) return;
    const item = artifacts.find((a) => a.path === activePath);
    if (!item) return;
    setLoading(true);
    setContent('');
    let cancelled = false;
    void invoke<string>('read_opened_document', { path: activePath })
      .then((bytes) => {
        if (cancelled) return;
        try {
          const decoder = new TextDecoder('utf-8');
          const text = decoder.decode(new Uint8Array([...bytes].map((b) => typeof b === 'string' ? b.charCodeAt(0) : b)));
          setContent(text);
        } catch {
          setContent(String(bytes));
        }
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setContent(`加载失败: ${e}`);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [activePath, artifacts]);

  const activeItem = artifacts.find((a) => a.path === activePath) ?? null;

  if (artifacts.length === 0) {
    return (
      <div className="artifact-preview">
        <div className="artifact-empty">
          <p>暂无产物</p>
          <p className="artifact-hint">Claude 改动的文件会出现在这里</p>
        </div>
      </div>
    );
  }

  return (
    <div className="artifact-preview">
      <div className="artifact-chips">
        {artifacts.map((item) => (
          <button
            key={item.path}
            type="button"
            className={`artifact-chip ${item.path === activePath ? 'active' : ''}`}
            onClick={() => setActivePath(item.path)}
            onDoubleClick={() => {
              if (onOpenFile) onOpenFile(item.path);
              else setActivePath(item.path);
            }}
            title={onOpenFile ? `${item.path}\n双击在主编辑器打开` : item.path}
          >
            <span className="artifact-chip-icon">{iconFor(item.kind)}</span>
            <span className="artifact-chip-name">{item.name}</span>
          </button>
        ))}
        {onClose && (
          <button type="button" className="artifact-clear" onClick={onClose} title="清除本次产物">
            <X size={12} />
          </button>
        )}
      </div>
      <div className="artifact-render">
        {loading ? (
          <div className="artifact-loading">加载中...</div>
        ) : activeItem?.kind === 'html' ? (
          <iframe
            className="artifact-iframe"
            sandbox="allow-scripts"
            title={activeItem.name}
            srcDoc={content}
          />
        ) : activeItem?.kind === 'markdown' ? (
          // P1-F:复用主预览的 Vditor 渲染管线(spec §6.2),不再出裸 <pre> 源码
          <PreviewPane
            source={content}
            tocIds={[]}
            filePath={activeItem.path}
          />
        ) : (
          <pre className="artifact-text">{content}</pre>
        )}
      </div>
    </div>
  );
}
