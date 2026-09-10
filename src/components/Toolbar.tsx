import { useCallback, useRef, useState, type ReactNode } from 'react';
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
  PanelRightClose,
  PanelRightOpen,
  Save,
  SaveAll,
  SlidersHorizontal,
  Table2,
  Terminal,
  Quote,
} from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  FloatingFocusManager,
  FloatingPortal,
  flip,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useListNavigation,
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

const TOOLBAR_ICON_SIZE = 18;
const TOOLBAR_STROKE_WIDTH = 1.6;

type SplitMenuItem = {
  key: string;
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  onSelect: () => void;
};

type ToolbarSplitMenuProps = {
  mainLabel: string;
  mainIcon: ReactNode;
  onMainClick: () => void;
  mainDisabled?: boolean;
  chevronLabel: string;
  items: SplitMenuItem[];
};

/**
 * 工具栏分组按钮：同类动作共用一个槽位。
 * 主按钮直连高频动作（打开/保存/插入表格），chevron 下拉收纳低频同类项
 * （打开文件夹/另存为/插入图片），功能不丢、工具栏更窄。
 * items 为空时退化为普通单按钮（等价于原独立按钮）。
 */
function ToolbarSplitMenu({ mainLabel, mainIcon, onMainClick, mainDisabled, chevronLabel, items }: ToolbarSplitMenuProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const listRef = useRef<Array<HTMLButtonElement | null>>([]);
  const floating = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'bottom-start',
    middleware: [offset(4), flip({ padding: 8 }), shift({ padding: 8 })],
  });
  const click = useClick(floating.context);
  const dismiss = useDismiss(floating.context);
  const role = useRole(floating.context, { role: 'menu' });
  // 键盘可达性:菜单打开后首项聚焦、ArrowUp/ArrowDown 在菜单项间移动,
  // Esc/outside 关闭后由 FloatingFocusManager 把焦点还给 chevron trigger。
  const listNavigation = useListNavigation(floating.context, {
    listRef,
    activeIndex,
    onNavigate: setActiveIndex,
    loop: true,
  });
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role, listNavigation]);
  const setReferenceRef = useCallback((node: HTMLButtonElement | null) => {
    floating.refs.setReference(node);
  }, [floating.refs.setReference]);

  if (items.length === 0) {
    return (
      <button
        data-no-window-drag="true"
        onClick={onMainClick}
        disabled={mainDisabled}
        data-tooltip={mainLabel}
        aria-label={mainLabel}
      >
        {mainIcon}
      </button>
    );
  }

  return (
    <div className="toolbar-split">
      <button
        data-no-window-drag="true"
        className="split-main"
        onClick={onMainClick}
        disabled={mainDisabled}
        data-tooltip={mainLabel}
        aria-label={mainLabel}
      >
        {mainIcon}
      </button>
      <button
        ref={setReferenceRef}
        data-no-window-drag="true"
        className="split-chevron"
        data-tooltip={chevronLabel}
        aria-label={chevronLabel}
        aria-expanded={open}
        aria-haspopup="true"
        disabled={mainDisabled}
        {...getReferenceProps()}
      >
        <ChevronDown size={10} strokeWidth={TOOLBAR_STROKE_WIDTH} className="split-chevron-icon" />
      </button>
      {open && (
        <FloatingPortal>
          <FloatingFocusManager context={floating.context} initialFocus={0}>
            <div
              ref={floating.refs.setFloating}
              style={floating.floatingStyles}
              className="export-menu"
              role="menu"
              aria-label={chevronLabel}
              {...getFloatingProps()}
            >
              {items.map((item, index) => (
                <button
                  key={item.key}
                  ref={(node) => { listRef.current[index] = node; }}
                  type="button"
                  role="menuitem"
                  data-no-window-drag="true"
                  disabled={item.disabled}
                  onClick={() => { setOpen(false); item.onSelect(); }}
                >
                  <span className="export-menu-icon" aria-hidden="true">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </div>
  );
}

type ToolbarProps = {
  editorMode: EditorMode;
  workspacePanelVisible: boolean;
  wordPreviewVisible: boolean;
  wechatPreviewVisible: boolean;
  artifactsVisible?: boolean;
  rightPanelAvailable: boolean;
  rightPanelCollapsed: boolean;
  terminalVisible: boolean;
  editingDisabled: boolean;
  docMode: DocMode;
  onToggleEditorMode: () => void;
  onFormat?: (action: FormatAction) => void;
  onToggleWorkspacePanel: () => void;
  onToggleWordPreview: () => void;
  onToggleWechatPreview: () => void;
  onToggleArtifacts?: () => void;
  onToggleRightPanel: () => void;
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
  rightPanelAvailable, rightPanelCollapsed,
  terminalVisible, editingDisabled, docMode,
  onToggleEditorMode, onFormat, onToggleWorkspacePanel, onToggleWordPreview, onToggleWechatPreview, onToggleArtifacts,
  onToggleRightPanel, onToggleTerminal, onOpenToc, onSetDocMode,
  onNew, onOpen, onOpenFolder, onSave, onSaveAs, onInsertImage, onExportPdf, onExportWord,
  pdfExporting, wordExporting, onOpenSettings, onPreloadSettings,
}: ToolbarProps) {
  const settings = useSettings();
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);
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
  const [exportActiveIndex, setExportActiveIndex] = useState<number | null>(null);
  const exporting = pdfExporting || wordExporting;
  const exportListRef = useRef<Array<HTMLButtonElement | null>>([]);
  const exportFloating = useFloating({
    open: exportMenuOpen,
    onOpenChange: setExportMenuOpen,
    placement: 'bottom-end',
    middleware: [offset(4), flip({ padding: 8 }), shift({ padding: 8 })],
  });
  const exportClick = useClick(exportFloating.context);
  const exportDismiss = useDismiss(exportFloating.context);
  const exportRole = useRole(exportFloating.context, { role: 'menu' });
  // 与 ToolbarSplitMenu 同一焦点管线:首项聚焦 + 方向键导航 + Esc 返回 trigger。
  const exportListNavigation = useListNavigation(exportFloating.context, {
    listRef: exportListRef,
    activeIndex: exportActiveIndex,
    onNavigate: setExportActiveIndex,
    loop: true,
  });
  const { getReferenceProps: getExportReferenceProps, getFloatingProps: getExportFloatingProps } = useInteractions([
    exportClick,
    exportDismiss,
    exportRole,
    exportListNavigation,
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
            aria-pressed={workspacePanelVisible}
          >
            <PanelLeft size={TOOLBAR_ICON_SIZE} strokeWidth={TOOLBAR_STROKE_WIDTH} />
          </button>
          {onOpenToc && (
            <button data-no-window-drag="true" onClick={onOpenToc} data-tooltip={t('openTocHint')} aria-label={t('openTocHint')}>
              <ListTree size={TOOLBAR_ICON_SIZE} strokeWidth={TOOLBAR_STROKE_WIDTH} />
            </button>
          )}
        </div>
        <div className="toolbar-group toolbar-file-actions" aria-label={t('toolbarFileGroup')}>
          <button data-no-window-drag="true" onClick={onNew} data-tooltip={t('toolbarNewLabel')} aria-label={t('toolbarNewLabel')}>
            <FilePlus size={TOOLBAR_ICON_SIZE} strokeWidth={TOOLBAR_STROKE_WIDTH} />
          </button>
          <ToolbarSplitMenu
            mainLabel={t('toolbarOpenLabel')}
            mainIcon={<FolderDown size={TOOLBAR_ICON_SIZE} strokeWidth={TOOLBAR_STROKE_WIDTH} />}
            onMainClick={onOpen}
            chevronLabel={t('toolbarOpenMenuLabel')}
            items={onOpenFolder ? [{
              key: 'open-folder',
              label: t('toolbarOpenFolderLabel'),
              icon: <FolderOpen size={15} strokeWidth={TOOLBAR_STROKE_WIDTH} />,
              onSelect: onOpenFolder,
            }] : []}
          />
          <ToolbarSplitMenu
            mainLabel={t('toolbarSaveLabel')}
            mainIcon={<Save size={TOOLBAR_ICON_SIZE} strokeWidth={TOOLBAR_STROKE_WIDTH} />}
            onMainClick={onSave}
            mainDisabled={editingDisabled}
            chevronLabel={t('toolbarSaveMenuLabel')}
            items={[{
              key: 'save-as',
              label: t('toolbarSaveAsLabel'),
              icon: <SaveAll size={15} strokeWidth={TOOLBAR_STROKE_WIDTH} />,
              disabled: editingDisabled,
              onSelect: onSaveAs,
            }]}
          />
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
                <FileDown size={TOOLBAR_ICON_SIZE} strokeWidth={TOOLBAR_STROKE_WIDTH} />
                <ChevronDown size={10} strokeWidth={TOOLBAR_STROKE_WIDTH} className="export-chevron" />
              </button>
              {exportMenuOpen && (
                <FloatingPortal>
                  <FloatingFocusManager context={exportFloating.context} initialFocus={0}>
                    <div
                      ref={exportFloating.refs.setFloating}
                      style={exportFloating.floatingStyles}
                      className="export-menu"
                      role="menu"
                      aria-label={t('toolbarExportMenuLabel')}
                      {...getExportFloatingProps()}
                    >
                      <button
                        ref={(node) => { exportListRef.current[0] = node; }}
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
                          ref={(node) => { exportListRef.current[1] = node; }}
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
                  </FloatingFocusManager>
                </FloatingPortal>
              )}
            </div>
          )}
        </div>
        {(onFormat || onInsertImage) && (
          <div className="toolbar-group toolbar-insert-actions" aria-label={t('toolbarInsertGroup')}>
            {onFormat && (
              <ToolbarSplitMenu
                mainLabel={t('toolbarInsertTableLabel')}
                mainIcon={<Table2 size={TOOLBAR_ICON_SIZE} strokeWidth={TOOLBAR_STROKE_WIDTH} />}
                onMainClick={() => onFormat({ type: 'table-insert', rows: 2, cols: 3 })}
                mainDisabled={editingDisabled}
                chevronLabel={t('toolbarInsertMenuLabel')}
                items={onInsertImage ? [{
                  key: 'insert-image',
                  label: t('toolbarInsertImageLabel'),
                  icon: <ImagePlus size={15} strokeWidth={TOOLBAR_STROKE_WIDTH} />,
                  disabled: editingDisabled,
                  onSelect: onInsertImage,
                }] : []}
              />
            )}
            {!onFormat && onInsertImage && (
              <button
                data-no-window-drag="true"
                onClick={onInsertImage}
                disabled={editingDisabled}
                data-tooltip={t('toolbarInsertImageLabel')}
                aria-label={t('toolbarInsertImageLabel')}
              >
                <ImagePlus size={TOOLBAR_ICON_SIZE} strokeWidth={TOOLBAR_STROKE_WIDTH} />
              </button>
            )}
          </div>
        )}
        {onFormat && (
          <div className="toolbar-group toolbar-format-actions" aria-label="Markdown 格式">
            <button data-no-window-drag="true" disabled={editingDisabled} onClick={() => onFormat({ type: 'bold' })} data-tooltip="加粗 (Ctrl+B)" aria-label="加粗"><Bold size={TOOLBAR_ICON_SIZE} strokeWidth={TOOLBAR_STROKE_WIDTH} /></button>
            <button data-no-window-drag="true" disabled={editingDisabled} onClick={() => onFormat({ type: 'italic' })} data-tooltip="斜体 (Ctrl+I)" aria-label="斜体"><Italic size={TOOLBAR_ICON_SIZE} strokeWidth={TOOLBAR_STROKE_WIDTH} /></button>
            <button data-no-window-drag="true" disabled={editingDisabled} onClick={() => onFormat({ type: 'link' })} data-tooltip="链接" aria-label="链接"><Link size={TOOLBAR_ICON_SIZE} strokeWidth={TOOLBAR_STROKE_WIDTH} /></button>
            <button data-no-window-drag="true" disabled={editingDisabled} onClick={() => onFormat({ type: 'quote' })} data-tooltip="引用块" aria-label="引用块"><Quote size={TOOLBAR_ICON_SIZE} strokeWidth={TOOLBAR_STROKE_WIDTH} /></button>
            <button data-no-window-drag="true" disabled={editingDisabled} onClick={() => onFormat({ type: 'ul' })} data-tooltip="无序列表" aria-label="无序列表"><List size={TOOLBAR_ICON_SIZE} strokeWidth={TOOLBAR_STROKE_WIDTH} /></button>
            <button data-no-window-drag="true" disabled={editingDisabled} onClick={() => onFormat({ type: 'ol' })} data-tooltip="有序列表" aria-label="有序列表"><ListOrdered size={TOOLBAR_ICON_SIZE} strokeWidth={TOOLBAR_STROKE_WIDTH} /></button>
            <button data-no-window-drag="true" disabled={editingDisabled} onClick={() => onFormat({ type: 'task' })} data-tooltip="任务列表" aria-label="任务列表"><ListTodo size={TOOLBAR_ICON_SIZE} strokeWidth={TOOLBAR_STROKE_WIDTH} /></button>
            <button data-no-window-drag="true" disabled={editingDisabled} onClick={() => onFormat({ type: 'format-painter' })} data-tooltip="格式刷" aria-label="格式刷"><Paintbrush size={TOOLBAR_ICON_SIZE} strokeWidth={TOOLBAR_STROKE_WIDTH} /></button>
          </div>
        )}
      </div>
      <div className="toolbar-title" data-tauri-drag-region aria-hidden="true" />
      <div className="toolbar-spacer" data-tauri-drag-region aria-hidden="true" />
      <div className="toolbar-right">
        <div className="toolbar-group toolbar-view-actions" aria-label={t('toolbarViewGroup')}>
          <button
            className={editorMode === 'source' ? 'active' : ''}
            onClick={onToggleEditorMode}
            disabled={editingDisabled}
            data-no-window-drag="true"
            data-tooltip={t('toolbarSourceLabel')}
            aria-label={t('toolbarSourceLabel')}
            aria-pressed={editorMode === 'source'}
          >
            <Code2 size={TOOLBAR_ICON_SIZE} strokeWidth={TOOLBAR_STROKE_WIDTH} />
          </button>
          <button
            className={wordPreviewVisible ? 'active' : ''}
            onClick={onToggleWordPreview}
            disabled={editingDisabled}
            data-no-window-drag="true"
            data-tooltip={t('toolbarWordPreviewLabel')}
            aria-label={t('toolbarWordPreviewLabel')}
            aria-pressed={wordPreviewVisible}
          >
            <FileText size={TOOLBAR_ICON_SIZE} strokeWidth={TOOLBAR_STROKE_WIDTH} />
          </button>
          <button
            className={wechatPreviewVisible ? 'active' : ''}
            onClick={onToggleWechatPreview}
            disabled={editingDisabled}
            data-no-window-drag="true"
            data-tooltip={t('toolbarWechatPreviewLabel')}
            aria-label={t('toolbarWechatPreviewLabel')}
            aria-pressed={wechatPreviewVisible}
          >
            {/* lucide 无 wechat 品牌图标,沿用 Newspaper(评审已确认) */}
            <Newspaper size={TOOLBAR_ICON_SIZE} strokeWidth={TOOLBAR_STROKE_WIDTH} />
          </button>
          {onToggleArtifacts && (
            <button
              className={artifactsVisible ? 'active' : ''}
              onClick={onToggleArtifacts}
              disabled={editingDisabled}
              data-no-window-drag="true"
              data-tooltip={t('toolbarArtifactsLabel')}
              aria-label={t('toolbarArtifactsLabel')}
              aria-pressed={Boolean(artifactsVisible)}
            >
              <PackageOpen size={TOOLBAR_ICON_SIZE} strokeWidth={TOOLBAR_STROKE_WIDTH} />
            </button>
          )}
          {rightPanelAvailable && (
            <button
              className={rightPanelCollapsed ? 'active' : ''}
              onClick={onToggleRightPanel}
              data-no-window-drag="true"
              data-tooltip={rightPanelCollapsed ? t('toolbarExpandRightPanel') : t('toolbarCollapseRightPanel')}
              aria-label={rightPanelCollapsed ? t('toolbarExpandRightPanel') : t('toolbarCollapseRightPanel')}
              aria-pressed={rightPanelCollapsed}
            >
              {rightPanelCollapsed ? <PanelRightOpen size={TOOLBAR_ICON_SIZE} strokeWidth={TOOLBAR_STROKE_WIDTH} /> : <PanelRightClose size={TOOLBAR_ICON_SIZE} strokeWidth={TOOLBAR_STROKE_WIDTH} />}
            </button>
          )}
          <button
            className={terminalVisible ? 'active' : ''}
            onClick={onToggleTerminal}
            data-no-window-drag="true"
            data-tooltip={t('toolbarTerminalLabel')}
            aria-label={t('toolbarTerminalLabel')}
            aria-pressed={terminalVisible}
          >
            <Terminal size={TOOLBAR_ICON_SIZE} strokeWidth={TOOLBAR_STROKE_WIDTH} />
          </button>
          <DefineColorToolbarButton settings={settings} />
        </div>
        <div className="toolbar-group toolbar-navigation-actions" aria-label={t('toolbarNavGroup')}>
          <button
            data-no-window-drag="true"
            className="toolbar-settings-btn"
            onPointerEnter={onPreloadSettings}
            onFocus={onPreloadSettings}
            onClick={onOpenSettings}
            data-tooltip={t('toolbarSettingsLabel')}
            aria-label={t('toolbarSettingsLabel')}
          >
            <SlidersHorizontal size={TOOLBAR_ICON_SIZE} strokeWidth={TOOLBAR_STROKE_WIDTH} />
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

