import { Fragment, useCallback, useLayoutEffect, useRef, useState, type ComponentProps, type CSSProperties, type MutableRefObject, type ReactNode } from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { FolderOpen, Sparkles, BookOpenText, Newspaper, X } from 'lucide-react';
import { Toolbar } from './Toolbar';
import { FloatingToc } from './FloatingToc';
import { FileTreePanel } from './FileTreePanel';
import { ConversationPanel } from './conversation/ConversationPanel';
import { calmTransition, MotionProvider } from './motion/MotionProvider';
import type { OpenFileTab } from '../hooks/useFileTabs';
import type { LeftRailMode } from '../hooks/useLeftRail';
import type { RightPanelMode } from '../hooks/useRightPanel';

type AppLayoutChromeProps = {
  appStyle: CSSProperties;
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

function useActiveTabIndicator<T extends HTMLElement>(activeKey: string | boolean) {
  const containerRef = useRef<T | null>(null);
  const [style, setStyle] = useState<CSSProperties | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const active = container?.querySelector<HTMLElement>('[data-indicator-active="true"]');
    if (!container || !active) {
      setStyle(null);
      return undefined;
    }

    let frameId: number | null = null;
    const update = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        const currentContainer = containerRef.current;
        if (!currentContainer || !active.isConnected) return;
        const containerRect = currentContainer.getBoundingClientRect();
        const activeRect = active.getBoundingClientRect();
        const nextTransform = `translateX(${activeRect.left - containerRect.left}px)`;
        const nextWidth = `${activeRect.width}px`;
        setStyle((current) => (
          current?.transform === nextTransform && current.width === nextWidth
            ? current
            : { transform: nextTransform, width: nextWidth }
        ));
      });
    };

    update();
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    // 必须同时 observe container + active:容器 resize 时 active 位置会发生位移,
    // 仅 observe container 会漏 active 自身尺寸变化(如 tab 标题加长、icon 切换)。
    // 删任一 observe 都会让 indicator 在某个边界情况下跳到旧位置。
    resizeObserver?.observe(container);
    resizeObserver?.observe(active);
    window.addEventListener('resize', update);
    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [activeKey]);

  return { containerRef, indicatorStyle: style };
}

/**
 * Presentation-only shell for AppLayout's toolbar, center workbench, and status chrome.
 */
export function AppLayoutChrome({
  appStyle,
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
  const shouldReduceMotion = useReducedMotion();
  const [tabsRef] = useAutoAnimate<HTMLDivElement>({
    duration: shouldReduceMotion ? 0 : 180,
    easing: 'ease-out',
  });
  const supportsWebAnimations = typeof Element !== 'undefined'
    && typeof Element.prototype.animate === 'function';
  const leftRailIndicator = useActiveTabIndicator<HTMLDivElement>(leftRailMode);
  const editorTabIndicator = useActiveTabIndicator<HTMLDivElement>(activeTabId);
  const rightRailIndicator = useActiveTabIndicator<HTMLDivElement>(rightPanelMode);
  const editorTabContainerRef = editorTabIndicator.containerRef;
  const setEditorTabbarRef = useCallback((node: HTMLDivElement | null) => {
    editorTabContainerRef.current = node;
    if (supportsWebAnimations) tabsRef(node);
  }, [editorTabContainerRef, supportsWebAnimations, tabsRef]);

  return (
    <MotionProvider>
      <div className="app-layout" style={appStyle}>
        <Toolbar {...toolbarProps} />
        <div
          ref={mainContentRef}
          className={mainContentClassName}
          style={{ '--right-panel-width': `${rightPanelWidth}px` } as CSSProperties}
        >
          <AnimatePresence initial={false}>
            {leftRailMode !== 'none' && (
              <Fragment key="left-rail-group">
                <motion.aside
                  key="left-rail"
                  className="left-rail-shell"
                  style={{ width: workspacePanelWidth, overflow: 'hidden' }}
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: workspacePanelWidth, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={leftResizing === 'workspace' ? { duration: 0 } : calmTransition}
                >
              <div ref={leftRailIndicator.containerRef} className="left-rail-tabs" role="tablist" aria-label="左侧栏切换">
                {leftRailIndicator.indicatorStyle && (
                  <span className="tab-motion-indicator left-rail-tab-indicator" style={leftRailIndicator.indicatorStyle} aria-hidden="true" />
                )}
                <button
                  type="button"
                  className={leftRailMode === 'workspace' ? 'active' : ''}
                  data-indicator-active={leftRailMode === 'workspace' ? 'true' : undefined}
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
                  data-indicator-active={leftRailMode === 'aiWorkbench' ? 'true' : undefined}
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
                </motion.aside>
                <motion.div
                  key="left-rail-resizer"
                  className={`left-panel-resizer ${leftResizing === 'workspace' ? 'dragging' : ''}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ ...calmTransition, duration: 0.12 }}
                  role="separator"
                  aria-label="调整目录栏宽度"
                  aria-orientation="vertical"
                  title="拖拽调整目录栏宽度"
                  onPointerDown={onLeftPanelResize}
                />
              </Fragment>
            )}
          </AnimatePresence>
        {showToc && <FloatingToc {...tocProps} />}
        <section className="editor-workbench">
          <AnimatePresence initial={false}>
            {externalChangeConflict && (
              <motion.div
                key="external-change-conflict"
                className="external-change-conflict"
                role="alert"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={shouldReduceMotion ? { duration: 0 } : calmTransition}
                style={{ overflow: 'hidden' }}
              >
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
              </motion.div>
            )}
          </AnimatePresence>
          {shouldShowTabbar && (
            <div ref={setEditorTabbarRef} className="editor-tabbar" role="tablist" aria-label="打开的文件">
              {editorTabIndicator.indicatorStyle && (
                <span className="tab-motion-indicator editor-tab-indicator" style={editorTabIndicator.indicatorStyle} aria-hidden="true" />
              )}
              {openTabs.map((tab) => (
                <div
                  key={tab.id}
                  className={`editor-tab ${tab.id === activeTabId ? 'active' : ''}`}
                  data-indicator-active={tab.id === activeTabId ? 'true' : undefined}
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
        <AnimatePresence initial={false}>
          {rightPanelMode !== 'none' && !isDocx && (
            <motion.div
              key="right-rail-resizer"
              className={`word-preview-resizer ${resizing ? 'dragging' : ''}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ ...calmTransition, duration: 0.12 }}
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
        </AnimatePresence>
        <AnimatePresence initial={false}>
          {rightPanelMode !== 'none' && !isDocx ? (
            <motion.aside
              key="right-rail"
              className="right-rail-shell"
              style={{ width: rightPanelWidth, overflow: 'hidden' }}
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: rightPanelWidth, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={resizing ? { duration: 0 } : calmTransition}
            >
            {(rightPanelMode === 'word' || rightPanelMode === 'wechat') && (
              <div ref={rightRailIndicator.containerRef} className="right-rail-tabs" role="tablist" aria-label="右侧预览切换">
                {rightRailIndicator.indicatorStyle && (
                  <span className="tab-motion-indicator right-rail-tab-indicator" style={rightRailIndicator.indicatorStyle} aria-hidden="true" />
                )}
                <button
                  type="button"
                  className={rightPanelMode === 'word' ? 'active' : ''}
                  data-indicator-active={rightPanelMode === 'word' ? 'true' : undefined}
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
                  data-indicator-active={rightPanelMode === 'wechat' ? 'true' : undefined}
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
            </motion.aside>
          ) : null}
        </AnimatePresence>
        {rightPanelMode === 'none' || isDocx ? rightPanel : null}
        </div>
        {terminalNode}
        {statusBarNode}
      </div>
    </MotionProvider>
  );
}
