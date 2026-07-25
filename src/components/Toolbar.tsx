import { useCallback, useMemo, useState } from 'react';
import {
  Bold,
  Code2,
  FileDown,
  FilePlus,
  FileText,
  FolderDown,
  FolderOpen,
  ImagePlus,
  Italic,
  Link,
  ListTree,
  PanelLeft,
  Save,
  SaveAll,
  SlidersHorizontal,
  Table2,
  Terminal,
  Type,
} from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useSettings } from '../hooks/useSettings';
import type { DocMode } from '../hooks/useDocumentMode';
import { translate } from '../services/i18n';
import { formatShortcut } from '../services/shortcuts';
import { handleTitlebarMouseDown } from '../services/titlebarDrag';
import type { FormatAction } from './EditorContextMenu';
import { DefineColorToolbarButton } from './defineColor/DefineColorToolbarButton';
import { DocumentModeSwitcher } from './DocumentModeSwitcher';
import { ControlMenu, type ControlMenuItem } from './ui/ControlMenu';
import { IconButton } from './ui/IconButton';
import { Tooltip } from './ui/Tooltip';

export type EditorMode = 'wysiwyg' | 'source';

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

type ToolbarTooltip = {
  label: string;
  shortcut?: string;
  reference: HTMLElement;
};

const ICON_SIZE = 16;
const ICON_STROKE = 1.6;

export function Toolbar({
  editorMode,
  workspacePanelVisible,
  wordPreviewVisible,
  wechatPreviewVisible,
  artifactsVisible,
  rightPanelAvailable,
  rightPanelCollapsed,
  terminalVisible,
  editingDisabled,
  docMode,
  onToggleEditorMode,
  onFormat,
  onToggleWorkspacePanel,
  onToggleWordPreview,
  onToggleWechatPreview,
  onToggleArtifacts,
  onToggleRightPanel,
  onToggleTerminal,
  onOpenToc,
  onSetDocMode,
  onNew,
  onOpen,
  onOpenFolder,
  onSave,
  onSaveAs,
  onInsertImage,
  onExportPdf,
  onExportWord,
  pdfExporting,
  wordExporting,
  onOpenSettings,
  onPreloadSettings,
}: ToolbarProps) {
  const settings = useSettings();
  const t = useCallback(
    (key: Parameters<typeof translate>[1]) => translate(settings.locale, key),
    [settings.locale],
  );
  const workspacePanelTooltip = workspacePanelVisible ? t('toolbarCollapseFileTree') : t('toolbarOpenFileTree');
  const [toolbarTooltip, setToolbarTooltip] = useState<ToolbarTooltip | null>(null);

  const handleToolbarTooltipOver = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('button[data-tooltip]');
    if (!button || !event.currentTarget.contains(button)) return;
    const label = button.dataset.tooltip;
    if (!label) return;
    setToolbarTooltip({
      label,
      shortcut: button.dataset.tooltipShortcut,
      reference: button,
    });
  }, []);
  const handleToolbarTooltipFocus = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('button[data-tooltip]');
    const label = button?.dataset.tooltip;
    if (!button || !label) return;
    setToolbarTooltip({
      label,
      shortcut: button.dataset.tooltipShortcut,
      reference: button,
    });
  }, []);
  const clearToolbarTooltip = useCallback(() => setToolbarTooltip(null), []);

  const exporting = pdfExporting || wordExporting;
  const formatItems = useMemo<ControlMenuItem[]>(() => {
    if (!onFormat) return [];
    return [
      { id: 'bold', label: t('toolbarBoldLabel'), shortcut: formatShortcut('Mod+B'), onSelect: () => onFormat({ type: 'bold' }) },
      { id: 'italic', label: t('toolbarItalicLabel'), shortcut: formatShortcut('Mod+I'), onSelect: () => onFormat({ type: 'italic' }) },
      { id: 'link', label: t('toolbarLinkLabel'), shortcut: formatShortcut('Mod+K'), onSelect: () => onFormat({ type: 'link' }) },
      { id: 'quote', label: t('toolbarQuoteLabel'), onSelect: () => onFormat({ type: 'quote' }) },
      { id: 'ul', label: t('toolbarUnorderedListLabel'), onSelect: () => onFormat({ type: 'ul' }) },
      { id: 'ol', label: t('toolbarOrderedListLabel'), onSelect: () => onFormat({ type: 'ol' }) },
      { id: 'task', label: t('toolbarTaskListLabel'), onSelect: () => onFormat({ type: 'task' }) },
      { id: 'painter', label: t('toolbarFormatPainterLabel'), onSelect: () => onFormat({ type: 'format-painter' }) },
    ];
  }, [onFormat, t]);
  const secondaryFormatItems = formatItems.slice(3);
  const previewItems = useMemo<ControlMenuItem[]>(() => [
    {
      id: 'word',
      label: t('toolbarWordPreviewLabel'),
      shortcut: formatShortcut('Mod+Alt+P'),
      active: wordPreviewVisible,
      onSelect: onToggleWordPreview,
    },
    {
      id: 'html',
      label: t('toolbarWechatPreviewLabel'),
      shortcut: formatShortcut('Mod+Alt+M'),
      active: wechatPreviewVisible,
      onSelect: onToggleWechatPreview,
    },
    ...(onToggleArtifacts ? [{
      id: 'artifacts',
      label: t('toolbarArtifactsLabel'),
      active: Boolean(artifactsVisible),
      onSelect: onToggleArtifacts,
    }] : []),
  ], [
    artifactsVisible,
    onToggleArtifacts,
    onToggleWechatPreview,
    onToggleWordPreview,
    t,
    wechatPreviewVisible,
    wordPreviewVisible,
  ]);
  const exportItems = useMemo<ControlMenuItem[]>(() => [
    ...(onExportPdf ? [{
      id: 'pdf',
      label: t('toolbarExportPdfLabel'),
      disabled: editingDisabled || Boolean(exporting),
      onSelect: onExportPdf,
    }] : []),
    ...(onExportWord ? [{
      id: 'word',
      label: t('toolbarExportWordLabel'),
      disabled: editingDisabled || Boolean(exporting),
      onSelect: onExportWord,
    }] : []),
  ], [editingDisabled, exporting, onExportPdf, onExportWord, t]);

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!('__TAURI_INTERNALS__' in window)) return;
    void handleTitlebarMouseDown(event.nativeEvent, getCurrentWindow())
      .catch((error) => console.warn('Failed to start window drag:', error));
  };

  return (
    <div
      className="app-toolbar"
      role="toolbar"
      aria-label={t('toolbarAriaLabel')}
      data-window-drag-fallback="manual"
      onMouseDownCapture={handleMouseDown}
      onPointerOverCapture={handleToolbarTooltipOver}
      onPointerDownCapture={clearToolbarTooltip}
      onPointerLeave={clearToolbarTooltip}
      onFocusCapture={handleToolbarTooltipFocus}
      onBlurCapture={clearToolbarTooltip}
    >
      <div className="toolbar-left">
        <div className="toolbar-group toolbar-nav-actions" role="group" aria-label={t('toolbarWorkspaceGroup')}>
          <IconButton
            label={workspacePanelTooltip}
            icon={<PanelLeft size={ICON_SIZE} strokeWidth={ICON_STROKE} />}
            pressed={workspacePanelVisible}
            className={workspacePanelVisible ? 'active' : ''}
            onClick={onToggleWorkspacePanel}
            data-no-window-drag="true"
          />
          <DefineColorToolbarButton settings={settings} />
          {onOpenToc && (
            <IconButton
              label={t('openTocHint')}
              icon={<ListTree size={ICON_SIZE} strokeWidth={ICON_STROKE} />}
              onClick={onOpenToc}
              data-no-window-drag="true"
            />
          )}
        </div>

        <div className="toolbar-group toolbar-file-actions" role="group" aria-label={t('toolbarFileGroup')}>
          <IconButton
            label={t('toolbarNewLabel')}
            shortcut={formatShortcut('Mod+N')}
            icon={<FilePlus size={ICON_SIZE} strokeWidth={ICON_STROKE} />}
            onClick={onNew}
            data-no-window-drag="true"
          />
          <IconButton
            label={t('toolbarOpenLabel')}
            shortcut={formatShortcut('Mod+O')}
            icon={<FolderDown size={ICON_SIZE} strokeWidth={ICON_STROKE} />}
            onClick={onOpen}
            data-no-window-drag="true"
          />
          {onOpenFolder && (
            <IconButton
              label={t('toolbarOpenFolderLabel')}
              shortcut={formatShortcut('Mod+Shift+O')}
              icon={<FolderOpen size={ICON_SIZE} strokeWidth={ICON_STROKE} />}
              onClick={onOpenFolder}
              data-no-window-drag="true"
            />
          )}
          <IconButton
            label={t('toolbarSaveLabel')}
            shortcut={formatShortcut('Mod+S')}
            icon={<Save size={ICON_SIZE} strokeWidth={ICON_STROKE} />}
            onClick={onSave}
            disabled={editingDisabled}
            data-no-window-drag="true"
          />
          <IconButton
            label={t('toolbarSaveAsLabel')}
            shortcut={formatShortcut('Mod+Shift+S')}
            icon={<SaveAll size={ICON_SIZE} strokeWidth={ICON_STROKE} />}
            onClick={onSaveAs}
            disabled={editingDisabled}
            data-no-window-drag="true"
          />
          {onFormat && (
            <IconButton
              label={t('toolbarInsertTableLabel')}
              icon={<Table2 size={ICON_SIZE} strokeWidth={ICON_STROKE} />}
              onClick={() => onFormat({ type: 'table-insert', rows: 2, cols: 3 })}
              disabled={editingDisabled}
              data-no-window-drag="true"
            />
          )}
          {onInsertImage && (
            <IconButton
              label={t('toolbarInsertImageLabel')}
              icon={<ImagePlus size={ICON_SIZE} strokeWidth={ICON_STROKE} />}
              onClick={onInsertImage}
              disabled={editingDisabled}
              data-no-window-drag="true"
            />
          )}
          {exportItems.length > 0 && (
            <ControlMenu
              label={t('toolbarExportLabel')}
              icon={<FileDown size={ICON_SIZE} strokeWidth={ICON_STROKE} />}
              items={exportItems}
              disabled={editingDisabled || Boolean(exporting)}
            />
          )}
        </div>

        {onFormat && (
          <>
            <div className="toolbar-group toolbar-format-actions toolbar-format-actions-wide" role="group" aria-label={t('toolbarFormatGroup')}>
              <IconButton
                label={t('toolbarBoldLabel')}
                shortcut={formatShortcut('Mod+B')}
                icon={<Bold size={ICON_SIZE} strokeWidth={ICON_STROKE} />}
                onClick={() => onFormat({ type: 'bold' })}
                disabled={editingDisabled}
                data-no-window-drag="true"
              />
              <IconButton
                label={t('toolbarItalicLabel')}
                shortcut={formatShortcut('Mod+I')}
                icon={<Italic size={ICON_SIZE} strokeWidth={ICON_STROKE} />}
                onClick={() => onFormat({ type: 'italic' })}
                disabled={editingDisabled}
                data-no-window-drag="true"
              />
              <IconButton
                label={t('toolbarLinkLabel')}
                shortcut={formatShortcut('Mod+K')}
                icon={<Link size={ICON_SIZE} strokeWidth={ICON_STROKE} />}
                onClick={() => onFormat({ type: 'link' })}
                disabled={editingDisabled}
                data-no-window-drag="true"
              />
              <ControlMenu
                label={t('toolbarFormatMoreLabel')}
                icon={<Type size={ICON_SIZE} strokeWidth={ICON_STROKE} />}
                items={secondaryFormatItems}
                disabled={editingDisabled}
              />
            </div>
            <div className="toolbar-group toolbar-format-actions toolbar-format-actions-compact" role="group" aria-label={t('toolbarFormatGroup')}>
              <ControlMenu
                label={t('toolbarFormatMenuLabel')}
                icon={<Type size={ICON_SIZE} strokeWidth={ICON_STROKE} />}
                items={formatItems}
                disabled={editingDisabled}
              />
            </div>
          </>
        )}
      </div>

      <div className="toolbar-title" data-tauri-drag-region aria-hidden="true" />
      <div className="toolbar-spacer" data-tauri-drag-region aria-hidden="true" />

      <div className="toolbar-right">
        <div className="toolbar-group toolbar-view-actions" role="group" aria-label={t('toolbarViewGroup')}>
          <IconButton
            label={t('toolbarSourceLabel')}
            shortcut={formatShortcut('Mod+Alt+S')}
            icon={<Code2 size={ICON_SIZE} strokeWidth={ICON_STROKE} />}
            pressed={editorMode === 'source'}
            className={editorMode === 'source' ? 'active' : ''}
            onClick={onToggleEditorMode}
            disabled={editingDisabled}
            data-no-window-drag="true"
          />
          <ControlMenu
            label={t('toolbarPreviewMenuLabel')}
            icon={<FileText size={ICON_SIZE} strokeWidth={ICON_STROKE} />}
            items={previewItems}
            active={Boolean(wordPreviewVisible || wechatPreviewVisible || artifactsVisible)}
            disabled={editingDisabled}
            placement="bottom-end"
          />
          <IconButton
            label={t('toolbarTerminalLabel')}
            shortcut={formatShortcut('Mod+`')}
            icon={<Terminal size={ICON_SIZE} strokeWidth={ICON_STROKE} />}
            pressed={terminalVisible}
            className={terminalVisible ? 'active' : ''}
            onClick={onToggleTerminal}
            data-no-window-drag="true"
          />
        </div>

        <div className="toolbar-group toolbar-navigation-actions" role="group" aria-label={t('toolbarNavGroup')}>
          <IconButton
            label={t('toolbarSettingsLabel')}
            shortcut={formatShortcut('Mod+,')}
            icon={<SlidersHorizontal size={ICON_SIZE} strokeWidth={ICON_STROKE} />}
            className="toolbar-settings-btn"
            onPointerEnter={onPreloadSettings}
            onFocus={onPreloadSettings}
            onClick={onOpenSettings}
            data-no-window-drag="true"
          />
        </div>

        <div className="toolbar-group toolbar-mode-group" role="group" aria-label={t('toolbarModeGroup')}>
          <DocumentModeSwitcher
            mode={docMode}
            onChange={onSetDocMode}
            disabled={editingDisabled}
          />
        </div>

        <div className="toolbar-group toolbar-right-panel-actions" role="group" aria-label={t('toolbarRightPanelGroup')}>
          <IconButton
            label={rightPanelCollapsed ? t('toolbarExpandRightPanel') : t('toolbarCollapseRightPanel')}
            icon={<PanelLeft className="toolbar-panel-right-icon" size={ICON_SIZE} strokeWidth={ICON_STROKE} />}
            pressed={rightPanelAvailable && !rightPanelCollapsed}
            className={rightPanelAvailable && !rightPanelCollapsed ? 'active' : ''}
            onClick={onToggleRightPanel}
            disabled={!rightPanelAvailable}
            data-no-window-drag="true"
          />
        </div>
      </div>

      <Tooltip
        label={toolbarTooltip?.label ?? ''}
        shortcut={toolbarTooltip?.shortcut}
        reference={toolbarTooltip?.reference ?? null}
        placement="bottom"
        open={toolbarTooltip !== null}
      />
    </div>
  );
}
