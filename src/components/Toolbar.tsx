import {
  Code2,
  FilePlus,
  FileText,
  FolderOpen,
  ImagePlus,
  Newspaper,
  PanelLeft,
  Printer,
  RefreshCw,
  Save,
  SaveAll,
  SlidersHorizontal,
  Terminal,
} from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useSettings } from '../hooks/useSettings';
import { translate } from '../services/i18n';
import { handleTitlebarMouseDown } from '../services/titlebarDrag';
import { DocumentModeSwitcher } from './DocumentModeSwitcher';
import type { DocMode } from '../hooks/useDocumentMode';

export type EditorMode = 'wysiwyg' | 'source';

type UpdateToolbarStatus = {
  phase: 'ready' | 'installing';
  version: string;
};

type ToolbarProps = {
  dirty: boolean;
  fileName: string;
  editorMode: EditorMode;
  /** 左栏文件树是否可见(workspace) */
  workspacePanelVisible: boolean;
  wordPreviewVisible: boolean;
  wechatPreviewVisible: boolean;
  terminalVisible: boolean;
  editingDisabled: boolean;
  /** 文档三态(阅读/心流/检视)当前态 */
  docMode: DocMode;
  /** 当前文档是否有未保存的检视意见(用于切换器上的小红点) */
  reviewDirty?: boolean;
  onToggleEditorMode: () => void;
  onToggleWorkspacePanel: () => void;
  onToggleWordPreview: () => void;
  onToggleWechatPreview: () => void;
  onToggleTerminal: () => void;
  onSetDocMode: (next: DocMode) => void;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onRename?: () => void;
  /** 工具栏「插入图片」按钮:打开系统文件对话框选本地图片插入。 */
  onInsertImage?: () => void;
  onExportPdf?: () => void;
  pdfExporting?: boolean;
  onOpenSettings: () => void;
  onPreloadSettings?: () => void;
  updateStatus?: UpdateToolbarStatus;
  onRestartUpdate?: () => void;
};

export function Toolbar({
  dirty, fileName,
  editorMode, workspacePanelVisible, wordPreviewVisible, wechatPreviewVisible,
  terminalVisible, editingDisabled, docMode, reviewDirty,
  onToggleEditorMode, onToggleWorkspacePanel, onToggleWordPreview, onToggleWechatPreview,
  onToggleTerminal, onSetDocMode,
  onNew, onOpen, onSave, onSaveAs, onRename, onInsertImage, onExportPdf, pdfExporting, onOpenSettings, onPreloadSettings, updateStatus, onRestartUpdate,
}: ToolbarProps) {
  const settings = useSettings();
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);
  const hasOpenedFile = fileName !== '未命名';
  const iconSize = 18;
  const strokeWidth = 1.6;

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!('__TAURI_INTERNALS__' in window)) return;

    void handleTitlebarMouseDown(event.nativeEvent, getCurrentWindow())
      .catch((error) => console.warn('Failed to start window drag:', error));
  };

  return (
    <div
      className="app-toolbar"
      data-window-drag-fallback="manual"
      onMouseDownCapture={handleMouseDown}
    >
      <div className="toolbar-left">
        <div className="toolbar-group toolbar-nav-actions" aria-label="导航">
          <button
            data-no-window-drag="true"
            className={workspacePanelVisible ? 'active' : ''}
            onClick={onToggleWorkspacePanel}
            data-tooltip={workspacePanelVisible ? '收起文件树' : '打开文件树'}
            aria-label={workspacePanelVisible ? '收起文件树' : '打开文件树'}
          >
            <PanelLeft size={iconSize} strokeWidth={strokeWidth} />
          </button>
        </div>
        <div className="toolbar-group toolbar-file-actions" aria-label={t('toolbarFileGroup')}>
          <button data-no-window-drag="true" onClick={onNew} data-tooltip={t('toolbarNewTitle')} aria-label={t('toolbarNewLabel')}>
            <FilePlus size={iconSize} strokeWidth={strokeWidth} />
          </button>
          <button data-no-window-drag="true" onClick={onOpen} data-tooltip={t('toolbarOpenTitle')} aria-label={t('toolbarOpenLabel')}>
            <FolderOpen size={iconSize} strokeWidth={strokeWidth} />
          </button>
          <button data-no-window-drag="true" onClick={onSave} disabled={editingDisabled} data-tooltip={t('toolbarSaveTitle')} aria-label={t('toolbarSaveLabel')}>
            <Save size={iconSize} strokeWidth={strokeWidth} />
          </button>
          <button data-no-window-drag="true" onClick={onSaveAs} disabled={editingDisabled} data-tooltip={t('toolbarSaveAsTitle')} aria-label={t('toolbarSaveAsLabel')}>
            <SaveAll size={iconSize} strokeWidth={strokeWidth} />
          </button>
          {onInsertImage && (
            <button
              data-no-window-drag="true"
              onClick={onInsertImage}
              disabled={editingDisabled}
              data-tooltip="插入图片"
              aria-label="插入图片"
            >
              <ImagePlus size={iconSize} strokeWidth={strokeWidth} />
            </button>
          )}
          {onExportPdf && (
            <button
              data-no-window-drag="true"
              onClick={onExportPdf}
              disabled={editingDisabled || pdfExporting}
              data-tooltip={pdfExporting ? '正在导出 PDF…' : '导出 PDF（Cmd/Ctrl+P，快速打开改为 Cmd/Ctrl+Shift+P）'}
              aria-label="导出 PDF"
            >
              <Printer size={iconSize} strokeWidth={strokeWidth} />
            </button>
          )}
        </div>
      </div>
      <div className="toolbar-title" data-tauri-drag-region aria-label={t('currentFileLabel')}>
        <span className={`file-name ${hasOpenedFile || dirty ? 'visible' : ''}`}>
          {dirty && <span className="dirty-dot" />}
          <span
            className="file-name-text"
            title={onRename ? t('toolbarRenameTitle') : undefined}
            onDoubleClick={(event) => {
              event.stopPropagation();
              onRename?.();
            }}
          >
            {fileName}
          </span>
          {reviewDirty && <span className="dirty-dot" title="有未保存的检视意见" aria-label="未保存的检视意见" />}
        </span>
      </div>
      <div className="toolbar-spacer" data-tauri-drag-region aria-hidden="true" />
      <div className="toolbar-right">
        <div className="toolbar-group toolbar-view-actions" aria-label={t('toolbarViewGroup')}>
          {updateStatus && (
            <button
              className={`toolbar-update-button ${updateStatus.phase === 'installing' ? 'installing' : ''}`}
              onClick={onRestartUpdate}
              disabled={updateStatus.phase === 'installing'}
              data-no-window-drag="true"
              data-tooltip={
                updateStatus.phase === 'installing'
                  ? t('toolbarUpdateInstallingTitle')
                  : `${t('toolbarRestartUpdateTitle')} ${updateStatus.version}`
              }
              aria-label={
                updateStatus.phase === 'installing'
                  ? t('toolbarUpdateInstallingLabel')
                  : `${t('toolbarRestartUpdateLabel')} ${updateStatus.version}`
              }
            >
              <RefreshCw
                size={14}
                strokeWidth={strokeWidth}
                className={updateStatus.phase === 'installing' ? 'spinning' : ''}
              />
              <span>
                {updateStatus.phase === 'installing'
                  ? t('toolbarUpdateInstallingLabel')
                  : t('toolbarRestartUpdateLabel')}
              </span>
            </button>
          )}
          <button
            className={editorMode === 'source' ? 'active' : ''}
            onClick={onToggleEditorMode}
            disabled={editingDisabled}
            data-no-window-drag="true"
            data-tooltip={t('toolbarSourceTitle')}
            aria-label={t('toolbarSourceLabel')}
          >
            <Code2 size={iconSize} strokeWidth={strokeWidth} />
          </button>
          <button
            className={wordPreviewVisible ? 'active' : ''}
            onClick={onToggleWordPreview}
            disabled={editingDisabled}
            data-no-window-drag="true"
            data-tooltip={t('toolbarWordPreviewTitle')}
            aria-label={t('toolbarWordPreviewLabel')}
          >
            <FileText size={iconSize} strokeWidth={strokeWidth} />
          </button>
          <button
            className={wechatPreviewVisible ? 'active' : ''}
            onClick={onToggleWechatPreview}
            disabled={editingDisabled}
            data-no-window-drag="true"
            data-tooltip={t('toolbarWechatPreviewTitle')}
            aria-label={t('toolbarWechatPreviewLabel')}
          >
            {/* lucide 无 wechat 品牌图标,沿用 Newspaper(评审已确认) */}
            <Newspaper size={iconSize} strokeWidth={strokeWidth} />
          </button>
          <button
            className={terminalVisible ? 'active' : ''}
            onClick={onToggleTerminal}
            data-no-window-drag="true"
            data-tooltip={t('toolbarTerminalTitle')}
            aria-label={t('toolbarTerminalLabel')}
          >
            <Terminal size={iconSize} strokeWidth={strokeWidth} />
          </button>
        </div>
        <div className="toolbar-group toolbar-navigation-actions" aria-label={t('toolbarNavGroup')}>
          <button
            data-no-window-drag="true"
            className="toolbar-settings-btn"
            onPointerEnter={onPreloadSettings}
            onFocus={onPreloadSettings}
            onClick={onOpenSettings}
            data-tooltip={t('toolbarSettingsTitle')}
            aria-label={t('toolbarSettingsLabel')}
          >
            <SlidersHorizontal size={iconSize} strokeWidth={strokeWidth} />
          </button>
        </div>
        <div className="toolbar-group toolbar-mode-group" aria-label="文档模式">
          <DocumentModeSwitcher
            mode={docMode}
            onChange={onSetDocMode}
            disabled={editingDisabled}
          />
        </div>
      </div>
    </div>
  );
}

