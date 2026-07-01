import { useCallback, useRef, useState } from 'react';
import {
  ChevronDown,
  Code2,
  FileDown,
  FilePlus,
  FileText,
  FolderOpen,
  PackageOpen,
  ImagePlus,
  Newspaper,
  PanelLeft,
  RefreshCw,
  Save,
  SaveAll,
  SlidersHorizontal,
  Terminal,
} from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  FloatingPortal,
  flip,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useRole,
} from '@floating-ui/react';
import { useSettings } from '../hooks/useSettings';
import { translate } from '../services/i18n';
import { handleTitlebarMouseDown } from '../services/titlebarDrag';
import { DocumentModeSwitcher } from './DocumentModeSwitcher';
import { Tooltip } from './ui/Tooltip';
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
  workspacePanelVisible: boolean;
  wordPreviewVisible: boolean;
  wechatPreviewVisible: boolean;
  artifactsVisible?: boolean;
  terminalVisible: boolean;
  editingDisabled: boolean;
  docMode: DocMode;
  reviewDirty?: boolean;
  onToggleEditorMode: () => void;
  onToggleWorkspacePanel: () => void;
  onToggleWordPreview: () => void;
  onToggleWechatPreview: () => void;
  onToggleArtifacts?: () => void;
  onToggleTerminal: () => void;
  onSetDocMode: (next: DocMode) => void;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onRename?: () => void;
  onInsertImage?: () => void;
  onExportPdf?: () => void;
  onExportWord?: () => void;
  pdfExporting?: boolean;
  wordExporting?: boolean;
  onOpenSettings: () => void;
  onPreloadSettings?: () => void;
  updateStatus?: UpdateToolbarStatus;
  onRestartUpdate?: () => void;
};

export function Toolbar({
  dirty, fileName,
  editorMode, workspacePanelVisible, wordPreviewVisible, wechatPreviewVisible, artifactsVisible,
  terminalVisible, editingDisabled, docMode, reviewDirty,
  onToggleEditorMode, onToggleWorkspacePanel, onToggleWordPreview, onToggleWechatPreview, onToggleArtifacts,
  onToggleTerminal, onSetDocMode,
  onNew, onOpen, onSave, onSaveAs, onRename, onInsertImage, onExportPdf, onExportWord,
  pdfExporting, wordExporting, onOpenSettings, onPreloadSettings, updateStatus, onRestartUpdate,
}: ToolbarProps) {
  const settings = useSettings();
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);
  const hasOpenedFile = fileName !== '未命名';
  const iconSize = 18;
  const strokeWidth = 1.6;

  // 导出下拉菜单(用 @floating-ui/react 挂到 body 规避 motion 引入后的 stacking trap)
  const exportTriggerRef = useRef<HTMLButtonElement>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exporting = pdfExporting || wordExporting;
  const exportFloating = useFloating({
    open: exportMenuOpen,
    onOpenChange: setExportMenuOpen,
    placement: 'bottom-end',
    middleware: [offset(4), flip({ padding: 8 }), shift({ padding: 8 })],
  });
  useClick(exportFloating.context);
  useDismiss(exportFloating.context);
  useRole(exportFloating.context, { role: 'menu' });
  const setExportButtonRef = useCallback((node: HTMLButtonElement | null) => {
    exportTriggerRef.current = node;
    exportFloating.refs.setReference(node);
  }, [exportFloating.refs.setReference]);

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
            <div className="toolbar-export-dropdown">
              <button
                ref={setExportButtonRef}
                data-no-window-drag="true"
                disabled={editingDisabled || exporting}
                data-tooltip={exporting ? '正在导出…' : '导出'}
                aria-label="导出"
                aria-expanded={exportMenuOpen}
                aria-haspopup="true"
              >
                <FileDown size={iconSize} strokeWidth={strokeWidth} />
                <ChevronDown size={10} strokeWidth={strokeWidth} className="export-chevron" />
              </button>
              <Tooltip
                label="导出"
                shortcut="⌘P / ⇧⌘E"
                reference={exportTriggerRef.current}
                placement="bottom"
              />
              {exportMenuOpen && (
                <FloatingPortal>
                  <div
                    ref={exportFloating.refs.setFloating}
                    style={{ ...exportFloating.floatingStyles, zIndex: 9999 }}
                    className="export-menu"
                    role="menu"
                    aria-label="导出格式"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      data-no-window-drag="true"
                      onClick={() => { setExportMenuOpen(false); onExportPdf(); }}
                      disabled={editingDisabled}
                    >
                      导出 PDF
                    </button>
                    {onExportWord && (
                      <button
                        type="button"
                        role="menuitem"
                        data-no-window-drag="true"
                        onClick={() => { setExportMenuOpen(false); onExportWord(); }}
                        disabled={editingDisabled}
                      >
                        导出 Word
                      </button>
                    )}
                  </div>
                </FloatingPortal>
              )}
            </div>
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
          {onToggleArtifacts && (
            <button
              className={artifactsVisible ? 'active' : ''}
              onClick={onToggleArtifacts}
              disabled={editingDisabled}
              data-no-window-drag="true"
              data-tooltip="AI 产物"
              aria-label="AI 产物"
            >
              <PackageOpen size={iconSize} strokeWidth={strokeWidth} />
            </button>
          )}
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

