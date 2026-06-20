import type { ComponentProps, CSSProperties, MutableRefObject, ReactNode } from 'react';
import { FolderOpen, Sparkles, BookOpenText, Newspaper, X } from 'lucide-react';
import { Toolbar } from './Toolbar';
import { FloatingToc } from './FloatingToc';
import { FileTreePanel } from './FileTreePanel';
import { ConversationPanel } from './conversation/ConversationPanel';
import type { OpenFileTab } from '../hooks/useFileTabs';
import type { LeftRailMode } from '../hooks/useLeftRail';
import type { RightPanelMode } from '../hooks/useRightPanel';

type AppLayoutChromeProps = {
  appStyle: CSSProperties;
  theme: string;
  toolbarProps: ComponentProps<typeof Toolbar>;
  mainContentRef: MutableRefObject<HTMLDivElement | null>;
  mainContentClassName: string;
  rightPanelWidth: number;
  leftRailMode: LeftRailMode;
  workspacePanelWidth: number;
  leftResizing: LeftRailMode;
  onToggleWorkspacePanel: () => void;
  onToggleAiPanel: () => void;
  conversationPanelProps: ComponentProps<typeof ConversationPanel>;
  fileTreeProps: ComponentProps<typeof FileTreePanel>;
  onLeftPanelResize: ComponentProps<'div'>['onPointerDown'];
  showToc: boolean;
  tocProps: ComponentProps<typeof FloatingToc>;
  externalChangeConflict: { path: string; ts: number } | null;
  onViewDiff: () => void;
  onAcceptExternal: () => void;
  onKeepMine: () => void;
  shouldShowTabbar: boolean;
  openTabs: OpenFileTab[];
  activeTabId: string;
  renameTitle: string;
  renameTitleUnsaved: string;
  onSwitchTab: (tabId: string) => void;
  onRequestRename: (tabId?: string) => void;
  onCloseTab: (tabId: string) => void;
  isDocx: boolean;
  editorPane: ReactNode;
  docxPane: ReactNode;
  rightPanelMode: RightPanelMode;
  resizing: boolean;
  rightPanelResizeLabel: string;
  rightPanelResizeTitle: string;
  onRightPanelResize: ComponentProps<'div'>['onPointerDown'];
  onResetRightPanelWidth: () => void;
  rightPanel: ReactNode;
  /** 右栏 tab 切换:用户在右栏顶部直接切 Word/Wechat,不用跑回工具栏。flow/none 不显示 tab。 */
  onSetRightPanelMode: (mode: RightPanelMode) => void;
  terminalNode: ReactNode;
  statusBarNode: ReactNode;
};

/**
 * Presentation-only shell for AppLayout's toolbar, center workbench, and status chrome.
 */
export function AppLayoutChrome({
  appStyle,
  theme,
  toolbarProps,
  mainContentRef,
  mainContentClassName,
  rightPanelWidth,
  leftRailMode,
  workspacePanelWidth,
  leftResizing,
  onToggleWorkspacePanel,
  onToggleAiPanel,
  conversationPanelProps,
  fileTreeProps,
  onLeftPanelResize,
  showToc,
  tocProps,
  externalChangeConflict,
  onViewDiff,
  onAcceptExternal,
  onKeepMine,
  shouldShowTabbar,
  openTabs,
  activeTabId,
  renameTitle,
  renameTitleUnsaved,
  onSwitchTab,
  onRequestRename,
  onCloseTab,
  isDocx,
  editorPane,
  docxPane,
  rightPanelMode,
  resizing,
  rightPanelResizeLabel,
  rightPanelResizeTitle,
  onRightPanelResize,
  onResetRightPanelWidth,
  rightPanel,
  onSetRightPanelMode,
  terminalNode,
  statusBarNode,
}: AppLayoutChromeProps) {
  return (
    <div className="app-layout" data-theme={theme} style={appStyle}>
      <Toolbar {...toolbarProps} />
      <div
        ref={mainContentRef}
        className={mainContentClassName}
        style={{ '--right-panel-width': `${rightPanelWidth}px` } as CSSProperties}
      >
        <button
          type="button"
          className={`workspace-toggle-rail ${leftRailMode === 'workspace' ? 'active' : ''}`}
          onClick={onToggleWorkspacePanel}
          aria-label={leftRailMode === 'workspace' ? '收起目录栏' : '展开目录栏'}
          title={leftRailMode === 'workspace' ? '收起目录栏' : '展开目录栏'}
        >
          <FolderOpen size={15} />
        </button>
        {leftRailMode !== 'none' && (
          <>
            <aside className="left-rail-shell" style={{ width: workspacePanelWidth }}>
              <div className="left-rail-tabs" role="tablist" aria-label="左侧栏切换">
                <button
                  type="button"
                  className={leftRailMode === 'workspace' ? 'active' : ''}
                  onClick={onToggleWorkspacePanel}
                  aria-label={leftRailMode === 'workspace' ? '收起文件树' : '打开文件树'}
                  title={leftRailMode === 'workspace' ? '收起文件树' : '打开文件树'}
                >
                  <FolderOpen size={15} />
                  <span>文件树</span>
                </button>
                <button
                  type="button"
                  className={leftRailMode === 'aiWorkbench' ? 'active' : ''}
                  onClick={onToggleAiPanel}
                  aria-label={leftRailMode === 'aiWorkbench' ? '收起 AI 工作台' : '打开 AI 工作台'}
                  title={leftRailMode === 'aiWorkbench' ? '收起 AI 工作台' : '打开 AI 工作台'}
                >
                  <Sparkles size={15} />
                  <span>AI 工作台</span>
                </button>
              </div>
              {leftRailMode === 'aiWorkbench' ? (
                <ConversationPanel {...conversationPanelProps} />
              ) : (
                <FileTreePanel {...fileTreeProps} />
              )}
            </aside>
            <div
              className={`left-panel-resizer ${leftResizing === 'workspace' ? 'dragging' : ''}`}
              role="separator"
              aria-label="调整目录栏宽度"
              aria-orientation="vertical"
              title="拖拽调整目录栏宽度"
              onPointerDown={onLeftPanelResize}
            />
          </>
        )}
        {showToc && <FloatingToc {...tocProps} />}
        <section className="editor-workbench">
          {externalChangeConflict && (
            <div className="external-change-conflict" role="alert">
              <span className="external-change-text">
                Claude 改了这个文件,你有未保存修改
              </span>
              <button type="button" onClick={onViewDiff}>
                查看差异
              </button>
              <button type="button" onClick={onAcceptExternal}>
                用 Claude 的版本
              </button>
              <button type="button" onClick={onKeepMine}>
                保留我的
              </button>
            </div>
          )}
          {shouldShowTabbar && (
            <div className="editor-tabbar" role="tablist" aria-label="打开的文件">
              {openTabs.map((tab) => (
                <div
                  key={tab.id}
                  className={`editor-tab ${tab.id === activeTabId ? 'active' : ''}`}
                  title={tab.file.path || tab.file.name}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab.id === activeTabId}
                    className="editor-tab-main"
                    onClick={() => onSwitchTab(tab.id)}
                    onDoubleClick={() => onRequestRename(tab.id)}
                    title={tab.file.path ? renameTitle : renameTitleUnsaved}
                  >
                    <span>{tab.file.dirty ? `*${tab.file.name}` : tab.file.name}</span>
                  </button>
                  <button
                    type="button"
                    className="editor-tab-close"
                    aria-label={`关闭 ${tab.file.name}`}
                    onClick={() => onCloseTab(tab.id)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          {isDocx ? docxPane : editorPane}
        </section>
        {rightPanelMode !== 'none' && !isDocx && (
          <div
            className={`word-preview-resizer ${resizing ? 'dragging' : ''}`}
            role="separator"
            aria-label={rightPanelResizeLabel}
            aria-orientation="vertical"
            aria-valuemin={320}
            aria-valuemax={760}
            aria-valuenow={Math.round(rightPanelWidth)}
            title={rightPanelResizeTitle}
            onPointerDown={onRightPanelResize}
            onDoubleClick={onResetRightPanelWidth}
          />
        )}
        {rightPanelMode !== 'none' && !isDocx ? (
          <aside className="right-rail-shell" style={{ width: rightPanelWidth }}>
            {(rightPanelMode === 'word' || rightPanelMode === 'wechat') && (
              <div className="right-rail-tabs" role="tablist" aria-label="右侧预览切换">
                <button
                  type="button"
                  className={rightPanelMode === 'word' ? 'active' : ''}
                  onClick={() => onSetRightPanelMode('word')}
                  aria-label="Word 预览"
                  title="Word 预览"
                >
                  <BookOpenText size={14} />
                  <span>Word</span>
                </button>
                <button
                  type="button"
                  className={rightPanelMode === 'wechat' ? 'active' : ''}
                  onClick={() => onSetRightPanelMode('wechat')}
                  aria-label="微信预览"
                  title="微信预览"
                >
                  <Newspaper size={14} />
                  <span>微信</span>
                </button>
                <button
                  type="button"
                  className="right-rail-tab-close"
                  onClick={() => onSetRightPanelMode('none')}
                  aria-label="关闭右侧预览"
                  title="关闭右侧预览"
                >
                  <X size={13} />
                </button>
              </div>
            )}
            <div className="right-rail-body">{rightPanel}</div>
          </aside>
        ) : (
          rightPanel
        )}
      </div>
      {terminalNode}
      {statusBarNode}
    </div>
  );
}
