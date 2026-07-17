import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ExternalLink, RefreshCw, X } from 'lucide-react';
import { buildHtmlPreviewDocumentWithLocalResources } from '../services/htmlPreviewService';

export type HtmlPreviewPaneProps = {
  filePath: string;
  fileName?: string;
  onBackToArtifacts: () => void;
  onClose: () => void;
};

type HtmlPreviewStatus = 'idle' | 'loading' | 'ready' | 'error' | 'empty';

type HtmlPreviewState = {
  status: HtmlPreviewStatus;
  srcDoc: string;
  errorMessage?: string;
  lastLoadedAt?: number;
};

const STATUS_LABELS: Record<HtmlPreviewStatus, string> = {
  idle: '',
  loading: '正在加载 HTML 预览...',
  ready: '已加载',
  error: '预览失败，请尝试在浏览器中打开。',
  empty: 'HTML 内容为空。',
};

// iframe sandbox:允许 scripts/forms/modals/popups/presentation,
// 但不给 same-origin,避免预览内容获得主窗口的能力面。
const IFRAME_SANDBOX = 'allow-scripts allow-forms allow-modals allow-popups allow-presentation';

function dirname(path: string): string {
  const normalized = path.replaceAll('\\', '/');
  const index = normalized.lastIndexOf('/');
  return index >= 0 ? path.slice(0, index) : '';
}

export function HtmlPreviewPane({
  filePath,
  fileName,
  onBackToArtifacts,
  onClose,
}: HtmlPreviewPaneProps) {
  const [state, setState] = useState<HtmlPreviewState>({ status: 'idle', srcDoc: '' });

  const loadPreview = useCallback(async () => {
    setState((prev) => ({ ...prev, status: 'loading' }));
    try {
      // 1. 先把 HTML 所在目录动态加进 fs scope,允许 plugin-fs 读本地资源。
      //    capabilities 里的 fs:scope 是固定路径集,AI 工作区可能落在用户任意目录,
      //    需要在这里显式 allow 才能跨 scope 边界。
      const dir = dirname(filePath);
      if (dir) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          await invoke('allow_fs_directory', { dir });
        } catch (allowError) {
          // 允许 scope 失败不阻断主流程,后面真正 readTextFile 失败时再交给 error 态。
          console.warn('Failed to allow html preview directory:', allowError);
        }
      }
      const [{ readTextFile, readFile }] = await Promise.all([
        import('@tauri-apps/plugin-fs'),
      ]);
      const source = await readTextFile(filePath);
      if (!source.trim()) {
        setState({ status: 'empty', srcDoc: '' });
        return;
      }
      const srcDoc = await buildHtmlPreviewDocumentWithLocalResources(source, {
        filePath,
        readFile,
      });
      setState({ status: 'ready', srcDoc, lastLoadedAt: Date.now() });
    } catch (error) {
      setState({
        status: 'error',
        srcDoc: '',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }, [filePath]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const handleOpenInBrowser = useCallback(async () => {
    try {
      // 走自定义 open_path_external 命令而不是 plugin-opener 的 openPath,
      // 绕开 opener:scope — opener 的 Scope::is_path_allowed 用
      // std::fs::canonicalize 把绝对路径变成 Windows device path(\\\\?\\D:\\...),
      // 跟 capabilities 里 $HOME/$DESKTOP 等 glob 永远匹配不上,
      // 报「Not allowed to open path \\\\?\\D」错误。
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('open_path_external', { path: filePath });
    } catch (error) {
      console.warn('Failed to open HTML in browser:', error);
    }
  }, [filePath]);

  const displayName = fileName ?? filePath.split(/[\\/]/).pop() ?? filePath;
  const statusText = STATUS_LABELS[state.status];

  return (
    <aside className="html-preview-pane" aria-label="HTML 预览">
      <div className="html-preview-toolbar">
        <button
          type="button"
          className="html-preview-back"
          onClick={onBackToArtifacts}
          aria-label="返回产物中心"
          title="返回产物中心"
        >
          <ArrowLeft size={14} />
          <span>产物中心</span>
        </button>
        <div className="html-preview-heading">
          <span>HTML 预览</span>
          <small>{displayName}</small>
        </div>
        <div className="html-preview-actions">
          <button
            type="button"
            className="settings-action-button"
            onClick={() => void loadPreview()}
            disabled={state.status === 'loading'}
            aria-label="刷新"
            title="重新读取 HTML 文件并刷新预览"
          >
            <RefreshCw size={13} />
            <span>刷新</span>
          </button>
          <button
            type="button"
            className="settings-action-button"
            onClick={() => void handleOpenInBrowser()}
            aria-label="在浏览器打开"
            title="使用系统默认浏览器打开"
          >
            <ExternalLink size={13} />
            <span>浏览器</span>
          </button>
          <button
            type="button"
            className="settings-action-button"
            onClick={onClose}
            aria-label="关闭预览"
            title="关闭右侧预览"
          >
            <X size={13} />
            <span>关闭</span>
          </button>
        </div>
      </div>
      <div
        className={`html-preview-status html-preview-status-${state.status}`}
        role="status"
        aria-live="polite"
      >
        {statusText}
        {state.status === 'error' && state.errorMessage && (
          <div className="html-preview-error-detail" title={state.errorMessage}>
            {state.errorMessage}
          </div>
        )}
      </div>
      {state.status === 'ready' && (
        <iframe
          key={state.lastLoadedAt ?? 0}
          className="html-preview-frame"
          title={`HTML 预览:${displayName}`}
          sandbox={IFRAME_SANDBOX}
          srcDoc={state.srcDoc}
        />
      )}
    </aside>
  );
}
