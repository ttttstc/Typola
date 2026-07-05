import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { X } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { TocItem } from '../types/document';
import {
  getExportPresetConfig,
  clearLastOpenedPath,
  getLastOpenedPath,
  resolvePreviewFontFamily,
  resolvePreviewHeadingFontFamily,
} from '../services/settingsService';
import { firstOpenableDocumentPath, isOpenableDocumentPath } from '../services/fileDrop';
import { useSettings } from '../hooks/useSettings';
import {
  checkForAppUpdate,
  downloadAppUpdate,
  installDownloadedAppUpdate,
  type UpdateCheckResult,
  type UpdateSource,
} from '../services/updateService';
import { scheduleDelayedAutoUpdateCheck } from '../services/autoUpdateScheduler';
import { translate } from '../services/i18n';
import type { EditorMode } from '../components/Toolbar';
import { StatusBar } from '../components/StatusBar';
import { AppLayoutChrome } from '../components/AppLayoutChrome';
import { AppLayoutOverlays } from '../components/AppLayoutOverlays';
import { SkillHubPanel } from '../components/SkillHubPanel';
import { ArtifactCenterPanel } from '../components/artifacts/ArtifactCenterPanel';
import { SelectionResultCard } from '../components/selection/SelectionResultCard';
import { ReviewCommentEditor } from '../components/selection/ReviewCommentEditor';
import { ReviewSidebarPanel } from '../components/review/ReviewSidebarPanel';
import { runSkillOneshot } from '../services/agent/oneshotService';
import { useReviewState } from '../hooks/useReviewState';
import { useRevisionList } from '../hooks/useRevisionList';
import { buildReviewMarkdown, type ReviewComment } from '../services/review/reviewState';
import { ensureArtifactManifest } from '../services/artifacts/manifest';
import type { ArtifactRecord } from '../services/artifacts/types';
import { saveFileDialog } from '../services/dialogService';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import type { SelectionAnchor } from '../services/agent/types';
import { resolveWorkbenchWorkspaceRoot } from '../services/agent/workbenchWorkspace';
import { useConversationManager } from '../hooks/useAgentSession';
import { useArtifactLibrary } from '../hooks/useArtifactLibrary';
import { useArtifactState } from '../hooks/useArtifactState';
import { useEditorSelectionBridge } from '../hooks/useEditorSelectionBridge';
import { useFileTabs } from '../hooks/useFileTabs';
import { useDiffReview } from '../hooks/useDiffReview';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { confirmDialog, messageDialog } from '../services/dialogService';
import { useDocumentMode } from '../hooks/useDocumentMode';
import { useLeftRail } from '../hooks/useLeftRail';
import { useRightPanel, type RightPanelMode } from '../hooks/useRightPanel';
import { useSkillHubState } from '../hooks/useSkillHubState';
import { buildSkillPrefill, type SkillPickPayload } from '../services/agent/skillHub';
import { useTocState } from '../hooks/useTocState';
import { useWorkspaceWatch } from '../hooks/useWorkspaceWatch';
import type { SourceHeadingScrollRequest } from '../components/EditorPane';
import type { EditorCoreHandle } from '../types/editorCore';
import type { PreviewScrollHandle } from '../types/previewScroll';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { calculateDocumentStats } from '../services/documentStatsService';
import { getRecentFiles, type RecentFile } from '../services/recentFilesService';
import type { SearchMatch, SearchOptions } from '../services/documentSearchService';
import { createImageMarkdown } from '../services/editAssistService';
import { applyThemeToDocument } from '../services/themeDom';
import {
  formatImageSrc,
  isImagePath,
  parseUploadUrls,
  pathBasenameWithoutExtension,
  resolveCopyDestination,
  resolveImageInsertAction,
} from '../services/imageInsert';
import { collectHeadingSections, foldKey, type FoldKey } from '../services/headingFoldService';
import {
  extractToc,
  escapeRegExp,
  FLOW_LEFT_PANEL_WIDTH,
  FLOW_RIGHT_PANEL_WIDTH,
  imageExtensionFromMime,
  isEditableShortcutTarget,
  joinLocalPath,
  LEFT_PANEL_MAX_WIDTH,
  LEFT_PANEL_MIN_WIDTH,
  lineIndexAtOffset,
  RIGHT_PANEL_MAX_WIDTH,
  RIGHT_PANEL_MIN_WIDTH,
  RIGHT_PANEL_RESIZER_GAP,
  WORKSPACE_PANEL_DEFAULT_WIDTH,
  toUpdateErrorMessage,
} from './appLayoutUtils';
import {
  preloadSettingsPage,
  preloadSettingsPageInBackground,
  SettingsPage,
  SettingsPageFallback,
} from './settingsPageLoader';

const EditorPane = lazy(() =>
  import('../components/EditorPane').then((module) => ({ default: module.EditorPane })),
);

const WysiwygEditorPane = lazy(() =>
  import('../components/WysiwygEditorPane').then((module) => ({ default: module.WysiwygEditorPane })),
);

const Cm6MarkdownEditorPane = lazy(() =>
  import('../components/editor/cm6/Cm6MarkdownEditorPane').then((module) => ({ default: module.Cm6MarkdownEditorPane })),
);

const DocxPreviewPane = lazy(() =>
  import('../components/DocxPreviewPane').then((module) => ({ default: module.DocxPreviewPane })),
);

const WordPaperPreviewPane = lazy(() =>
  import('../components/WordPaperPreviewPane').then((module) => ({ default: module.WordPaperPreviewPane })),
);

const WechatPreviewPane = lazy(() =>
  import('../components/WechatPreviewPane').then((module) => ({ default: module.WechatPreviewPane })),
);

const HtmlPresentationPane = lazy(() =>
  import('../components/HtmlPresentationPane').then((module) => ({ default: module.HtmlPresentationPane })),
);

const HtmlPreviewPane = lazy(() =>
  import('../components/HtmlPreviewPane').then((module) => ({ default: module.HtmlPreviewPane })),
);

const TerminalPanel = lazy(() =>
  import('../components/TerminalPanel').then((module) => ({ default: module.TerminalPanel })),
);
type TerminalPanelHandle = import('../components/TerminalPanel').TerminalPanelHandle;
const ArtifactPreview = lazy(() =>
  import('../components/ArtifactPreview').then((module) => ({ default: module.ArtifactPreview })),
);
const DiffReviewPane = lazy(() =>
  import('../components/diff/DiffReviewPane').then((module) => ({ default: module.DiffReviewPane })),
);

type AvailableUpdate = Extract<UpdateCheckResult, { status: 'available' }>;
type UpdateInstallState =
  | { phase: 'idle' }
  | { phase: 'downloading'; source: UpdateSource; update: AvailableUpdate }
  | { phase: 'ready'; source: UpdateSource; update: AvailableUpdate }
  | { phase: 'installing'; source: UpdateSource; update: AvailableUpdate }
  | { phase: 'error'; source: UpdateSource; update?: AvailableUpdate; message: string };

function readEditorEngine(): 'vditor' | 'cm6' {
  if (typeof window === 'undefined') return 'cm6';
  return window.localStorage.getItem('typola.editorEngine') === 'vditor' ? 'vditor' : 'cm6';
}

export function AppLayout() {
  const settings = useSettings();
  const isTauriRuntime = '__TAURI_INTERNALS__' in window;
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);
  const reopenAttempted = useRef(false);
  const autoUpdateCheckStarted = useRef(false);
  const updateDownloadVersionRef = useRef<string | null>(null);
  const mainContentRef = useRef<HTMLDivElement>(null);
  const editorCommandRef = useRef<EditorCoreHandle | null>(null);
  const previewScrollRef = useRef<PreviewScrollHandle | null>(null);
  const terminalPanelRef = useRef<TerminalPanelHandle | null>(null);
  // 双向同步震荡抑制:任一方向触发后,锁定反向一段时间(防止 editor↔preview 循环)。
  const syncLockUntilRef = useRef(0);
  const SYNC_LOCK_MS = 220;
  const handleEditorScrollRatio = useCallback((ratio: number) => {
    if (Date.now() < syncLockUntilRef.current) return;
    syncLockUntilRef.current = Date.now() + SYNC_LOCK_MS;
    previewScrollRef.current?.scrollToRatio(ratio);
  }, []);
  const handleEditorHeadingChange = useCallback((change: { index: number; withinRatio: number }) => {
    if (Date.now() < syncLockUntilRef.current) return;
    if (change.index < 0) return;
    syncLockUntilRef.current = Date.now() + SYNC_LOCK_MS;
    previewScrollRef.current?.scrollToHeading(change.index, change.withinRatio);
  }, []);
  const handlePreviewHeadingScroll = useCallback((change: { index: number }) => {
    if (Date.now() < syncLockUntilRef.current) return;
    if (change.index < 0) return;
    syncLockUntilRef.current = Date.now() + SYNC_LOCK_MS;
    // 不传 withinRatio:preview 与 editor 的 heading 段高不同(渲染/字体/行距差异),
    // 段内比例在两侧不可一一对应,只传 heading 索引对齐到 heading 起点,
    // 段内精确滚动交给 preview 自身保留,避免反向跟随在段内漂移。
    setSourceHeadingScrollRequest((current) => ({
      index: change.index,
      requestId: (current?.requestId ?? 0) + 1,
    }));
  }, []);
  const [workspaceRoot, setWorkspaceRoot] = useState('');
  const [settingsVisible, setSettingsVisible] = useState(false);
  // P1-E:从外部(场景卡)跳转时指定的初始段
  const [settingsInitialSection, setSettingsInitialSection] = useState<'aiCli' | undefined>(undefined);
  const [findVisible, setFindVisible] = useState(false);
  const [findFocusTarget, setFindFocusTarget] = useState<'find' | 'replace'>('find');
  const [quickOpenVisible, setQuickOpenVisible] = useState(false);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>(() => getRecentFiles());
  const [editorMode, setEditorMode] = useState<EditorMode>('wysiwyg');
  const [editorEngine] = useState(readEditorEngine);
  const [sourceHeadingScrollRequest, setSourceHeadingScrollRequest] = useState<SourceHeadingScrollRequest>();
  // 折叠集合:由 AppLayout 拥有,用于"搜索命中自动展开"等命令式扩展。
  // Cm6MarkdownEditorPane 通过 foldedHeadings + onFoldChange 双向同步。
  const [foldedHeadings, setFoldedHeadings] = useState<ReadonlySet<FoldKey>>(() => new Set());
  const handleEditorFoldChange = useCallback((next: ReadonlySet<FoldKey>) => {
    setFoldedHeadings((prev) => sameFoldSet(prev, next) ? prev : new Set(next));
  }, []);
  const [htmlPresentationVisible, setHtmlPresentationVisible] = useState(false);
  const [htmlPreviewTarget, setHtmlPreviewTarget] = useState<string | null>(null);
  const [terminalVisible, setTerminalVisible] = useState(false);
  const [terminalHeight, setTerminalHeight] = useState(300);
  const [terminalCreateRequest, setTerminalCreateRequest] = useState(0);
  const [systemOpenChecked, setSystemOpenChecked] = useState(!isTauriRuntime);
  const [updateState, setUpdateState] = useState<UpdateInstallState>({ phase: 'idle' });
  const [pdfExporting, setPdfExporting] = useState(false);
  const [wordExporting, setWordExporting] = useState(false);
  const [exportToast, setExportToast] = useState<{
    type: 'running' | 'success' | 'error';
    title: string;
    detail?: string;
  } | null>(null);
  const exportToastTimerRef = useRef<number | null>(null);
  const [autoSaveError, setAutoSaveError] = useState('');
  const [diskChangeMessage, setDiskChangeMessage] = useState('');
  const [transientMessage, setTransientMessage] = useState('');
  const resolveTocHeading = useCallback((item: TocItem, index: number): HTMLElement | null => {
    const byId = document.getElementById(item.id);
    if (byId instanceof HTMLElement) return byId;

    const root = mainContentRef.current;
    if (!root) return null;

    // 同时兼容 Vditor IR/WYSIWYG 与 CM6 源码模式。
    // CM6 下 heading 是 .cm-content 里的语义 h1..h6(atomic-editor 用真实标签,
    // 而非自定义 span),不命中 Vditor selector 会导致 TOC 跳转永远 index 越界。
    const headings = root.querySelectorAll<HTMLElement>(
      '.vditor-ir h1, .vditor-ir h2, .vditor-ir h3, .vditor-ir h4, .vditor-ir h5, .vditor-ir h6, '
      + '.vditor-wysiwyg h1, .vditor-wysiwyg h2, .vditor-wysiwyg h3, .vditor-wysiwyg h4, .vditor-wysiwyg h5, .vditor-wysiwyg h6, '
      + '.cm-content h1, .cm-content h2, .cm-content h3, .cm-content h4, .cm-content h5, .cm-content h6',
    );
    return headings[index] ?? null;
  }, []);
  const {
    toc,
    setToc,
    activeTocIndex,
    tocPinned,
    handleTocNavigate,
    handleTocPinnedChange,
    handleTocAlwaysPinnedChange,
  } = useTocState({
    editorMode,
    editorEngine,
    alwaysPinned: settings.tocAlwaysPinned,
    mainContentRef,
    resolveTocHeading,
    setSourceHeadingScrollRequest,
  });
  // 模式 ref 解决「getDefaultRightPanelWidth 在 rightPanelMode 声明前定义」的问题。
  const rightPanelModeRef = useRef<RightPanelMode>('none');
  const getDefaultRightPanelWidth = useCallback(() => {
    // 模式分支:word/wechat/htmlPreview 跟编辑器 1:1(可用空间均分);其他模式跟左栏一致 360。
    const containerWidth = mainContentRef.current?.getBoundingClientRect().width ?? window.innerWidth;
    const mode = rightPanelModeRef.current;
    if (mode === 'word' || mode === 'wechat' || mode === 'htmlPreview') {
      const available = containerWidth - WORKSPACE_PANEL_DEFAULT_WIDTH - RIGHT_PANEL_RESIZER_GAP;
      const target = Math.round(available / 2);
      return Math.min(RIGHT_PANEL_MAX_WIDTH, Math.max(RIGHT_PANEL_MIN_WIDTH, target));
    }
    return 360;
  }, []);
  const {
    rightPanelMode,
    setRightPanelMode,
    rightPanelWidth,
    setRightPanelWidth,
    resizing,
    handleRightPanelResizerPointerDown,
  } = useRightPanel({
    containerRef: mainContentRef,
    minWidth: RIGHT_PANEL_MIN_WIDTH,
    maxWidth: RIGHT_PANEL_MAX_WIDTH,
    getDefaultRightPanelWidth,
  });
  // 模式变化时同步 ref 并按新模式重算默认宽度
  useEffect(() => {
    rightPanelModeRef.current = rightPanelMode;
    if (rightPanelMode !== 'none') {
      setRightPanelWidth(getDefaultRightPanelWidth());
    }
  }, [rightPanelMode, getDefaultRightPanelWidth, setRightPanelWidth]);
  const {
    file,
    openTabs,
    activeTabId,
    fileRef,
    lastSelfWriteRef,
    dirtyPaths,
    saveVisualState,
    shouldShowTabbar,
    unsavedDialog,
    renameDialog,
    setRenameDialog,
    externalChangeConflict,
    diffPreview,
    setDiffPreview,
    handleUnsavedChoice,
    handleOpen,
    handleNewFile,
    handleOpenPath,
    handleSwitchTab,
    handleCloseTab,
    handleRequestRename,
    handleConfirmRename,
    handleSave,
    handleSaveAs,
    handleContentChange,
    handleViewDiff,
    handleAcceptExternal,
    handleKeepMine,
  } = useFileTabs({
    defaultEncoding: settings.defaultEncoding,
    autoSaveEnabled: settings.autoSave,
    isTauriRuntime,
    setToc,
    setAutoSaveError,
    setDiskChangeMessage,
    setTransientMessage,
    setFindVisible,
    setHtmlPresentationVisible,
    setRightPanelMode,
    setEditorMode,
    extractToc,
  });
  useEffect(() => {
    setFoldedHeadings(new Set());
  }, [activeTabId]);
  const debouncedStatsSource = useDebouncedValue(file.fileType === 'docx' ? '' : file.content, 260);
  const documentStats = useMemo(
    () => file.fileType === 'docx' ? undefined : calculateDocumentStats(debouncedStatsSource),
    [debouncedStatsSource, file.fileType],
  );
  const [defaultAiWorkspaceRoot, setDefaultAiWorkspaceRoot] = useState('');
  useEffect(() => {
    if (!isTauriRuntime) return;
    let cancelled = false;
    void import('@tauri-apps/api/path')
      .then(async ({ homeDir, join }) => {
        const home = await homeDir();
        return join(home, '.typola', 'userdata');
      })
      .then((path) => {
        if (!cancelled) setDefaultAiWorkspaceRoot(path);
      })
      .catch((error) => console.warn('Failed to resolve default AI workspace:', error));
    return () => {
      cancelled = true;
    };
  }, [isTauriRuntime]);
  const effectiveAiWorkspaceRoot = useMemo(() => resolveWorkbenchWorkspaceRoot({
    configuredWorkspaceRoot: settings.aiWorkspaceRoot,
    defaultWorkspaceRoot: workspaceRoot || defaultAiWorkspaceRoot,
  }), [defaultAiWorkspaceRoot, settings.aiWorkspaceRoot, workspaceRoot]);
  const outputBaseDir = useMemo(() => (
    effectiveAiWorkspaceRoot
      ? joinLocalPath(effectiveAiWorkspaceRoot, '.typola-output')
      : undefined
  ), [effectiveAiWorkspaceRoot]);
  const {
    leftRailMode,
    setLeftRailMode,
    workspacePanelWidth,
    setWorkspacePanelWidth,
    leftResizing,
    handleToggleWorkspacePanel,
    handleToggleAiPanel,
    handleLeftPanelResizerPointerDown,
  } = useLeftRail({
    aiWorkbenchEnabled: file.fileType !== 'docx',
    defaultWidth: WORKSPACE_PANEL_DEFAULT_WIDTH,
    minWidth: LEFT_PANEL_MIN_WIDTH,
    maxWidth: LEFT_PANEL_MAX_WIDTH,
  });
  const { docMode, setDocMode } = useDocumentMode({
    enabled: file.fileType !== 'docx',
    isTauriRuntime,
    leftRailMode,
    setLeftRailMode,
    rightPanelMode,
    setRightPanelMode,
    rightPanelWidth,
    setRightPanelWidth,
    terminalVisible,
    setTerminalVisible,
    setWorkspacePanelWidth,
    flowLeftPanelWidth: FLOW_LEFT_PANEL_WIDTH,
    flowRightPanelWidth: FLOW_RIGHT_PANEL_WIDTH,
  });

  useEffect(() => {
    document.documentElement.dataset.docMode = docMode;
    document.documentElement.dataset.reviewEnhanceMarks = settings.themeOptions.reviewEnhanceMarks ? 'true' : 'false';
  }, [docMode, settings.themeOptions.reviewEnhanceMarks]);

  // 检视意见状态 + 输入浮卡 state(任务 #12 浮条入口) ===
  const reviewStateApi = useReviewState(file.path);
  const [reviewEditor, setReviewEditor] = useState<{
    x: number;
    y: number;
    anchor: SelectionAnchor;
    initialText: string;
    /** 非 null = 编辑现有意见;null = 新增 */
    editingId: string | null;
  } | null>(null);
  const handleReviewRequested = useCallback((anchor: SelectionAnchor, origin: { x: number; y: number }) => {
    setReviewEditor({ x: origin.x, y: origin.y, anchor, initialText: '', editingId: null });
  }, []);

  // 选区原地闭环用的 oneshot wrapper:绑好 settings 里的 claude 参数 + 工作区 dirs。
  // 不传 cwd(oneshot 不产文件,不需要落 .typola-output 子目录),让 claude 默认即可。
  const runEditorOneshot = useCallback((prompt: string, signal: AbortSignal): Promise<string> => {
    return runSkillOneshot({
      prompt,
      agentPath: settings.aiClaudePath,
      model: settings.aiClaudeModel,
      pluginDirs: settings.aiPluginDirs,
      extraAllowedDirs: effectiveAiWorkspaceRoot ? [effectiveAiWorkspaceRoot] : undefined,
      signal,
    });
  }, [effectiveAiWorkspaceRoot, settings.aiClaudePath, settings.aiClaudeModel, settings.aiPluginDirs]);

  const { skillHub, skillHubError, handleSaveSkillHub, handleReloadSkillHub } = useSkillHubState();
  // 选 skill → 新建会话 + 切左栏 + 预填 composer 的桥梁;{tick, text} 防止同 text 重复触发。
  const [skillPrefill, setSkillPrefill] = useState<{ tick: number; text: string } | null>(null);
  const {
    agentChangedPaths,
    workspaceTreeVersion,
    rememberArtifact,
    clearArtifacts: handleClearArtifacts,
    forgetArtifact,
    bumpWorkspaceTreeVersion,
  } = useWorkspaceWatch({
    isTauriRuntime,
    watchRoot: outputBaseDir,
    outputRoot: outputBaseDir,
    lastSelfWriteRef,
  });

  const convManager = useConversationManager({
    workspaceRoot: effectiveAiWorkspaceRoot,
    agentProvider: settings.aiActiveProvider,
    claudePath: settings.aiClaudePath,
    claudeModel: settings.aiClaudeModel,
    openCodePath: settings.aiOpenCodePath,
    openCodeModel: settings.aiOpenCodeModel,
    pluginDirs: settings.aiPluginDirs,
    onArtifactFile: (artifact) => {
      rememberArtifact(artifact.path);
    },
  });

  const {
    handleEditorAIAction,
    resultCard,
    closeResultCard,
    acceptResultCard,
    retryResultCard,
    copyResultCard,
    submitResultCardInput,
  } = useEditorSelectionBridge({
    editorCommandRef,
    setLeftRailMode,
    convManager,
    runOneshot: runEditorOneshot,
    onReviewRequested: handleReviewRequested,
  });

  // AI 改稿列表:跟当前文档相关的 {stem}.ai改{N}.md。Claude 写文件时 agentChangedPaths 变化 → 自动重扫。
  const { revisions: aiRevisions, refresh: refreshRevisions } = useRevisionList({
    outputBaseDir,
    currentFilePath: file.path,
    agentChangedPaths,
  });

  useEffect(() => {
    const refreshRecentFiles = () => setRecentFiles(getRecentFiles());
    window.addEventListener('typola-recent-files-changed', refreshRecentFiles);
    return () => window.removeEventListener('typola-recent-files-changed', refreshRecentFiles);
  }, []);

  useEffect(() => {
    if (!transientMessage) return;
    const timeout = window.setTimeout(() => setTransientMessage(''), 1800);
    return () => window.clearTimeout(timeout);
  }, [transientMessage]);

  const showExportToast = useCallback((toast: {
    type: 'running' | 'success' | 'error';
    title: string;
    detail?: string;
  }) => {
    if (exportToastTimerRef.current !== null) {
      window.clearTimeout(exportToastTimerRef.current);
      exportToastTimerRef.current = null;
    }
    setExportToast(toast);
    if (toast.type !== 'running') {
      exportToastTimerRef.current = window.setTimeout(() => {
        setExportToast(null);
        exportToastTimerRef.current = null;
      }, 3600);
    }
  }, []);

  useEffect(() => {
    applyThemeToDocument(document, settings.themeId);
  }, [settings.themeId]);

  useEffect(() => {
    /* Kick off the settings chunk immediately on mount so the modal is fully
       loaded by the time the user first opens it. The dynamic import is small
       (≈10KB after ISS-126) and runs in parallel with the initial render. */
    void preloadSettingsPage();
  }, []);

  // 任务 #15 发 AI 改用的截断 helper(避免引文太长拖累 prompt)
  const truncate = useCallback((text: string, max: number): string => (
    text.length <= max ? text : `${text.slice(0, max)}…`
  ), []);

  // 任务 #14 导出检视版:把意见按行内段后格式注入原文,另存为 {stem}-检视版{N}.md。
  // 版本号 N = 源文件目录下已有「-检视版{N}.md」的最大值 + 1;扫不到就 N=1。
  const handleExportReviewMarkdown = useCallback(async () => {
    if (!file.path) {
      await messageDialog('请先打开文档再导出检视版。', { title: '导出检视版' });
      return;
    }
    const { state, markClean } = reviewStateApi;
    if (state.comments.length === 0) return;
    const reviewMd = buildReviewMarkdown(file.content, state.comments);
    const baseName = file.path.replace(/\\/g, '/').split('/').pop() ?? 'document.md';
    const stem = baseName.replace(/\.[^.]+$/u, '');
    const sep = file.path.includes('\\') ? '\\' : '/';
    const dir = file.path.replace(/[\\/][^\\/]+$/u, '');
    // 扫源文件目录下现有版本号,取 max+1;扫不到回退到 1。
    let nextVersion = 1;
    try {
      const { readDir } = await import('@tauri-apps/plugin-fs');
      const entries = await readDir(dir);
      const pattern = new RegExp(`^${escapeRegExp(stem)}-检视版(\\d+)\\.md$`, 'u');
      const versions = entries
        .filter((e: { name: string; isFile: boolean }) => e.isFile)
        .map((e: { name: string }) => e.name.match(pattern)?.[1])
        .filter((v: string | undefined): v is string => !!v)
        .map((v: string) => Number.parseInt(v, 10))
        .filter((n: number) => Number.isFinite(n));
      if (versions.length > 0) nextVersion = Math.max(...versions) + 1;
    } catch {
      /* 读不到目录就 N=1,saveDialog 仍可让用户改 */
    }
    const defaultName = `${stem}-检视版${nextVersion}.md`;
    const defaultPath = dir ? `${dir}${sep}${defaultName}` : defaultName;
    try {
      const target = await saveFileDialog(defaultPath);
      if (!target) return;
      await writeTextFile(target, reviewMd);
      await ensureArtifactManifest({
        primaryFile: target,
        outputRoot: outputBaseDir,
        workspaceRoot: effectiveAiWorkspaceRoot,
        sourceType: 'review_export',
        documentPath: file.path,
        documentName: file.name,
        conversationId: convManager.activeConvId,
        agentId: 'typola',
        agentLabel: 'Typola',
        title: `检视版 · ${file.name}`,
      }).catch((manifestError) => console.warn('Failed to write review artifact manifest:', manifestError));
      setArtifactLibraryRefreshKey((key) => key + 1);
      markClean();
      setTransientMessage(`已导出检视版:${target.split(/[\\/]/).pop()}`);
    } catch (error) {
      await messageDialog(String(error), { title: '导出失败' });
    }
  }, [convManager.activeConvId, effectiveAiWorkspaceRoot, file.content, file.name, file.path, outputBaseDir, reviewStateApi]);

  // 任务 #15 发 AI 改:把全文 + 所有意见拼成 prompt,新会话发送,走产物回流。
  // 文件命名约定:{stem}.ai改{N}.md(N 递增),所以每次发送前先扫一遍现有 N,取 max+1。
  const handleSendReviewToAI = useCallback(async () => {
    if (!file.path) {
      await messageDialog('请先打开文档再发起 AI 修改。', { title: '发 AI 改' });
      return;
    }
    const { state, markClean } = reviewStateApi;
    if (state.comments.length === 0) return;
    const fileName = file.path.replace(/\\/g, '/').split('/').pop() ?? 'document.md';
    const stem = fileName.replace(/\.[^.]+$/u, '');
    // 现有 N 取 max + 1;列表为空/扫不到 → 1。同步刷一次确保最新。
    refreshRevisions();
    const existingVersions = aiRevisions
      .filter((r: { name: string }) => r.name.startsWith(`${stem}.ai改`))
      .map((r: { version?: number }) => r.version ?? 0);
    const nextVersion = (existingVersions.length ? Math.max(...existingVersions) : 0) + 1;
    const targetFileName = `${stem}.ai改${nextVersion}.md`;
    // 拼 prompt:只传当前文件路径 + 每条意见的锚点,不把全文塞进 prompt。
    // 找不到/多处重复 → 跳过;不要扩大修改范围。
    const commentsBlock = state.comments.map((c, idx) => {
      const original = c.anchor.originalText || '(空)';
      const hint = c.anchor.prefixHint
        ? `前缀「${truncate(c.anchor.prefixHint, 40)}」+ `
        : '';
      return `${idx + 1}. 锚点 = ${hint}原文「${truncate(original, 160)}」\n   意见:${c.text}`;
    }).join('\n\n');
    const prompt = [
      `请按以下检视意见,修改指定文稿并产出一份完整的、可替换原文的新版本。`,
      '',
      '**严格修改规则(务必遵守):**',
      `- 指定文稿路径:${file.path}`,
      '- 改稿范围仅限上述指定文稿;不要读取、搜索、引用或修改任何其他文件',
      '- 不要扫描工作区,不要根据相邻文件、目录、README 或历史版本补充上下文',
      '- 每条意见都附了精确锚点 = 「前缀 prefixHint」+「原文 originalText」共同唯一定位',
      `- 每条意见**只修改该锚点对应的那一小段原文**,其他位置一律不动`,
      `- 如果 prefixHint + originalText 在文档中找不到唯一位置(已被改动 / 重复多次),**跳过该条意见,不修改任何内容**`,
      '- 不要因为「上下文衔接」「行文更顺」等原因扩大修改范围',
      '- 不要调整未标记意见的段落、标题、列表、引用、代码块',
      '- 保留原文风格、章节结构、格式标记',
      '- 不要把意见本身留在结果里',
      `- 把修改后的完整 markdown 通过 Write 工具落到当前工作目录,文件名必须是:`,
      `  ${targetFileName}`,
      '',
      '## 检视意见清单(每条带唯一锚点 prefixHint + originalText)',
      '',
      commentsBlock,
    ].join('\n');
    // 创建新会话 + 切左栏,然后立即发送到该 conv(用 send 的 opts.conversationId 兜底 active ref 异步)
    const newConvId = convManager.createConversation('检视修改');
    setLeftRailMode('aiWorkbench');
    try {
      await convManager.send(prompt, { conversationId: newConvId, referencePaths: [file.path] });
      markClean();
      setTransientMessage(`已交给 AI 修改,改后版本将作为「${targetFileName}」回到右栏列表`);
    } catch (error) {
      await messageDialog(String(error), { title: '发起 AI 修改失败' });
    }
  }, [aiRevisions, convManager, file.path, refreshRevisions, reviewStateApi, setLeftRailMode, truncate]);

  const handleExportWord = useCallback(async () => {
    if (wordExporting) return;
    if (file.fileType === 'docx') {
      showExportToast({
        type: 'error',
        title: 'Word 导出失败',
        detail: '当前 Word 预览文件暂不支持再次导出。',
      });
      return;
    }
    setWordExporting(true);
    showExportToast({ type: 'running', title: '正在后台导出 Word', detail: file.name });
    try {
      const { exportToWord } = await import('../services/wordExportService');
      const savePath = await exportToWord(file.content, file.name, file.path || undefined, getExportPresetConfig());
      if (savePath) {
        showExportToast({ type: 'success', title: 'Word 导出完成', detail: savePath });
      }
    } catch (e) {
      console.error('Export failed:', e);
      const { humanizeExportError } = await import('../services/exportErrors');
      showExportToast({ type: 'error', title: 'Word 导出失败', detail: humanizeExportError(e, 'Word') });
    } finally {
      setWordExporting(false);
    }
  }, [file.content, file.fileType, file.name, file.path, showExportToast, wordExporting]);

  const handleExportPdf = useCallback(async () => {
    if (pdfExporting) return;
    if (file.fileType === 'docx') {
      showExportToast({
        type: 'error',
        title: 'PDF 导出失败',
        detail: '请先将 Word 内容保存为 Markdown 或 HTML 后再导出 PDF。',
      });
      return;
    }
    setPdfExporting(true);
    showExportToast({ type: 'running', title: '正在后台导出 PDF', detail: file.name });
    try {
      const { exportToPdf } = await import('../services/pdfExport');
      const savePath = await exportToPdf({
        content: file.content,
        fileName: file.name,
        filePath: file.path || undefined,
        resolvedPreviewFontFamily: resolvePreviewFontFamily(settings),
        resolvedPreviewHeadingFontFamily: resolvePreviewHeadingFontFamily(settings),
        previewFontSize: settings.previewFontSize,
        previewLineHeight: settings.previewLineHeight,
      });
      if (savePath) {
        showExportToast({ type: 'success', title: 'PDF 导出完成', detail: savePath });
      }
    } catch (error) {
      console.error('PDF export failed:', error);
      const { humanizeExportError } = await import('../services/exportErrors');
      showExportToast({ type: 'error', title: 'PDF 导出失败', detail: humanizeExportError(error, 'PDF') });
    } finally {
      setPdfExporting(false);
    }
  }, [file.content, file.fileType, file.name, file.path, pdfExporting, settings, showExportToast]);

  const replaceCurrentContent = useCallback((value: string) => {
    handleContentChange(value);
    editorCommandRef.current?.focus();
  }, [handleContentChange]);

  // AI Diff Preview 审阅态控制器。应用时把合并结果写回当前文档:
  // P0-2 走编辑器的 commitAIReplacement,把整篇合并作为一条原子操作压入 AI 撤销栈,
  // 一次 Ctrl+Z 整体回退。回退失败时退化为 replaceCurrentContent。
  const diffReviewController = useDiffReview(useCallback((merged: string) => {
    const handle = editorCommandRef.current;
    if (handle?.commitAIReplacement) {
      handle.commitAIReplacement(merged);
    } else {
      replaceCurrentContent(merged);
    }
    setTransientMessage('AI 改动已应用,一次 Ctrl+Z 可整体回退。');
  }, [replaceCurrentContent]));

  // P0-1:切 tab / 切文档 / 关 tab 时若审阅态打开,先 close(SPEC §2.7
  // "切 tab:先退审阅(丢 pending)再切")。监听 file.path 变化即可覆盖三入口。
  const diffReviewIsOpenRef = useRef(diffReviewController.state.isOpen);
  useEffect(() => {
    diffReviewIsOpenRef.current = diffReviewController.state.isOpen;
  }, [diffReviewController.state.isOpen]);
  useEffect(() => {
    if (diffReviewIsOpenRef.current) {
      diffReviewController.close();
    }
  }, [file.path, diffReviewController]);

  // 检视面板的「以 Diff 审阅」入口:读改稿文件 → diff(当前文档,改稿)→ 开审阅态。
  // SPEC §2.1 A 类:检视产物已声明"是当前文档修订版",直接进。
  const handleReviewRevision = useCallback(async (revisionPath: string) => {
    if (!file.path) {
      await messageDialog('请先打开原文档再审阅 AI 改稿。', { title: '以 Diff 审阅' });
      return;
    }
    try {
      const proposedContent = await readTextFile(revisionPath);
      const revisionName = revisionPath.replace(/\\/g, '/').split('/').pop() ?? '改稿';
      diffReviewController.open({
        source: 'review',
        title: `审阅 AI 改稿:${revisionName}`,
        originalContent: file.content,
        proposedContent,
      });
    } catch (error) {
      await messageDialog(`读取改稿失败:${String(error)}`, { title: '以 Diff 审阅' });
    }
  }, [diffReviewController, file.content, file.path]);

  const handleSearchNavigate = useCallback((
    match: SearchMatch,
    query: string,
    searchOptions: SearchOptions,
    _backwards = false,
  ) => {
    // preserveFocus:搜索导航必须不抢焦点,否则 FindReplacePanel 输入框失焦,
    // 后续按键打进文档(包括 Esc 再 Ctrl+F 后的 type 会破坏文档内容)。
    // searchOptions:透传到 WYSIWYG 模式的 findTextNodeRange + getSearchMatchOccurrenceIndex,
    // 让 IR 里的 case/regex/wholeWord 匹配跟 FindReplacePanel 的 findSearchMatches 完全一致。
    //
    // PR5:折叠区域内命中时先自动展开 — 否则命中位置不可视,scrollIntoView 也无意义。
    // 用 collectHeadingSections 找覆盖 match 位置的最深 heading section,
    // 仅当其 foldKey 出现在 foldedHeadings 时移除该 key。
    if (editorEngine === 'cm6' && editorMode === 'source') {
      const sections = collectHeadingSections(file.content);
      const matchStartLine = lineIndexAtOffset(file.content, match.index);
      const coveringKeys: FoldKey[] = [];
      for (const section of sections) {
        if (section.headingLine <= matchStartLine && matchStartLine <= section.endLine) {
          // 展开命中行所在的完整父链,否则只展开最深层时父 heading 仍可能折住内容。
          coveringKeys.push(foldKey(section.level, section.text, section.sectionIndex));
        }
      }
      if (coveringKeys.some((key) => foldedHeadings.has(key))) {
        setFoldedHeadings((prev) => {
          const next = new Set(prev);
          for (const key of coveringKeys) next.delete(key);
          return sameFoldSet(prev, next) ? prev : next;
        });
      }
    }
    const text = editorMode === 'source' ? match.text : (query || match.text);
    editorCommandRef.current?.revealRange(match.index, match.index + match.length, {
      text,
      preserveFocus: true,
      query,
      searchOptions,
    });
  }, [editorEngine, editorMode, file.content, foldedHeadings]);

  // 在指定 doc 位置插入;pos=null 时回退到当前 selection 末尾。
  const insertMarkdownAt = useCallback((markdown: string, pos: number | null) => {
    if (fileRef.current.fileType === 'docx') return;
    if (pos == null) {
      editorCommandRef.current?.insertText(markdown);
      return;
    }
    editorCommandRef.current?.insertTextAt(markdown, pos);
  }, []);
  const recentImageInsertRef = useRef<{ key: string; at: number } | null>(null);

  // 把视口坐标映射到编辑器 doc 位置。drop / paste 场景使用。
  const resolveInsertPosition = useCallback((clientX?: number, clientY?: number): number | null => {
    if (clientX == null || clientY == null) return null;
    return editorCommandRef.current?.posAtCoords(clientX, clientY) ?? null;
  }, []);

  // 三入口统一(粘贴 / 拖拽 / 选本地文件)→ 按 settings.imageInsertAction 走 keep/copy/upload
  // 三态。upload 失败回退本地复制,保证图片不丢。
  // insertAt:外部 drop/paste 解析出的 doc 位置;null = 当前 selection 末尾。
  const insertImageFromSource = useCallback(async (source: {
    localPath?: string;
    bytes?: Uint8Array;
    fileName?: string;
    mime?: string;
  }, insertAt: number | null = null) => {
    const currentFile = fileRef.current;
    if (currentFile.fileType === 'docx') return;
    const dedupeKey = source.localPath
      ? `path:${source.localPath}`
      : `blob:${source.fileName ?? ''}:${source.mime ?? ''}:${source.bytes?.byteLength ?? 0}`;
    const now = Date.now();
    if (recentImageInsertRef.current?.key === dedupeKey && now - recentImageInsertRef.current.at < 800) {
      return;
    }
    recentImageInsertRef.current = { key: dedupeKey, at: now };
    if (!currentFile.path) {
      setTransientMessage('请先保存文档，再插入图片。');
      return;
    }

    const { invoke } = await import('@tauri-apps/api/core');
    const resolved = resolveImageInsertAction(settings, currentFile.content);
    let action = resolved.action;
    if (source.localPath && !settings.imageApplyToLocal) action = 'keep';
    if (!source.localPath && action === 'keep') action = 'copy';

    const copyDestination = resolveCopyDestination(currentFile.path, resolved.copyDestination);
    const fileName = source.fileName
      ?? (source.localPath ? source.localPath.replace(/\\/g, '/').split('/').pop() : undefined)
      ?? `pasted-${new Date().toISOString().replace(/[:.]/g, '-')}.${imageExtensionFromMime(source.mime ?? 'image/png')}`;

    const copyImage = async () => {
      const result = await invoke<{ path: string }>('process_inserted_image', {
        request: {
          documentPath: currentFile.path,
          sourceBytes: source.bytes ? Array.from(source.bytes) : undefined,
          sourcePath: source.localPath,
          fileName,
          copyDestination,
        },
      });
      return result.path;
    };

    try {
      if (action === 'keep' && source.localPath) {
        const src = formatImageSrc(source.localPath, currentFile.path, settings);
        insertMarkdownAt(createImageMarkdown('图片', src), insertAt);
        return;
      }

      if (action === 'upload' && settings.imageUploadCommand.trim()) {
        let uploadPath = source.localPath;
        if (!uploadPath) uploadPath = await copyImage();
        try {
          const uploadResult = await invoke<{ urls: string[]; rawStdout: string }>('upload_image_via_command', {
            request: {
              command: settings.imageUploadCommand,
              imagePaths: [uploadPath],
              documentPath: currentFile.path,
              documentName: pathBasenameWithoutExtension(currentFile.path),
            },
          });
          const [url] = uploadResult.urls.length > 0
            ? uploadResult.urls
            : parseUploadUrls(uploadResult.rawStdout, 1);
          insertMarkdownAt(createImageMarkdown('图片', url), insertAt);
          setTransientMessage('图片已上传。');
          return;
        } catch (error) {
          console.warn('Image upload failed, falling back to copy:', error);
          setTransientMessage('图片上传失败，已回退为本地复制。');
          const copied = source.localPath ? await copyImage() : uploadPath;
          insertMarkdownAt(createImageMarkdown('图片', formatImageSrc(copied, currentFile.path, settings)), insertAt);
          return;
        }
      }

      const copiedPath = await copyImage();
      insertMarkdownAt(createImageMarkdown('图片', formatImageSrc(copiedPath, currentFile.path, settings)), insertAt);
      setTransientMessage(`图片已保存到 ${copyDestination}。`);
    } catch (error) {
      console.warn('Failed to insert image:', error);
      setTransientMessage('图片插入失败。');
    }
  }, [insertMarkdownAt, settings]);

  // 工具栏/菜单「插入本地图片」入口:打开系统文件对话框 → 走 insertImageFromSource。
  const handleSelectLocalImage = useCallback(async () => {
    if (fileRef.current.fileType === 'docx') return;
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'] }],
      });
      if (typeof selected !== 'string') return;
      await insertImageFromSource({ localPath: selected });
    } catch (error) {
      console.warn('Failed to select image:', error);
      setTransientMessage('选择图片失败。');
    }
  }, [insertImageFromSource]);

  const openFindPanel = useCallback((focusTarget: 'find' | 'replace') => {
    setFindFocusTarget(focusTarget);
    setFindVisible(true);
  }, []);

  const handleToggleEditorMode = useCallback(() => {
    if (file.fileType === 'docx') return;
    setHtmlPresentationVisible(false);
    setEditorMode((mode) => mode === 'source' ? 'wysiwyg' : 'source');
  }, [file.fileType]);

  const handleToggleWordPreview = useCallback(() => {
    if (file.fileType === 'docx') return;
    setHtmlPresentationVisible(false);
    setRightPanelMode((mode) => {
      if (mode === 'word') return 'none';
      setRightPanelWidth(getDefaultRightPanelWidth());
      return 'word';
    });
  }, [file.fileType, getDefaultRightPanelWidth]);

  const handleToggleWechatPreview = useCallback(() => {
    if (file.fileType === 'docx') return;
    setHtmlPresentationVisible(false);
    setRightPanelMode((mode) => {
      if (mode === 'wechat') return 'none';
      setRightPanelWidth(getDefaultRightPanelWidth());
      return 'wechat';
    });
  }, [file.fileType, getDefaultRightPanelWidth]);

  const handleToggleTerminal = useCallback(() => {
    setTerminalVisible((visible) => !visible);
  }, []);

  const handleCreateTerminal = useCallback(() => {
    setTerminalVisible(true);
    setTerminalCreateRequest((request) => request + 1);
  }, []);

  const handlePickSkill = useCallback((payload: SkillPickPayload) => {
    const provider = convManager.activeProvider;
    const title = payload.skill.label ?? payload.skill.name;
    convManager.createConversation(title, payload.skill.name, provider);
    setLeftRailMode('aiWorkbench');
    // 用 scene + skill 派生 prefill,符合 plan §10.3 三种分支
    // (builtin/prefill 模板/fallback goal)。
    const template = payload.skill.template;
    setSkillPrefill({
      tick: Date.now(),
      text: buildSkillPrefill(provider, template ?? { name: payload.skill.name, system: true }, payload.scene),
    });
  }, [convManager]);

  const handleInstallSkill = useCallback((prompt: string) => {
    setLeftRailMode('aiWorkbench');
    void convManager.send(prompt);
  }, [convManager]);

  const handleSkillPrefillConsumed = useCallback(() => {
    setSkillPrefill(null);
  }, []);

  const handleQuickOpenPath = useCallback((path: string) => {
    setQuickOpenVisible(false);
    void handleOpenPath(path).catch((error) => {
      console.warn('Failed to quick open recent file:', error);
    });
  }, [handleOpenPath]);

  const handlePasteImage = useCallback(async (event: ClipboardEvent) => {
    if (fileRef.current.fileType === 'docx') return;
    const imageItem = Array.from(event.clipboardData?.items ?? []).find((item) => item.type.startsWith('image/'));
    if (!imageItem) return;
    event.preventDefault();
    event.stopPropagation();
    if (!fileRef.current.path) {
      setTransientMessage('请先保存文档，再粘贴图片。');
      return;
    }

    const blob = imageItem.getAsFile();
    if (!blob) return;

    try {
      const extension = imageExtensionFromMime(blob.type);
      const fileName = `pasted-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;
      await insertImageFromSource({
        bytes: new Uint8Array(await blob.arrayBuffer()),
        fileName,
        mime: blob.type,
      }, resolveInsertPosition());
    } catch (error) {
      console.warn('Failed to paste image:', error);
      setTransientMessage('图片粘贴失败。');
    }
  }, [insertImageFromSource, resolveInsertPosition]);

  const startBackgroundUpdateDownload = useCallback((source: UpdateSource, update: AvailableUpdate) => {
    if (updateDownloadVersionRef.current === update.version) return;

    updateDownloadVersionRef.current = update.version;
    setUpdateState({ phase: 'downloading', source, update });

    void downloadAppUpdate(update.update)
      .then(() => {
        setUpdateState((current) => {
          if (current.phase !== 'downloading' || current.update.version !== update.version) return current;
          return { phase: 'ready', source, update };
        });
      })
      .catch((error) => {
        updateDownloadVersionRef.current = null;
        setUpdateState({ phase: 'error', source, update, message: toUpdateErrorMessage(error) });
      });
  }, []);

  const handleRestartUpdate = useCallback(async () => {
    if (updateState.phase !== 'ready') return;

    const readyUpdate = updateState.update;
    const source = updateState.source;
    setUpdateState({ phase: 'installing', source, update: readyUpdate });

    try {
      await installDownloadedAppUpdate(readyUpdate.update);
    } catch (error) {
      updateDownloadVersionRef.current = null;
      setUpdateState({ phase: 'error', source, update: readyUpdate, message: toUpdateErrorMessage(error) });
    }
  }, [updateState]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // F3 / Shift+F3 对齐 Typora:跳下一个 / 上一个匹配。无 modifier,先处理。
      // matches 状态在 FindReplacePanel 内,这里通过 CustomEvent 桥接到 panel 的
      // hop listener,避免把整套 search state 上提到 AppLayout。
      if (e.key === 'F3' && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const dir: 1 | -1 = e.shiftKey ? -1 : 1;
        const dispatch = () => window.dispatchEvent(new CustomEvent('typola:find-hop', { detail: dir }));
        if (!findVisible) {
          openFindPanel('find');
          // panel mount 后 listener 才装好,等一帧再 dispatch。
          requestAnimationFrame(dispatch);
        } else {
          dispatch();
        }
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === 'f' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        openFindPanel('find');
        return;
      }
      if (e.key === 'h' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        openFindPanel('replace');
        return;
      }
      if (e.key === 'p' && e.shiftKey && !e.altKey) {
        e.preventDefault();
        setQuickOpenVisible(true);
        return;
      }
      if (e.key === 'p' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        void handleExportPdf();
        return;
      }
      if (e.key === 's' && e.shiftKey && !e.altKey) { e.preventDefault(); handleSaveAs(); return; }
      if (e.key === 's' && !e.shiftKey && !e.altKey) { e.preventDefault(); handleSave(); return; }
      if (isEditableShortcutTarget(e.target)) return;
      if (e.key === 'o' && !e.shiftKey && !e.altKey) { e.preventDefault(); handleOpen(); return; }
      if (e.key === 'n' && !e.shiftKey && !e.altKey) { e.preventDefault(); handleNewFile(); return; }
      if (e.key === 'e' && e.shiftKey && !e.altKey) { e.preventDefault(); handleExportWord(); return; }
      if (e.key === 's' && e.altKey && !e.shiftKey) { e.preventDefault(); handleToggleEditorMode(); return; }
      if (e.key === 'p' && e.altKey && !e.shiftKey) { e.preventDefault(); handleToggleWordPreview(); return; }
      if (e.key === 'm' && e.altKey && !e.shiftKey) { e.preventDefault(); handleToggleWechatPreview(); return; }
      if (e.code === 'Backquote' && e.shiftKey && !e.altKey) { e.preventDefault(); handleCreateTerminal(); return; }
      if (e.code === 'Backquote' && !e.shiftKey && !e.altKey) { e.preventDefault(); handleToggleTerminal(); return; }
      if (e.key === 'a' && e.shiftKey && !e.altKey) { e.preventDefault(); void setDocMode(docMode === 'flow' ? 'read' : 'flow'); return; }
      if (e.key === ',' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        void preloadSettingsPage();
        setSettingsVisible(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    handleOpen,
    handleNewFile,
    handleSave,
    handleSaveAs,
    handleExportWord,
    handleExportPdf,
    handleToggleEditorMode,
    handleToggleWordPreview,
    handleToggleWechatPreview,
    handleToggleTerminal,
    handleCreateTerminal,
    docMode,
    setDocMode,
    openFindPanel,
    findVisible,
  ]);

  useEffect(() => {
    const handler = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const items = e.dataTransfer?.files;
      if (!items || items.length === 0) return;
      if (isTauriRuntime) {
        return;
      }
      const f = items[0];
      const path = (f as unknown as { path?: string }).path;
      // drop 落点 → CM6 pos;落点在编辑器外时回退到当前 selection(insertAt=null)。
      const insertAt = resolveInsertPosition(e.clientX, e.clientY);
      // 优先识别图片:本地路径 or mime type
      if (path && isImagePath(path)) {
        await insertImageFromSource({ localPath: path }, insertAt);
        return;
      }
      if (f.type.startsWith('image/')) {
        await insertImageFromSource({
          bytes: new Uint8Array(await f.arrayBuffer()),
          fileName: f.name,
          mime: f.type,
        }, insertAt);
        return;
      }
      if (path && isOpenableDocumentPath(path)) await handleOpenPath(path);
    };
    const prevent = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); };
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', handler);
    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', handler);
    };
  }, [handleOpenPath, insertImageFromSource, isTauriRuntime, resolveInsertPosition]);

  // 跟踪最后鼠标位置,Tauri drop 不传坐标时 fallback 用。
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const track = (e: MouseEvent) => {
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('mousemove', track);
    return () => window.removeEventListener('mousemove', track);
  }, []);

  useEffect(() => {
    window.addEventListener('paste', handlePasteImage);
    return () => window.removeEventListener('paste', handlePasteImage);
  }, [handlePasteImage]);

  useEffect(() => {
    if (!isTauriRuntime) return;

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void getCurrentWindow()
      .onDragDropEvent((event) => {
        if (event.payload.type !== 'drop') return;
        const payload = event.payload as typeof event.payload & { position?: { x: number; y: number } };
        const mouse = payload.position ?? lastMousePosRef.current;
        const insertAt = mouse ? resolveInsertPosition(mouse.x, mouse.y) : null;
        const imagePath = event.payload.paths.find(isImagePath);
        if (imagePath) {
          void insertImageFromSource({ localPath: imagePath }, insertAt);
          return;
        }
        const path = firstOpenableDocumentPath(event.payload.paths);
        if (path) void handleOpenPath(path);
      })
      .then((fn) => {
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch((e) => console.warn('Failed to bind Tauri file drop:', e));

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [handleOpenPath, insertImageFromSource, isTauriRuntime, resolveInsertPosition]);

  useEffect(() => {
    if (!isTauriRuntime) return;

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    const openFirstSystemPath = (paths: unknown) => {
      if (!Array.isArray(paths)) return;
      const path = firstOpenableDocumentPath(paths.filter((candidate): candidate is string => (
        typeof candidate === 'string'
      )));
      if (!path) return;

      reopenAttempted.current = true;
      void handleOpenPath(path).catch((error) => {
        console.warn('Failed to open system file:', error);
      });
    };

    void Promise.all([
      import('@tauri-apps/api/core'),
      import('@tauri-apps/api/event'),
    ]).then(async ([{ invoke }, { listen }]) => {
      const listener = await listen<string[]>('opened-paths', (event) => {
        openFirstSystemPath(event.payload);
      });

      if (cancelled) {
        listener();
        return;
      }

      unlisten = listener;
      const pendingPaths = await invoke<string[]>('pending_opened_paths');
      if (!cancelled) {
        openFirstSystemPath(pendingPaths);
        setSystemOpenChecked(true);
      }
    }).catch((error) => {
      if (!cancelled) {
        console.warn('Failed to bind system file open:', error);
        setSystemOpenChecked(true);
      }
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [handleOpenPath, isTauriRuntime]);

  useEffect(() => {
    if (!systemOpenChecked || !settings.reopenLastFile || file.path || reopenAttempted.current) return;
    const lastPath = getLastOpenedPath();
    if (!lastPath) return;
    reopenAttempted.current = true;
    let idleId: number | undefined;
    const timeout = window.setTimeout(() => {
      const reopen = () => {
        void handleOpenPath(lastPath).catch((e) => {
          console.warn('Failed to reopen last file:', e);
          clearLastOpenedPath();
        });
      };

      if ('requestIdleCallback' in window) {
        idleId = window.requestIdleCallback(reopen, { timeout: 1500 });
      } else {
        reopen();
      }
    }, 700);

    return () => {
      window.clearTimeout(timeout);
      if (idleId !== undefined && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId);
      }
    };
  }, [file.path, handleOpenPath, settings.reopenLastFile, systemOpenChecked]);

  useEffect(() => {
    if (!settings.autoUpdateCheck || autoUpdateCheckStarted.current || !isTauriRuntime) return;

    return scheduleDelayedAutoUpdateCheck({
      hasStarted: () => autoUpdateCheckStarted.current,
      markStarted: () => {
        autoUpdateCheckStarted.current = true;
      },
      checkForAppUpdate,
      onUpdateAvailable: (result) => startBackgroundUpdateDownload('auto', result),
    });
  }, [isTauriRuntime, settings.autoUpdateCheck, startBackgroundUpdateDownload]);

  const { artifactItems, handleArchiveArtifact } = useArtifactState({
    agentChangedPaths,
    workspaceRoot: effectiveAiWorkspaceRoot,
    onForgetArtifact: forgetArtifact,
    onWorkspaceRefresh: bumpWorkspaceTreeVersion,
    onOpenPath: handleOpenPath,
    onTransientMessage: setTransientMessage,
  });
  const [artifactLibraryRefreshKey, setArtifactLibraryRefreshKey] = useState(0);
  const { records: artifactRecords, refresh: refreshArtifactLibrary } = useArtifactLibrary({
    outputRoot: outputBaseDir,
    refreshKey: `${artifactLibraryRefreshKey}:${agentChangedPaths.size}:${convManager.activeConvId}:${file.path}`,
  });

  useEffect(() => {
    if (!outputBaseDir || agentChangedPaths.size === 0) return;
    const active = convManager.activeConv;
    const paths = [...agentChangedPaths.keys()];
    void Promise.all(paths.map((path) => {
      const name = path.split(/[\\/]/).pop() ?? '';
      const sourceType = /\.ai改\d+\.md$/u.test(name) ? 'review_ai_edit' : 'flow_generation';
      return ensureArtifactManifest({
        primaryFile: path,
        outputRoot: outputBaseDir,
        workspaceRoot: effectiveAiWorkspaceRoot,
        sourceType,
        documentPath: file.path || undefined,
        documentName: file.path ? file.name : undefined,
        conversationId: convManager.activeConvId,
        agentId: active?.provider,
        agentLabel: active?.provider === 'opencode' ? 'OpenCode' : 'Claude Code',
        model: active?.currentModel,
      }).catch((error) => console.warn('Failed to ensure artifact manifest:', error));
    }))
      .then(() => setArtifactLibraryRefreshKey((key) => key + 1));
  }, [agentChangedPaths, convManager.activeConv, convManager.activeConvId, effectiveAiWorkspaceRoot, file.name, file.path, outputBaseDir]);

  const handleDeleteArtifact = useCallback(async (path: string) => {
    const confirmed = await confirmDialog(`确定删除「${path.split(/[\\/]/).pop()}」？删除后不可恢复。`, {
      title: '删除产物',
      okLabel: '删除',
      cancelLabel: '取消',
    });
    if (!confirmed) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('delete_artifact_file', { request: { path, workspaceRoot: effectiveAiWorkspaceRoot ?? '' } });
      forgetArtifact(path);
      setArtifactLibraryRefreshKey((key) => key + 1);
      setTransientMessage(`已删除:${path.split(/[\\/]/).pop()}`);
    } catch (error) {
      await messageDialog(String(error), { title: '删除失败' });
    }
  }, [effectiveAiWorkspaceRoot, forgetArtifact]);

  const handleOverwriteArtifact = useCallback(async (record: ArtifactRecord) => {
    const targetPath = record.manifest.source.documentPath || file.path;
    if (!targetPath) {
      await messageDialog('未找到可覆盖的原文档。请先打开目标文档后再试。', { title: '覆盖原文' });
      return;
    }
    if (file.dirty && targetPath.replace(/\\/g, '/') === file.path.replace(/\\/g, '/')) {
      await messageDialog('当前文档有未保存改动。请先保存后再覆盖，避免覆盖掉你的手写修改。', { title: '覆盖原文' });
      return;
    }
    const confirmed = await confirmDialog(`将用「${record.manifest.title}」覆盖原文档，并自动保存一份可撤销备份。\n\n目标:${targetPath}`, {
      title: '覆盖原文',
      okLabel: '覆盖',
      cancelLabel: '取消',
    });
    if (!confirmed) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke<string>('overwrite_artifact_to_document', {
        request: {
          artifactPath: record.manifest.primaryFile,
          targetPath,
          workspaceRoot: effectiveAiWorkspaceRoot,
          expectedDocumentPath: record.manifest.source.documentPath || file.path || undefined,
        },
      });
      setArtifactLibraryRefreshKey((key) => key + 1);
      await handleOpenPath(targetPath);
      setTransientMessage('已覆盖原文，可在产物卡片中撤销');
    } catch (error) {
      await messageDialog(String(error), { title: '覆盖失败' });
    }
  }, [effectiveAiWorkspaceRoot, file.dirty, file.path, handleOpenPath]);

  const handleUndoArtifactOverwrite = useCallback(async (record: ArtifactRecord) => {
    const targetPath = record.manifest.overwrite?.targetPath || record.manifest.source.documentPath || file.path;
    if (!targetPath) {
      await messageDialog('未找到要恢复的原文档。', { title: '撤销覆盖' });
      return;
    }
    const confirmed = await confirmDialog(`确定撤销覆盖并恢复备份？\n\n目标:${targetPath}`, {
      title: '撤销覆盖',
      okLabel: '撤销覆盖',
      cancelLabel: '取消',
    });
    if (!confirmed) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke<string>('undo_artifact_overwrite', {
        request: {
          artifactPath: record.manifest.primaryFile,
          targetPath,
          workspaceRoot: effectiveAiWorkspaceRoot,
          expectedDocumentPath: record.manifest.source.documentPath || file.path || undefined,
        },
      });
      setArtifactLibraryRefreshKey((key) => key + 1);
      await handleOpenPath(targetPath);
      setTransientMessage('已撤销覆盖并恢复原文');
    } catch (error) {
      await messageDialog(String(error), { title: '撤销失败' });
    }
  }, [effectiveAiWorkspaceRoot, file.path, handleOpenPath]);

  useEffect(() => {
    if (!isTauriRuntime) return;
    const title = file.dirty ? `* ${file.name}` : file.name;
    void getCurrentWindow()
      .setTitle(title)
      .catch((error) => console.warn('Failed to update window title:', error));
  }, [file.dirty, file.name, isTauriRuntime]);

  const isDocx = file.fileType === 'docx';
  const updateToolbarStatus = updateState.phase === 'ready' || updateState.phase === 'installing'
    ? { phase: updateState.phase, version: updateState.update.version }
    : undefined;
  const shouldShowHtmlPresentation = htmlPresentationVisible && file.fileType === 'html' && !isDocx;
  const mainContentClassName = [
    'main-content',
    isDocx ? 'docx-layout' : 'writing-layout',
    rightPanelMode !== 'none' && !isDocx ? 'right-panel-open' : '',
    rightPanelMode === 'word' && !isDocx ? 'word-preview-open' : '',
    rightPanelMode === 'wechat' && !isDocx ? 'wechat-preview-open' : '',
    rightPanelMode === 'flow' && !isDocx ? 'flow-panel-open' : '',
    rightPanelMode === 'htmlPreview' && !isDocx ? 'html-preview-open' : '',
    leftRailMode !== 'none' ? 'left-panel-open' : '',
    leftRailMode === 'aiWorkbench' ? 'conversation-open' : '',
    shouldShowHtmlPresentation ? 'html-presentation-layout' : '',
    leftResizing !== 'none' ? 'is-left-resizing' : '',
    resizing ? 'is-resizing' : '',
  ].filter(Boolean).join(' ');

  const editorPane = isDocx ? (
    <div className="editor-pane readonly-pane">
      <span>Word 文件为只读</span>
    </div>
  ) : editorMode === 'source' ? (
    <Suspense fallback={<div className="editor-pane lazy-pane"><span>源码编辑器加载中</span></div>}>
      <EditorPane
        ref={editorCommandRef}
        source={file.content}
        onChange={handleContentChange}
        headingScrollRequest={sourceHeadingScrollRequest}
        onScrollRatio={handleEditorScrollRatio}
        filePath={file.path}
        onAIAction={handleEditorAIAction}
      />
    </Suspense>
  ) : shouldShowHtmlPresentation ? (
    <Suspense fallback={<div className="html-presentation-pane lazy-pane" aria-label={t('htmlPresentationAria')} />}>
      <HtmlPresentationPane
        source={file.content}
        filePath={file.path}
        onBack={() => setHtmlPresentationVisible(false)}
      />
    </Suspense>
  ) : editorEngine === 'cm6' ? (
    <Suspense fallback={<div className="cm6-markdown-editor-pane lazy-pane"><span>CM6 编辑器加载中</span></div>}>
      <Cm6MarkdownEditorPane
        ref={editorCommandRef}
        source={file.content}
        onChange={handleContentChange}
        headingScrollRequest={sourceHeadingScrollRequest}
        filePath={file.path}
        onScrollRatio={handleEditorScrollRatio}
        onAIAction={handleEditorAIAction}
        onPreviewHeadingChange={handleEditorHeadingChange}
        foldedHeadings={foldedHeadings}
        onFoldChange={handleEditorFoldChange}
      />
    </Suspense>
  ) : (
    <Suspense fallback={<div className="wysiwyg-editor-pane lazy-pane"><span>所见即所得编辑器加载中</span></div>}>
      <WysiwygEditorPane
        ref={editorCommandRef}
        source={file.content}
        onChange={handleContentChange}
        filePath={file.path}
        onScrollRatio={handleEditorScrollRatio}
        onAIAction={handleEditorAIAction}
        reviewComments={reviewStateApi.state.comments}
      />
    </Suspense>
  );

  const rightPanel = rightPanelMode === 'word' && !isDocx ? (
    <Suspense fallback={<aside className="word-preview-panel" aria-label={t('wordPreviewAria')} />}>
      <WordPaperPreviewPane
        ref={previewScrollRef}
        source={file.content}
        previewWidth={rightPanelWidth}
        canExport={Boolean(file.path)}
        onExportWord={handleExportWord}
        onClose={() => setRightPanelMode('none')}
        filePath={file.path}
        onPreviewHeadingScroll={handlePreviewHeadingScroll}
      />
    </Suspense>
  ) : rightPanelMode === 'wechat' && !isDocx ? (
    <Suspense fallback={<aside className="wechat-preview-panel" aria-label={t('wechatPreviewAria')} />}>
      <WechatPreviewPane
        ref={previewScrollRef}
        source={file.content}
        fileName={file.name}
        onClose={() => setRightPanelMode('none')}
        filePath={file.path}
        onPreviewHeadingScroll={handlePreviewHeadingScroll}
      />
    </Suspense>
  ) : rightPanelMode === 'flow' && !isDocx ? (
    <aside className="flow-panel" aria-label="AI 工作流">
      <div className="flow-panel-content">
        <SkillHubPanel
          activeProvider={convManager.activeProvider}
          activeWorkspaceRoot={effectiveAiWorkspaceRoot}
          hub={skillHub}
          loadError={skillHubError}
          onPickSkill={handlePickSkill}
          onInstallSkill={handleInstallSkill}
          onSaveHub={handleSaveSkillHub}
          onReload={handleReloadSkillHub}
        />
      </div>
    </aside>
  ) : rightPanelMode === 'review' && !isDocx ? (
    <ReviewSidebarPanel
      comments={reviewStateApi.state.comments}
      dirty={reviewStateApi.state.dirty}
      currentFilePath={file.path}
      onJump={(comment: ReviewComment) => {
        // 用 anchor 保存的 from/to 直接定位 — 比 revealText(originalText) 更稳:
        // 1) 不依赖文档未修改;2) 即使原文出现多次也跳到创建时的精确位置。
        // preserveFocus 让检视面板保留焦点,用户可以连续点多个意见。
        editorCommandRef.current?.revealRange(comment.anchor.from, comment.anchor.to, {
          preserveFocus: true,
        });
      }}
      onEdit={(comment: ReviewComment) => {
        setReviewEditor({
          x: window.innerWidth / 2 - 180,
          y: window.innerHeight / 2 - 140,
          anchor: comment.anchor,
          initialText: comment.text,
          editingId: comment.id,
        });
      }}
      onRemove={(commentId) => reviewStateApi.removeComment(commentId)}
      onExport={() => void handleExportReviewMarkdown()}
      onSendToAI={() => void handleSendReviewToAI()}
      revisions={aiRevisions}
      onOpenRevision={(path) => { void handleOpenPath(path).catch((e) => console.warn('Failed to open AI revision:', e)); }}
      onReviewRevision={(path) => { void handleReviewRevision(path); }}
      onRefreshRevisions={refreshRevisions}
      onClose={() => setRightPanelMode('none')}
    />
  ) : rightPanelMode === 'artifacts' && !isDocx ? (
    <ArtifactCenterPanel
      records={artifactRecords}
      activeConversationId={convManager.activeConvId}
      onOpen={(path) => { void handleOpenPath(path).catch((error) => console.warn('Failed to open artifact:', error)); }}
      onCompare={(path) => { void handleReviewRevision(path); }}
      onArchive={(path) => { void handleArchiveArtifact(path); setArtifactLibraryRefreshKey((key) => key + 1); }}
      onDelete={(path) => { void handleDeleteArtifact(path); }}
      onOverwrite={(record) => { void handleOverwriteArtifact(record); }}
      onUndoOverwrite={(record) => { void handleUndoArtifactOverwrite(record); }}
      onRefresh={refreshArtifactLibrary}
      onClose={() => setRightPanelMode('none')}
      onPreviewHtml={(path) => {
        setHtmlPreviewTarget(path);
        setRightPanelMode('htmlPreview');
      }}
    />
  ) : rightPanelMode === 'htmlPreview' && htmlPreviewTarget && !isDocx ? (
    <Suspense fallback={<aside className="html-preview-pane" aria-label="HTML 预览" />}>
      <HtmlPreviewPane
        filePath={htmlPreviewTarget}
        fileName={htmlPreviewTarget.split(/[\\/]/).pop()}
        onBackToArtifacts={() => setRightPanelMode('artifacts')}
        onClose={() => {
          setHtmlPreviewTarget(null);
          setRightPanelMode('none');
        }}
      />
    </Suspense>
  ) : null;

  const docxPane = (
    <div className="docx-preview-area">
      <Suspense fallback={<div className="preview-shell" />}>
        <DocxPreviewPane html={file.docxHtml ?? ''} />
      </Suspense>
    </div>
  );
  const appStyle = {
    fontSize: `${settings.zoomLevel}%`,
    '--reading-font-family': resolvePreviewFontFamily(settings),
    '--reading-heading-font-family': resolvePreviewHeadingFontFamily(settings),
  } as CSSProperties;

  return (
    <>
      <AppLayoutChrome
        appStyle={appStyle}
        toolbarProps={{
          dirty: file.dirty,
          fileName: file.name,
          editorMode,
          workspacePanelVisible: leftRailMode === 'workspace',
          wordPreviewVisible: rightPanelMode === 'word',
          wechatPreviewVisible: rightPanelMode === 'wechat',
          artifactsVisible: rightPanelMode === 'artifacts',
          reviewDirty: reviewStateApi.state.dirty,
          terminalVisible,
          editingDisabled: isDocx,
          docMode,
          onToggleEditorMode: handleToggleEditorMode,
          onToggleWorkspacePanel: handleToggleWorkspacePanel,
          onToggleWordPreview: handleToggleWordPreview,
          onToggleWechatPreview: handleToggleWechatPreview,
          onToggleArtifacts: () => setRightPanelMode((mode) => (mode === 'artifacts' ? 'none' : 'artifacts')),
          onToggleTerminal: handleToggleTerminal,
          onSetDocMode: (next) => void setDocMode(next),
          onNew: handleNewFile,
          onOpen: handleOpen,
          onSave: handleSave,
          onSaveAs: handleSaveAs,
          onRename: () => handleRequestRename(),
          onInsertImage: handleSelectLocalImage,
          onExportPdf: handleExportPdf,
          pdfExporting,
          onExportWord: handleExportWord,
          wordExporting,
          onOpenSettings: () => {
            void preloadSettingsPage();
            setSettingsVisible(true);
          },
          onPreloadSettings: preloadSettingsPageInBackground,
          updateStatus: updateToolbarStatus,
          onRestartUpdate: handleRestartUpdate,
        }}
        mainContentRef={mainContentRef}
        mainContentClassName={mainContentClassName}
        rightPanelWidth={rightPanelWidth}
        leftRailMode={leftRailMode}
        workspacePanelWidth={workspacePanelWidth}
        leftResizing={leftResizing}
        onToggleWorkspacePanel={handleToggleWorkspacePanel}
        onToggleAiPanel={handleToggleAiPanel}
        conversationPanelProps={{
          conversations: convManager.conversations,
          activeConvId: convManager.activeConvId,
          messages: convManager.messages,
          runState: convManager.runState,
          lastError: convManager.lastError,
          activeProvider: convManager.activeProvider,
          activeWorkspaceRoot: effectiveAiWorkspaceRoot,
          workspaceSuggestion: workspaceRoot || undefined,
          currentFileName: file.path ? file.name : undefined,
          currentFilePath: file.path || undefined,
          currentModel: convManager.activeConv?.currentModel,
          fileContextInjected: convManager.activeConv?.fileContextInjected ?? false,
          currentFileContextPath: convManager.activeConv?.currentFileContextPath,
          onSelectConversation: convManager.switchConversation,
          onCreateConversation: () => convManager.createConversation(),
          onCloseConversation: convManager.closeConversation,
          onRenameConversation: convManager.renameConversation,
          onSwitchProvider: convManager.switchProvider,
          onSend: convManager.send,
          onCancel: convManager.cancel,
          onReset: convManager.reset,
          onClose: () => setLeftRailMode('none'),
          onConsumePendingInjection: convManager.consumePendingInjection,
          injectionReadyTick: convManager.injectionReadyTick,
          injectionReadyConvId: convManager.injectionReadyConvId,
          skillPrefill,
          onSkillPrefillConsumed: handleSkillPrefillConsumed,
          latestArtifact: artifactItems[0],
          onOpenArtifact: (path) => {
            void handleOpenPath(path).catch((error) => console.warn('Failed to open artifact:', error));
          },
          onArchiveArtifact: handleArchiveArtifact,
          updateConv: convManager.updateConv,
        }}
        fileTreeProps={{
          rootPath: workspaceRoot,
          activePath: file.path,
          dirtyPaths,
          agentChangedPaths: new Set(agentChangedPaths.keys()),
          width: workspacePanelWidth,
          refreshKey: workspaceTreeVersion,
          onRootChange: setWorkspaceRoot,
          onOpenFile: (path) => {
            void handleOpenPath(path).catch((error) => console.warn('Failed to open workspace file:', error));
          },
        }}
        onLeftPanelResize={handleLeftPanelResizerPointerDown}
        showToc={!isDocx}
        tocProps={{
          items: toc,
          activeIndex: activeTocIndex,
          pinned: tocPinned,
          alwaysPinned: settings.tocAlwaysPinned,
          onPinnedChange: handleTocPinnedChange,
          onAlwaysPinnedChange: handleTocAlwaysPinnedChange,
          onNavigate: handleTocNavigate,
        }}
        externalChangeConflict={externalChangeConflict}
        onViewDiff={() => void handleViewDiff()}
        onAcceptExternal={() => void handleAcceptExternal()}
        onKeepMine={handleKeepMine}
        shouldShowTabbar={shouldShowTabbar}
        openTabs={openTabs}
        activeTabId={activeTabId}
        renameTitle={t('toolbarRenameTitle')}
        renameTitleUnsaved={t('toolbarRenameTitleUnsaved')}
        onSwitchTab={handleSwitchTab}
        onRequestRename={handleRequestRename}
        onCloseTab={handleCloseTab}
        isDocx={isDocx}
        editorPane={editorPane}
        docxPane={docxPane}
        rightPanelMode={rightPanelMode}
        resizing={resizing}
        rightPanelResizeLabel={t('rightPanelResizeLabel')}
        rightPanelResizeTitle={t('rightPanelResizeTitle')}
        onRightPanelResize={handleRightPanelResizerPointerDown}
        onResetRightPanelWidth={() => setRightPanelWidth(getDefaultRightPanelWidth())}
        rightPanel={rightPanel}
        onSetRightPanelMode={setRightPanelMode}
        terminalNode={(
          <Suspense fallback={null}>
            <TerminalPanel
              ref={terminalPanelRef}
              visible={terminalVisible}
              height={terminalHeight}
              currentFilePath={file.path}
              workspaceRoot={workspaceRoot || undefined}
              createRequest={terminalCreateRequest}
              onHeightChange={setTerminalHeight}
              onHide={() => setTerminalVisible(false)}
            />
          </Suspense>
        )}
        statusBarNode={(
          <StatusBar
            filePath={file.path}
            dirty={file.dirty}
            saveState={saveVisualState}
            message={autoSaveError || diskChangeMessage || transientMessage}
            stats={documentStats}
          />
        )}
      />
      <Suspense fallback={null}>
        <DiffReviewPane controller={diffReviewController} />
      </Suspense>
      <AppLayoutOverlays
        findVisible={findVisible}
        findFocusTarget={findFocusTarget}
        source={file.content}
        readOnly={isDocx}
        onCloseFind={() => setFindVisible(false)}
        onReplaceSource={replaceCurrentContent}
        onNavigate={handleSearchNavigate}
        quickOpenVisible={quickOpenVisible}
        recentFiles={recentFiles}
        onCloseQuickOpen={() => setQuickOpenVisible(false)}
        onQuickOpen={handleQuickOpenPath}
        artifactPreviewNode={artifactItems.length > 0 ? (
          <Suspense fallback={null}>
            <ArtifactPreview
              artifacts={artifactItems}
              onOpenFile={(path) => {
                void handleOpenPath(path).catch((error) => console.warn('Failed to open artifact:', error));
              }}
              onMergeIntoDocument={(path) => { void handleReviewRevision(path); }}
              onArchiveFile={(path) => {
                void handleArchiveArtifact(path);
              }}
              onDeleteFile={(path) => {
                void handleDeleteArtifact(path);
              }}
              onClose={handleClearArtifacts}
            />
          </Suspense>
        ) : null}
        settingsNode={settingsVisible ? (
          <Suspense fallback={<SettingsPageFallback />}>
            <SettingsPage
              onClose={() => {
                setSettingsVisible(false);
                setSettingsInitialSection(undefined);
              }}
              onUpdateAvailable={(update) => startBackgroundUpdateDownload('manual', update)}
              initialSection={settingsInitialSection}
            />
          </Suspense>
        ) : null}
        unsavedDialog={unsavedDialog}
        onUnsavedChoice={handleUnsavedChoice}
        renameDialog={renameDialog}
        setRenameDialog={setRenameDialog}
        onConfirmRename={() => void handleConfirmRename()}
        diffPreview={diffPreview}
        setDiffPreview={setDiffPreview}
      />
      {exportToast && (
        <div className={`export-toast export-toast-${exportToast.type}`} role="status" aria-live="polite">
          <div className="export-toast-body">
            {exportToast.type === 'running' && <span className="export-toast-spinner" />}
            <div className="export-toast-text">
              <strong>{exportToast.title}</strong>
              {exportToast.detail && <span>{exportToast.detail}</span>}
            </div>
          </div>
          <button
            type="button"
            className="export-toast-close"
            onClick={() => {
              if (exportToastTimerRef.current !== null) {
                window.clearTimeout(exportToastTimerRef.current);
                exportToastTimerRef.current = null;
              }
              setExportToast(null);
            }}
            aria-label="关闭导出通知"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {/* 选区原地结果对比卡(C 混合 · 4 个固定动作走 oneshot 后弹此卡) */}
      <SelectionResultCard
        open={!!resultCard}
        x={resultCard?.x ?? 0}
        y={resultCard?.y ?? 0}
        state={resultCard?.state ?? 'loading'}
        actionLabel={resultCard?.actionLabel ?? ''}
        originalText={resultCard?.originalText ?? ''}
        newText={resultCard?.newText ?? null}
        error={resultCard?.error ?? null}
        displayOnly={resultCard?.displayOnly}
        initialRequirements={resultCard?.requirements ?? ''}
        onAccept={acceptResultCard}
        onCancel={closeResultCard}
        onRetry={retryResultCard}
        onCopy={copyResultCard}
        onSubmitInput={submitResultCardInput}
      />
      {/* 检视意见输入浮卡(任务 #12 浮条入口) */}
      <ReviewCommentEditor
        open={!!reviewEditor}
        x={reviewEditor?.x ?? 0}
        y={reviewEditor?.y ?? 0}
        originalText={reviewEditor?.anchor.originalText ?? ''}
        initialText={reviewEditor?.initialText ?? ''}
        onSave={(text) => {
          if (!reviewEditor) return;
          if (reviewEditor.editingId) {
            reviewStateApi.updateComment(reviewEditor.editingId, text);
          } else {
            reviewStateApi.addComment(reviewEditor.anchor, text);
            // 新增检视意见后自动切到右栏 review 面板
            setRightPanelMode('review');
          }
          setReviewEditor(null);
        }}
        onCancel={() => setReviewEditor(null)}
      />
    </>
  );
}

function sameFoldSet(a: ReadonlySet<FoldKey>, b: ReadonlySet<FoldKey>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const key of a) if (!b.has(key)) return false;
  return true;
}
