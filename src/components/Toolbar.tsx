import { useCallback, useState } from 'react';
import {
  ChevronDown,
  Bold,
  Code2,
  FileDown,
  FilePlus,
  FileText,
  FolderDown,
  FolderOpen,
  PackageOpen,
  Paintbrush,
  ImagePlus,
  Italic,
  Link,
  List,
  ListOrdered,
  ListTodo,
  ListTree,
  Newspaper,
  PanelLeft,
  Save,
  SaveAll,
  SlidersHorizontal,
  Table2,
  Terminal,
  Quote,
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
  useInteractions,
  useRole,
} from '@floating-ui/react';
import { useSettings } from '../hooks/useSettings';
import { translate } from '../services/i18n';
import { handleTitlebarMouseDown } from '../services/titlebarDrag';
import { DocumentModeSwitcher } from './DocumentModeSwitcher';
import { Tooltip } from './ui/Tooltip';
import type { DocMode } from '../hooks/useDocumentMode';
import type { FormatAction } from './EditorContextMenu';
import { DefineColorToolbarButton } from './defineColor/DefineColorToolbarButton';

export type EditorMode = 'wysiwyg' | 'source';

type ToolbarProps = {
  editorMode: EditorMode;
  workspacePanelVisible: boolean;
  wordPreviewVisible: boolean;
  wechatPreviewVisible: boolean;
  artifactsVisible?: boolean;
  terminalVisible: boolean;
  editingDisabled: boolean;
  docMode: DocMode;
  onToggleEditorMode: () => void;
  onFormat?: (action: FormatAction) => void;
  onToggleWorkspacePanel: () => void;
  onToggleWordPreview: () => void;
  onToggleWechatPreview: () => void;
  onToggleArtifacts?: () => void;
  onToggleTerminal: () => void;
  onOpenToc?: () => void;
  onSetDocMode: (next: DocMode) => void;
  onNew: () => void;
  onOpen: () => void;
  onOpenFolder?: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onInsertImage?: () => void;
  onExportPdf?: () => void;
  onExportWord?: () => void;
  pdfExporting?: boolean;
  wordExporting?: boolean;
  onOpenSettings: () => void;
  onPreloadSettings?: () => void;
};

export function Toolbar({
  editorMode, workspacePanelVisible, wordPreviewVisible, wechatPreviewVisible, artifactsVisible,
  terminalVisible, editingDisabled, docMode,
  onToggleEditorMode, onFormat, onToggleWorkspacePanel, onToggleWordPreview, onToggleWechatPreview, onToggleArtifacts,
  onToggleTerminal, onOpenToc, onSetDocMode,
  onNew, onOpen, onOpenFolder, onSave, onSaveAs, onInsertImage, onExportPdf, onExportWord,
  pdfExporting, wordExporting, onOpenSettings, onPreloadSettings,
}: ToolbarProps) {
  const settings = useSettings();
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);
  const iconSize = 18;
  const strokeWidth = 1.6;
  const workspacePanelTooltip = workspacePanelVisible ? t('toolbarCollapseFileTree') : t('toolbarOpenFileTree');
  const [toolbarTooltip, setToolbarTooltip] = useState<{ label: string; reference: HTMLElement } | null>(null);
  const handleToolbarTooltipOver = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('button[data-tooltip]');
    if (!button || !event.currentTarget.contains(button)) return;
    const label = button.dataset.tooltip;
    if (!label) return;
    setToolbarTooltip({ label, reference: button });
  }, []);
  const handleToolbarTooltipFocus = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('button[data-tooltip]');
    const label = button?.dataset.tooltip;
    if (!button || !label) return;
    setToolbarTooltip({ label, reference: button });
  }, []);
  const clearToolbarTooltip = useCallback(() => setToolbarTooltip(null), []);

  // 导出下拉菜单(用 @floating-ui/react 挂到 body 规避 motion 引入后的 stacking trap)
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exporting = pdfExporting || wordExporting;
  const exportFloating = useFloating({
    open: exportMenuOpen,
    onOpenChange: setExportMenuOpen,
    placement: 'bottom-end',
    middleware: [offset(4), flip({ padding: 8 }), shift({ padding: 8 })],
  });
  const exportClick = useClick(exportFloating.context);
  const exportDismiss = useDismiss(exportFloating.context);
  const exportRole = useRole(exportFloating.context, { role: 'menu' });
  const { getReferenceProps: getExportReferenceProps, getFloatingProps: getExportFloatingProps } = useInteractions([
    exportClick,
    exportDismiss,
    exportRole,
  ]);
  const setExportButtonRef = useCallback((node: HTMLButtonElement | null) => {
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
      onPointerOverCapture={handleToolbarTooltipOver}
      onPointerLeave={clearToolbarTooltip}
      onFocusCapture={handleToolbarTooltipFocus}
      onBlurCapture={clearToolbarTooltip}
    >
      <div className="toolbar-left">
        <div className="toolbar-group toolbar-nav-actions" aria-label="导航">
          <button
            data-no-window-drag="true"
            className={workspacePanelVisible ? 'active' : ''}
            onClick={onToggleWorkspacePanel}
            data-tooltip={workspacePanelTooltip}
            aria-label={workspacePanelTooltip}
          >
            <PanelLeft size={iconSize} strokeWidth={strokeWidth} />
          </button>
          <DefineColorToolbarButton settings={settings} />
          {onOpenToc && (
            <button data-no-window-drag="true" onClick={onOpenToc} title={t('openTocHint')} data-tooltip={t('openTocHint')} aria-label={t('openTocHint')}>
              <ListTree size={iconSize} strokeWidth={strokeWidth} />
            </button>
          )}
        </div>
        <div className="toolbar-group toolbar-file-actions" aria-label={t('toolbarFileGroup')}>
          <button data-no-window-drag="true" onClick={onNew} data-tooltip={t('toolbarNewLabel')} aria-label={t('toolbarNewLabel')}>
            <FilePlus size={iconSize} strokeWidth={strokeWidth} />
          </button>
          <button data-no-window-drag="true" onClick={onOpen} title={t('toolbarOpenTitle')} data-tooltip={t('toolbarOpenLabel')} aria-label={t('toolbarOpenLabel')}>
            <FolderDown size={iconSize} strokeWidth={strokeWidth} />
          </button>
          {onOpenFolder && (
            <button data-no-window-drag="true" onClick={onOpenFolder} data-tooltip={t('toolbarOpenFolderTitle')} aria-label={t('toolbarOpenFolderLabel')}>
              <FolderOpen size={iconSize} strokeWidth={strokeWidth} />
            </button>
          )}
          <button data-no-window-drag="true" onClick={onSave} disabled={editingDisabled} title={t('toolbarSaveTitle')} data-tooltip={t('toolbarSaveLabel')} aria-label={t('toolbarSaveLabel')}>
            <Save size={iconSize} strokeWidth={strokeWidth} />
          </button>
          <button data-no-window-drag="true" onClick={onSaveAs} disabled={editingDisabled} title={t('toolbarSaveAsTitle')} data-tooltip={t('toolbarSaveAsLabel')} aria-label={t('toolbarSaveAsLabel')}>
            <SaveAll size={iconSize} strokeWidth={strokeWidth} />
          </button>
          {onFormat && (
            <button
              data-no-window-drag="true"
              onClick={() => onFormat({ type: 'table-insert', rows: 2, cols: 3 })}
              disabled={editingDisabled}
              data-tooltip={t('toolbarInsertTableLabel')}
              aria-label={t('toolbarInsertTableLabel')}
            >
              <Table2 size={iconSize} strokeWidth={strokeWidth} />
            </button>
          )}
          {onInsertImage && (
            <button
              data-no-window-drag="true"
              onClick={onInsertImage}
              disabled={editingDisabled}
              data-tooltip={t('toolbarInsertImageLabel')}
              aria-label={t('toolbarInsertImageLabel')}
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
                aria-label={t('toolbarExportLabel')}
                data-tooltip={t('toolbarExportLabel')}
                aria-expanded={exportMenuOpen}
                aria-haspopup="true"
                {...getExportReferenceProps()}
              >
                <FileDown size={iconSize} strokeWidth={strokeWidth} />
                <ChevronDown size={10} strokeWidth={strokeWidth} className="export-chevron" />
              </button>
              {exportMenuOpen && (
                <FloatingPortal>
                  <div
                    ref={exportFloating.refs.setFloating}
                    style={{ ...exportFloating.floatingStyles, zIndex: 9999 }}
                    className="export-menu"
                    role="menu"
                    aria-label={t('toolbarExportMenuLabel')}
                    {...getExportFloatingProps()}
                  >
                    <button
                      type="button"
                      role="menuitem"
                      data-no-window-drag="true"
                      onClick={() => { setExportMenuOpen(false); onExportPdf(); }}
                      disabled={editingDisabled}
                    >
                      {t('toolbarExportPdfLabel')}
                    </button>
                    {onExportWord && (
                      <button
                        type="button"
                        role="menuitem"
                        data-no-window-drag="true"
                        onClick={() => { setExportMenuOpen(false); onExportWord(); }}
                        disabled={editingDisabled}
                      >
                        {t('toolbarExportWordLabel')}
                      </button>
                    )}
                  </div>
                </FloatingPortal>
              )}
            </div>
          )}
        </div>
        {onFormat && (
          <div className="toolbar-group toolbar-format-actions" aria-label="Markdown 格式">
            <button data-no-window-drag="true" disabled={editingDisabled} onClick={() => onFormat({ type: 'bold' })} data-tooltip="加粗 (Ctrl+B)" aria-label="加粗"><Bold size={iconSize} strokeWidth={strokeWidth} /></button>
            <button data-no-window-drag="true" disabled={editingDisabled} onClick={() => onFormat({ type: 'italic' })} data-tooltip="斜体 (Ctrl+I)" aria-label="斜体"><Italic size={iconSize} strokeWidth={strokeWidth} /></button>
            <button data-no-window-drag="true" disabled={editingDisabled} onClick={() => onFormat({ type: 'link' })} data-tooltip="链接" aria-label="链接"><Link size={iconSize} strokeWidth={strokeWidth} /></button>
            <button data-no-window-drag="true" disabled={editingDisabled} onClick={() => onFormat({ type: 'quote' })} data-tooltip="引用块" aria-label="引用块"><Quote size={iconSize} strokeWidth={strokeWidth} /></button>
            <button data-no-window-drag="true" disabled={editingDisabled} onClick={() => onFormat({ type: 'ul' })} data-tooltip="无序列表" aria-label="无序列表"><List size={iconSize} strokeWidth={strokeWidth} /></button>
            <button data-no-window-drag="true" disabled={editingDisabled} onClick={() => onFormat({ type: 'ol' })} data-tooltip="有序列表" aria-label="有序列表"><ListOrdered size={iconSize} strokeWidth={strokeWidth} /></button>
            <button data-no-window-drag="true" disabled={editingDisabled} onClick={() => onFormat({ type: 'task' })} data-tooltip="任务列表" aria-label="任务列表"><ListTodo size={iconSize} strokeWidth={strokeWidth} /></button>
            <button data-no-window-drag="true" disabled={editingDisabled} onClick={() => onFormat({ type: 'format-painter' })} data-tooltip="格式刷" aria-label="格式刷"><Paintbrush size={iconSize} strokeWidth={strokeWidth} /></button>
          </div>
        )}
      </div>
      <div className="toolbar-title" data-tauri-drag-region aria-hidden="true" />
      <div className="toolbar-spacer" data-tauri-drag-region aria-hidden="true" />
      <div className="toolbar-right">
        <div className="toolbar-group toolbar-view-actions" aria-label={t('toolbarViewGroup')}>
          <button
            className={editorMode === 'source' ? 'active' : ''}
            title={t('toolbarSourceTitle')}
            onClick={onToggleEditorMode}
            disabled={editingDisabled}
            data-no-window-drag="true"
            data-tooltip={t('toolbarSourceLabel')}
            aria-label={t('toolbarSourceLabel')}
          >
            <Code2 size={iconSize} strokeWidth={strokeWidth} />
          </button>
          <button
            className={wordPreviewVisible ? 'active' : ''}
            title={t('toolbarWordPreviewTitle')}
            onClick={onToggleWordPreview}
            disabled={editingDisabled}
            data-no-window-drag="true"
            data-tooltip={t('toolbarWordPreviewLabel')}
            aria-label={t('toolbarWordPreviewLabel')}
          >
            <FileText size={iconSize} strokeWidth={strokeWidth} />
          </button>
          <button
            className={wechatPreviewVisible ? 'active' : ''}
            title={t('toolbarWechatPreviewTitle')}
            onClick={onToggleWechatPreview}
            disabled={editingDisabled}
            data-no-window-drag="true"
            data-tooltip={t('toolbarWechatPreviewLabel')}
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
              data-tooltip={t('toolbarArtifactsLabel')}
              aria-label={t('toolbarArtifactsLabel')}
            >
              <PackageOpen size={iconSize} strokeWidth={strokeWidth} />
            </button>
          )}
          <button
            className={terminalVisible ? 'active' : ''}
            onClick={onToggleTerminal}
            data-no-window-drag="true"
            data-tooltip={t('toolbarTerminalLabel')}
            aria-label={t('toolbarTerminalLabel')}
          >
            <Terminal size={iconSize} strokeWidth={strokeWidth} />
          </button>
        </div>
        <div className="toolbar-group toolbar-navigation-actions" aria-label={t('toolbarNavGroup')}>
          <button
            data-no-window-drag="true"
            className="toolbar-settings-btn"
            title={t('toolbarSettingsTitle')}
            onPointerEnter={onPreloadSettings}
            onFocus={onPreloadSettings}
            onClick={onOpenSettings}
            data-tooltip={t('toolbarSettingsLabel')}
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
      <Tooltip
        label={toolbarTooltip?.label ?? ''}
        reference={toolbarTooltip?.reference ?? null}
        placement="bottom"
        open={toolbarTooltip !== null}
      />
    </div>
  );
}

