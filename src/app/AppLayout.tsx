import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { X } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  getExportPresetConfig,
  clearLastOpenedPath,
  getLastOpenedPath,
  getLastWorkspaceRoot,
  resolvePreviewFontFamily,
  resolvePreviewHeadingFontFamily,
  setLastWorkspaceRoot,
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
import {
  ReviewSidebarPanel,
  type AIReviewSettings,
  type AIRewriteRequest,
  type ReviewSkillOption,
} from '../components/review/ReviewSidebarPanel';
import {
  CandidateNavigationDialog,
  type CandidateNavigationChoice,
} from '../components/diff/CandidateNavigationDialog';
import { runSkillOneshot } from '../services/agent/oneshotService';
import { useReviewState } from '../hooks/useReviewState';
import { useRevisionList } from '../hooks/useRevisionList';
import {
  buildReviewMarkdown,
  getActiveReviewComments,
  parseReviewMarkdown,
  type ReviewBasis,
  type ReviewComment,
} from '../services/review/reviewState';
import { ensureArtifactManifest } from '../services/artifacts/manifest';
import type { ArtifactRecord } from '../services/artifacts/types';
import { saveFileDialog } from '../services/dialogService';
import { mkdir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import type { SelectionAnchor } from '../services/agent/types';
import { resolveWorkbenchWorkspaceRoot } from '../services/agent/workbenchWorkspace';
import { useConversationManager } from '../hooks/useAgentSession';
import { useArtifactLibrary } from '../hooks/useArtifactLibrary';
import { useArtifactState } from '../hooks/useArtifactState';
import { useEditorSelectionBridge } from '../hooks/useEditorSelectionBridge';
import { useFileTabs, type DocumentChangeIntent } from '../hooks/useFileTabs';
import { useDiffReview, type CandidateSelfCheckStatus } from '../hooks/useDiffReview';
import type { DiffFeedbackRequest } from '../components/diff/DiffReviewPane';
import { useDocumentHistoryList } from '../hooks/useDocumentHistoryList';
import { createDocumentHistoryVersion } from '../services/review/documentHistoryService';
import { mergeDecisions } from '../services/diff/markdownDiff';
import { parseAIReviewFindings, resolveAIReviewAnchor, resolveStoredReviewAnchor } from '../services/review/aiReviewResult';
import { isHighImpactRewrite, resolveAIRewriteScope } from '../services/review/aiRewriteScope';
import { confirmDialog, messageDialog } from '../services/dialogService';
import { useDocumentMode } from '../hooks/useDocumentMode';
import { useLeftRail } from '../hooks/useLeftRail';
import { useRightPanel, type RightPanelMode } from '../hooks/useRightPanel';
import { useSkillHubState } from '../hooks/useSkillHubState';
import {
  buildSkillPrefill,
  SYSTEM_SKILL_SCENES,
  type SkillPickPayload,
} from '../services/agent/skillHub';
import { useTocState } from '../hooks/useTocState';
import { useWorkspaceWatch } from '../hooks/useWorkspaceWatch';
import type { ImageInsertRequest, SourceHeadingScrollRequest } from '../components/EditorPane';
import type { TypolaEditorKernel } from '../types/editorCore';
import type { FormatAction } from '../components/EditorContextMenu';
import type { PreviewScrollHandle } from '../types/previewScroll';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { analyzeMarkdown, type MarkdownLink } from '../services/markdownAnalysisService';
import { getRecentFiles, type RecentFile } from '../services/recentFilesService';
import type { SearchMatch, SearchOptions } from '../services/documentSearchService';
import { createImageMarkdown } from '../services/editAssistService';
import { applyAppearanceToDocument } from '../services/appearanceDom';
import {
  formatImageSrc,
  isImagePath,
  parseUploadUrls,
  pathBasenameWithoutExtension,
  resolveCopyDestination,
  resolveImageInsertAction,
} from '../services/imageInsert';
import { foldKey, type FoldKey } from '../services/headingFoldService';
import {
  extractToc,
  escapeRegExp,
  FLOW_LEFT_PANEL_WIDTH,
  FLOW_RIGHT_PANEL_WIDTH,
  imageExtensionFromMime,
  isEditableShortcutTarget,
  joinLocalPath,
  pathBasename,
  LEFT_PANEL_MAX_WIDTH,
  LEFT_PANEL_MIN_WIDTH,
  RIGHT_PANEL_MAX_WIDTH,
  RIGHT_PANEL_MIN_WIDTH,
  RIGHT_PANEL_RESIZER_GAP,
  sameLocalPath,
  WORKSPACE_PANEL_DEFAULT_WIDTH,
  toUpdateErrorMessage,
} from './appLayoutUtils';
import {
  preloadSettingsPage,
  preloadSettingsPageInBackground,
  SettingsPage,
  SettingsPageFallback,
} from './settingsPageLoader';

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

type CandidateSelfCheck = {
  status: CandidateSelfCheckStatus;
  summary: string;
};

type PendingInitialCandidate = {
  name: string;
  candidatePath: string;
  conversationId: string;
  documentPath: string;
  started: boolean;
};

type PendingCandidateRun = {
  candidatePath: string;
  conversationId: string;
  started: boolean;
  resolve: () => void;
  reject: (error: Error) => void;
};

type PendingAIReviewRun = {
  resultPath: string;
  conversationId: string;
  documentPath: string;
  basis: ReviewBasis;
  started: boolean;
};

const AI_REVIEW_PENDING_RESULT = '{"status":"pending","comments":[]}';

function candidateSelfCheckPath(candidatePath: string): string {
  return `${candidatePath}.selfcheck.json`;
}

function parentDirectory(path: string): string {
  const normalized = path.replace(/\\/gu, '/');
  const index = normalized.lastIndexOf('/');
  return index >= 0 ? path.slice(0, index) : '';
}

function safeOutputSegment(value: string): string {
  return value.replace(/[^a-z0-9_-]+/giu, '-').replace(/^-+|-+$/gu, '') || 'conversation';
}

function documentContextBoundary(previousPath: string | undefined, currentPath: string): string {
  if (!previousPath || previousPath.replace(/\\/gu, '/').toLowerCase() === currentPath.replace(/\\/gu, '/').toLowerCase()) {
    return '';
  }
  return [
    '当前活动文档已经切换。旧文档的正文、候选稿、锚点和局部修改要求全部失效，只保留通用写作偏好与讨论结论。',
    `新的唯一源文档：${currentPath}`,
  ].join('\n');
}

async function readCandidateSelfCheck(candidatePath: string): Promise<CandidateSelfCheck> {
  try {
    const value: unknown = JSON.parse(await readTextFile(candidateSelfCheckPath(candidatePath)));
    if (!value || typeof value !== 'object') throw new Error('invalid self-check');
    const record = value as { status?: unknown; summary?: unknown };
    const status = record.status;
    if (status !== 'fresh' && status !== 'warning' && status !== 'blocked') throw new Error('invalid status');
    return {
      status,
      summary: typeof record.summary === 'string' && record.summary.trim()
        ? record.summary.trim()
        : '本轮自检已完成。',
    };
  } catch {
    return { status: 'warning', summary: '候选稿已生成，但未收到有效的自检结果，请重点核对修改范围。' };
  }
}

export function AppLayout() {
  const settings = useSettings();
  const isTauriRuntime = '__TAURI_INTERNALS__' in window;
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);
  const reopenAttempted = useRef(false);
  const autoUpdateCheckStarted = useRef(false);
  const updateDownloadVersionRef = useRef<string | null>(null);
  const mainContentRef = useRef<HTMLDivElement>(null);
  const editorCommandRef = useRef<TypolaEditorKernel | null>(null);
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
  const [workspaceRoot, setWorkspaceRootState] = useState(() => getLastWorkspaceRoot());
  const setWorkspaceRoot = useCallback((next: string) => {
    setWorkspaceRootState(next);
    setLastWorkspaceRoot(next);
  }, []);
  const [settingsVisible, setSettingsVisible] = useState(false);
  // P1-E:从外部(场景卡)跳转时指定的初始段
  const [settingsInitialSection, setSettingsInitialSection] = useState<'aiCli' | undefined>(undefined);
  const [findVisible, setFindVisible] = useState(false);
  const [findFocusTarget, setFindFocusTarget] = useState<'find' | 'replace'>('find');
  const [quickOpenVisible, setQuickOpenVisible] = useState(false);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>(() => getRecentFiles());
  const [editorMode, setEditorMode] = useState<EditorMode>('wysiwyg');
  const [sourceHeadingScrollRequest, setSourceHeadingScrollRequest] = useState<SourceHeadingScrollRequest>();
  // 折叠集合:由 AppLayout 拥有,用于"搜索命中自动展开"等命令式扩展。
  // Cm6MarkdownEditorPane 通过 foldedHeadings + onFoldChange 双向同步。
  const [foldedHeadings, setFoldedHeadings] = useState<ReadonlySet<FoldKey>>(() => new Set());
  const handleEditorFoldChange = useCallback((next: ReadonlySet<FoldKey>) => {
    setFoldedHeadings((prev) => sameFoldSet(prev, next) ? prev : new Set(next));
  }, []);
  const [htmlPresentationVisible, setHtmlPresentationVisible] = useState(false);
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
  const candidateNavigationGuardRef = useRef<(intent: DocumentChangeIntent) => Promise<boolean>>(async () => true);
  const candidateNavigationBypassRef = useRef(false);
  const candidateNavigationResolverRef = useRef<((choice: CandidateNavigationChoice) => void) | null>(null);
  const [candidateNavigationDialogOpen, setCandidateNavigationDialogOpen] = useState(false);
  const requestCandidateNavigationChoice = useCallback(() => new Promise<CandidateNavigationChoice>((resolve) => {
    candidateNavigationResolverRef.current = resolve;
    setCandidateNavigationDialogOpen(true);
  }), []);
  const handleCandidateNavigationChoice = useCallback((choice: CandidateNavigationChoice) => {
    setCandidateNavigationDialogOpen(false);
    const resolve = candidateNavigationResolverRef.current;
    candidateNavigationResolverRef.current = null;
    resolve?.(choice);
  }, []);
  const [tocOpenRequest, setTocOpenRequest] = useState(0);
  const {
    toc,
    setToc,
    activeTocIndex,
    tocPinned,
    handleTocNavigate,
    handleTocPinnedChange,
    handleTocAlwaysPinnedChange,
    handleEditorHeadingChange: handleTocEditorHeadingChange,
  } = useTocState({
    alwaysPinned: settings.tocAlwaysPinned,
    setSourceHeadingScrollRequest,
  });
  const handleEditorHeadingChange = useCallback((change: { index: number; withinRatio: number }) => {
    handleTocEditorHeadingChange(change.index);
    if (Date.now() < syncLockUntilRef.current || change.index < 0) return;
    syncLockUntilRef.current = Date.now() + SYNC_LOCK_MS;
    previewScrollRef.current?.scrollToHeading(change.index, change.withinRatio);
  }, [handleTocEditorHeadingChange]);
  // 模式 ref 解决「getDefaultRightPanelWidth 在 rightPanelMode 声明前定义」的问题。
  const rightPanelModeRef = useRef<RightPanelMode>('none');
  const getDefaultRightPanelWidth = useCallback(() => {
    // 模式分支:word/wechat 跟编辑器 1:1(可用空间均分);其他模式跟左栏一致 360。
    const containerWidth = mainContentRef.current?.getBoundingClientRect().width ?? window.innerWidth;
    const mode = rightPanelModeRef.current;
    if (mode === 'word' || mode === 'wechat') {
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
    handleOpenFolder,
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
    beforeDocumentChangeRef: candidateNavigationGuardRef,
  });
  useEffect(() => {
    setFoldedHeadings(new Set());
  }, [activeTabId]);
  const debouncedAnalysisSource = useDebouncedValue(file.fileType === 'docx' ? '' : file.content, 180);
  const markdownAnalysis = useMemo(
    () => analyzeMarkdown(debouncedAnalysisSource),
    [debouncedAnalysisSource],
  );
  const documentStats = file.fileType === 'docx' ? undefined : markdownAnalysis.stats;
  useEffect(() => {
    // Ignore the previous tab's delayed value until it catches up with current source.
    if (file.fileType === 'docx' || debouncedAnalysisSource !== file.content) return;
    setToc(markdownAnalysis.headings.map(({ level, text }, index) => ({ level, text, id: `toc-${index}` })));
  }, [debouncedAnalysisSource, file.content, file.fileType, markdownAnalysis, setToc]);
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
    handleTogglePrimaryPanel,
    handleToggleWorkspacePanel,
    handleToggleAiPanel,
    handleLeftPanelResizerPointerDown,
  } = useLeftRail({
    aiWorkbenchEnabled: file.fileType !== 'docx',
    defaultWidth: WORKSPACE_PANEL_DEFAULT_WIDTH,
    minWidth: LEFT_PANEL_MIN_WIDTH,
    maxWidth: LEFT_PANEL_MAX_WIDTH,
    initialMode: workspaceRoot ? 'workspace' : 'none',
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
  useEffect(() => {
    if (!file.path) return;
    const importedComments = parseReviewMarkdown(file.content, file.path);
    reviewStateApi.hydrateComments(importedComments);
  }, [file.content, file.path, reviewStateApi.hydrateComments]);

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
  const reviewSkillOptions = useMemo<ReviewSkillOption[]>(() => {
    const options = new Map<string, ReviewSkillOption>();
    for (const scene of SYSTEM_SKILL_SCENES) {
      for (const skill of scene.skills) {
        options.set(skill.name, { name: skill.name, label: skill.label || skill.name });
      }
    }
    for (const skills of Object.values(skillHub.sceneAdditions)) {
      for (const skill of skills) options.set(skill.name, { name: skill.name, label: skill.name });
    }
    return [...options.values()].sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
  }, [skillHub.sceneAdditions]);
  const [styleGuidePath, setStyleGuidePath] = useState<string>();
  useEffect(() => {
    if (!file.path || file.fileType !== 'markdown') {
      setStyleGuidePath(undefined);
      return undefined;
    }
    let cancelled = false;
    const candidates = [
      file.path ? joinLocalPath(parentDirectory(file.path), 'style.md') : '',
      effectiveAiWorkspaceRoot ? joinLocalPath(effectiveAiWorkspaceRoot, 'style.md') : '',
    ].filter((path, index, all) => path && all.indexOf(path) === index);
    void (async () => {
      for (const candidate of candidates) {
        try {
          await readTextFile(candidate);
          if (!cancelled) setStyleGuidePath(candidate);
          return;
        } catch {
          // 继续检查下一个约定位置。
        }
      }
      if (!cancelled) setStyleGuidePath(undefined);
    })();
    return () => { cancelled = true; };
  }, [effectiveAiWorkspaceRoot, file.fileType, file.path]);
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
  const [pendingInitialCandidate, setPendingInitialCandidate] = useState<PendingInitialCandidate | null>(null);
  const pendingCandidateRunRef = useRef<PendingCandidateRun | null>(null);
  const [candidateRunVersion, setCandidateRunVersion] = useState(0);
  const pendingAIReviewRunRef = useRef<PendingAIReviewRun | null>(null);
  const [aiReviewRunning, setAIReviewRunning] = useState(false);
  const [aiReviewRunVersion, setAIReviewRunVersion] = useState(0);
  const { histories: documentHistories, refresh: refreshDocumentHistories } = useDocumentHistoryList({
    outputBaseDir,
    conversationId: convManager.activeConvId,
    documentPath: file.path,
    refreshKey: `${agentChangedPaths.size}:${candidateRunVersion}`,
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
    applyAppearanceToDocument(document, settings);
  }, [settings]);

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
    const activeComments = getActiveReviewComments(state.comments);
    if (activeComments.length === 0) return;
    const reviewMd = buildReviewMarkdown(file.content, activeComments);
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
      if (sameLocalPath(target, file.path)) {
        await messageDialog('检视版不能覆盖当前源文档。请换一个文件名。', { title: '导出检视版' });
        return;
      }
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

  const handleStartAIReview = useCallback(async (options: AIReviewSettings) => {
    if (!file.path || !outputBaseDir) {
      await messageDialog('请先打开并保存文档，再开始 AI 检视。', { title: 'AI 检视' });
      return;
    }
    const conversationId = convManager.activeConvId;
    const conversation = convManager.conversations.get(conversationId);
    if (!conversation || conversation.runState === 'running' || conversation.runState === 'waitingForUser') {
      await messageDialog('当前 AI Session 正在处理其他任务。', { title: 'AI 检视' });
      return;
    }
    if (file.dirty) {
      try {
        await handleSave();
      } catch (error) {
        await messageDialog(`保存当前文档失败：${String(error)}`, { title: 'AI 检视' });
        return;
      }
    }
    const stem = pathBasenameWithoutExtension(file.path) || 'document';
    const resultName = `${stem}.ai检视.json`;
    const resultPath = joinLocalPath(outputBaseDir, safeOutputSegment(conversationId), resultName);
    const contextBoundary = documentContextBoundary(conversation.currentFileContextPath, file.path);
    const useStyleGuide = options.useStyleGuide && Boolean(styleGuidePath);
    const basisLabels = [
      useStyleGuide ? 'style.md' : '',
      options.skillName ? `Skill: ${options.skillName}` : '',
      options.requirement ? `本次要求: ${options.requirement}` : '',
    ].filter(Boolean);
    const basis: ReviewBasis = {
      kind: options.requirement ? 'request' : options.skillName ? 'skill' : useStyleGuide ? 'style' : 'request',
      label: basisLabels.join(' · ') || '通用检视',
    };
    const existingComments = reviewStateApi.state.comments.map((comment) => ({
      originalText: truncate(comment.anchor.originalText, 200),
      text: truncate(comment.text, 200),
      source: comment.source,
    }));
    const prompt = [
      contextBoundary,
      '请对当前文档执行一轮检视，只提出可定位、可执行的意见，不修改任何文档。',
      `当前文档：${file.path}`,
      useStyleGuide ? `检视时必须遵循：${styleGuidePath}` : '',
      options.skillName ? `调用当前 Session 可用的 Skill「$${options.skillName}」执行检视；若 Provider 不支持 Skill 调用，则按该 Skill 的已知规则检视。` : '',
      options.requirement ? `本次额外要求：${options.requirement}` : '本次没有额外要求，重点检查表达、结构和重复论证。',
      `已有人工与 AI 意见如下，仅用于去重；不得改写、分类或覆盖：\n${JSON.stringify(existingComments)}`,
      '每条意见必须引用文档中连续且可唯一定位的原文片段。重复原文时提供紧邻前缀 prefixHint 消歧。',
      `将结果写入 ${resultName}，不要创建其他文件。JSON 格式固定为：`,
      '{"comments":[{"originalText":"原文片段","prefixHint":"可选前缀","text":"检视意见"}]}',
      '没有有效问题时写入 {"comments":[]}。执行一轮后停止，不要提问。',
    ].filter(Boolean).join('\n\n');
    pendingAIReviewRunRef.current = {
      resultPath,
      conversationId,
      documentPath: file.path,
      basis,
      started: false,
    };
    setAIReviewRunning(true);
    setAIReviewRunVersion((value) => value + 1);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('allow_fs_directory', { dir: outputBaseDir });
      await mkdir(parentDirectory(resultPath), { recursive: true });
      await writeTextFile(resultPath, AI_REVIEW_PENDING_RESULT);
      await convManager.send(prompt, {
        conversationId,
        currentFileContextPath: file.path,
        referencePaths: [file.path, useStyleGuide ? styleGuidePath : undefined].filter((path): path is string => Boolean(path)),
      });
      if (pendingAIReviewRunRef.current?.conversationId === conversationId) {
        pendingAIReviewRunRef.current.started = true;
        setAIReviewRunVersion((value) => value + 1);
      }
    } catch (error) {
      pendingAIReviewRunRef.current = null;
      setAIReviewRunning(false);
      await messageDialog(String(error), { title: 'AI 检视失败' });
    }
  }, [convManager, file.dirty, file.path, handleSave, outputBaseDir, reviewStateApi.state.comments, styleGuidePath, truncate]);

  useEffect(() => {
    const pending = pendingAIReviewRunRef.current;
    if (!pending?.started) return;
    const conversation = convManager.conversations.get(pending.conversationId);
    if (!conversation || conversation.runState === 'running') return;
    if (conversation.runState === 'waitingForUser') {
      setLeftRailMode('aiWorkbench');
      setTransientMessage('AI 检视需要补充信息，请在当前 Session 中回答。');
      return;
    }
    pendingAIReviewRunRef.current = null;
    setAIReviewRunning(false);
    if (conversation.runState === 'error') {
      void messageDialog(conversation.lastError || 'AI 检视失败。', { title: 'AI 检视失败' });
      return;
    }
    if (file.path !== pending.documentPath) {
      setTransientMessage('AI 检视已完成，但当前文档已切换；结果未加入当前列表。');
      return;
    }
    void readTextFile(pending.resultPath).then((raw) => {
      if (raw.trim() === AI_REVIEW_PENDING_RESULT) {
        throw new Error('AI 未写入检视结果文件。');
      }
      const findings = parseAIReviewFindings(raw);
      const existing = new Set(reviewStateApi.state.comments.map((comment) => (
        `${comment.anchor.originalText}\n${comment.text}`
      )));
      let added = 0;
      let unmatched = 0;
      for (const finding of findings) {
        const anchor = resolveAIReviewAnchor(file.content, file.path, finding);
        if (!anchor) {
          unmatched += 1;
          continue;
        }
        const key = `${anchor.originalText}\n${finding.text}`;
        if (existing.has(key)) continue;
        existing.add(key);
        reviewStateApi.addAIComment(anchor, finding.text, pending.basis);
        added += 1;
      }
      setTransientMessage(unmatched > 0
        ? `AI 检视新增 ${added} 条意见，${unmatched} 条因无法可靠定位已跳过。`
        : `AI 检视完成，新增 ${added} 条意见。`);
    }).catch((error) => {
      void messageDialog(`读取 AI 检视结果失败：${String(error)}`, { title: 'AI 检视失败' });
    });
  }, [aiReviewRunVersion, convManager.conversations, file.content, file.path, reviewStateApi, setLeftRailMode]);

  const startInitialCandidate = useCallback(async (
    targetFileName: string,
    prompt: string,
    referencePaths: string[],
  ) => {
    if (!file.path || !outputBaseDir) throw new Error('请先打开并保存文档。');
    const conversationId = convManager.activeConvId || convManager.createConversation('文档改稿');
    const conversation = convManager.conversations.get(conversationId);
    if (conversation?.runState === 'running' || conversation?.runState === 'waitingForUser') {
      throw new Error('当前 AI Session 正在处理其他任务。');
    }
    const boundedPrompt = [
      documentContextBoundary(conversation?.currentFileContextPath, file.path),
      prompt,
    ].filter(Boolean).join('\n\n');
    setPendingInitialCandidate({
      name: targetFileName,
      candidatePath: joinLocalPath(outputBaseDir, safeOutputSegment(conversationId), targetFileName),
      conversationId,
      documentPath: file.path,
      started: false,
    });
    try {
      await convManager.send(boundedPrompt, {
        conversationId,
        currentFileContextPath: file.path,
        referencePaths,
      });
      setPendingInitialCandidate((current) => (
        current?.conversationId === conversationId && current.name === targetFileName
          ? { ...current, started: true }
          : current
      ));
      setTransientMessage(`AI 正在生成「${targetFileName}」，完成后自动进入对比。`);
    } catch (error) {
      setPendingInitialCandidate(null);
      throw error;
    }
  }, [convManager, file.path, outputBaseDir]);

  const handleStartAIRewrite = useCallback(async (request: AIRewriteRequest) => {
    if (!file.path) {
      await messageDialog('请先打开并保存文档，再发起改稿。', { title: 'AI 改稿' });
      return;
    }
    if (!request.requirement.trim()) return;
    if (file.dirty) {
      try {
        await handleSave();
      } catch (error) {
        await messageDialog(`保存当前文档失败：${String(error)}`, { title: 'AI 改稿' });
        return;
      }
    }

    const rawSelection = editorCommandRef.current?.getSelection() ?? null;
    const selection = editorMode === 'wysiwyg' && rawSelection
      ? { ...rawSelection, from: -1, to: -1 }
      : rawSelection;
    let scope;
    try {
      scope = resolveAIRewriteScope(
        file.content,
        request.scope,
        selection,
        analyzeMarkdown(file.content).foldSections,
        activeTocIndex,
      );
    } catch (error) {
      await messageDialog(String(error instanceof Error ? error.message : error), { title: '选择改稿范围' });
      return;
    }

    if (isHighImpactRewrite(request.requirement)) {
      const confirmed = await confirmDialog(
        `这次要求可能改变文章结构或核心内容。\n\n影响范围：${scope.label}（L${scope.lineFrom}–L${scope.lineTo}）\n\nAI 只会生成候选稿，不会覆盖当前文档。是否继续？`,
        { title: '确认高影响改稿', okLabel: '生成候选稿', cancelLabel: '取消' },
      );
      if (!confirmed) return;
    }

    const stem = pathBasenameWithoutExtension(file.path) || 'document';
    refreshRevisions();
    const versions = aiRevisions
      .filter((revision) => revision.name.startsWith(`${stem}.ai改`))
      .map((revision) => revision.version ?? 0);
    const targetFileName = `${stem}.ai改${(versions.length ? Math.max(...versions) : 0) + 1}.md`;
    const selfCheckFileName = `${targetFileName}.selfcheck.json`;
    const scopeExcerpt = request.scope === 'document'
      ? ''
      : `范围原文（仅用于定位，完整内容以源文档为准）：\n${truncate(scope.anchorText, 1200)}`;
    const prompt = [
      '请基于当前源文档生成一份完整候选稿。源文档只读，不得直接修改。',
      `源文档：${file.path}`,
      `本轮要求：${request.requirement}`,
      `允许修改范围：${scope.label}，源行 L${scope.lineFrom}–L${scope.lineTo}。范围外内容保持不变。`,
      scopeExcerpt,
      `把完整候选稿写入 ${targetFileName}，不要创建其他改稿文件。`,
      `完成后把自检写入 ${selfCheckFileName}，JSON 格式：`,
      '{"status":"fresh|warning|blocked","summary":"一句话说明要求是否完成、是否越界及是否存在高影响变化"}',
      '若修改超出指定范围或无法安全完成，状态必须为 blocked。执行一轮修改和自检后停止，不要提问。',
    ].filter(Boolean).join('\n\n');

    try {
      await startInitialCandidate(targetFileName, prompt, [file.path]);
    } catch (error) {
      await messageDialog(String(error), { title: '发起 AI 改稿失败' });
    }
  }, [activeTocIndex, aiRevisions, editorMode, file.content, file.dirty, file.path, handleSave, refreshRevisions, startInitialCandidate, truncate]);

  // 任务 #15 发 AI 改:把全文 + 所有意见拼成 prompt,沿用当前 Session,走产物回流。
  // 文件命名约定:{stem}.ai改{N}.md(N 递增),所以每次发送前先扫一遍现有 N,取 max+1。
  const handleSendReviewToAI = useCallback(async () => {
    if (!file.path) {
      await messageDialog('请先打开文档再发起 AI 修改。', { title: '发 AI 改' });
      return;
    }
    if (file.dirty) {
      try {
        await handleSave();
      } catch (error) {
        await messageDialog(`保存当前文档失败：${String(error)}`, { title: '发 AI 改' });
        return;
      }
    }
    const { state, markClean } = reviewStateApi;
    const activeComments = getActiveReviewComments(state.comments);
    if (activeComments.length === 0) return;
    const fileName = file.path.replace(/\\/g, '/').split('/').pop() ?? 'document.md';
    const stem = fileName.replace(/\.[^.]+$/u, '');
    // 现有 N 取 max + 1;列表为空/扫不到 → 1。同步刷一次确保最新。
    refreshRevisions();
    const existingVersions = aiRevisions
      .filter((r: { name: string }) => r.name.startsWith(`${stem}.ai改`))
      .map((r: { version?: number }) => r.version ?? 0);
    const nextVersion = (existingVersions.length ? Math.max(...existingVersions) : 0) + 1;
    const targetFileName = `${stem}.ai改${nextVersion}.md`;
    const selfCheckFileName = `${targetFileName}.selfcheck.json`;
    // 拼 prompt:只传当前文件路径 + 每条意见的锚点,不把全文塞进 prompt。
    // 找不到/多处重复 → 跳过;不要扩大修改范围。
    const commentsBlock = activeComments.map((c, idx) => {
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
      `- 完成修改后执行一次自检，并把结果写入 ${selfCheckFileName}，JSON 格式固定为:`,
      '  {"status":"fresh|warning|blocked","summary":"一句话说明是否完成要求、是否越界及是否存在高影响变化"}',
      '- fresh 表示要求完成且未越界；warning 表示可审阅但存在范围或结构风险；blocked 表示不应直接应用',
      '- 不要提问；信息不足时跳过无法安全处理的意见，并在自检 summary 中说明',
      '',
      '## 检视意见清单(每条带唯一锚点 prefixHint + originalText)',
      '',
      commentsBlock,
    ].join('\n');
    try {
      await startInitialCandidate(targetFileName, prompt, [file.path]);
      markClean();
    } catch (error) {
      await messageDialog(String(error), { title: '发起 AI 修改失败' });
    }
  }, [aiRevisions, file.dirty, file.path, handleSave, refreshRevisions, reviewStateApi, startInitialCandidate, truncate]);

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

  const handleEditorFormat = useCallback((action: FormatAction) => {
    editorCommandRef.current?.format(action);
  }, []);

  const replaceFromFindPanel = useCallback((matches: readonly SearchMatch[], replacement: string) => {
    const editor = editorCommandRef.current;
    if (!editor) return;
    const source = editor.getMarkdown();
    // 文档在面板渲染后被 AI/文件监视器改写时，拒绝旧坐标，绝不替换错位文本。
    const current = matches.filter((match) => source.slice(match.index, match.index + match.length) === match.text);
    if (current.length !== matches.length) return;
    editor.replaceRanges(current.map((match) => ({
      from: match.index,
      to: match.index + match.length,
      insert: replacement,
    })));
  }, []);

  const candidatePersistenceKey = file.path
    ? `${convManager.activeConvId}::${file.path.replace(/\\/gu, '/').toLowerCase()}`
    : undefined;
  // 应用候选稿前先保存基线快照，再以一次原子编辑写入当前文档。
  const diffReviewController = useDiffReview(useCallback(async (merged: string, originalContent: string) => {
    if (!file.path || !outputBaseDir) {
      throw new Error('当前文档缺少可用路径，无法安全保存应用前历史版本。');
    }
    await createDocumentHistoryVersion({
      outputBaseDir,
      conversationId: convManager.activeConvId,
      documentPath: file.path,
      content: originalContent,
    });
    const handle = editorCommandRef.current;
    if (handle?.commitAIReplacement) {
      handle.commitAIReplacement(merged);
    } else {
      replaceCurrentContent(merged);
    }
    refreshDocumentHistories();
    setTransientMessage('AI 改动已应用，并已保存应用前历史版本。');
  }, [convManager.activeConvId, file.path, outputBaseDir, refreshDocumentHistories, replaceCurrentContent]), candidatePersistenceKey);
  const diffReviewState = diffReviewController.state;
  const markCandidateBaselineStale = diffReviewController.markBaselineStale;

  useEffect(() => {
    const state = diffReviewState;
    if (!state.isOpen || !state.documentPath) return;
    const sameDocument = state.documentPath.replace(/\\/gu, '/').toLowerCase()
      === file.path.replace(/\\/gu, '/').toLowerCase();
    if (sameDocument && state.originalContent !== file.content) {
      markCandidateBaselineStale(file.content);
    }
  }, [diffReviewState, file.content, file.path, markCandidateBaselineStale]);

  useEffect(() => {
    if (!externalChangeConflict || !diffReviewState.isOpen) return;
    const sameDocument = diffReviewState.documentPath?.replace(/\\/gu, '/').toLowerCase()
      === externalChangeConflict.path.replace(/\\/gu, '/').toLowerCase();
    if (!sameDocument) return;
    let cancelled = false;
    void import('../services/fileService')
      .then(({ readTextWithEncoding }) => readTextWithEncoding(externalChangeConflict.path, settings.defaultEncoding))
      .then((latestContent) => {
        if (!cancelled) markCandidateBaselineStale(latestContent);
      })
      .catch((error) => console.warn('Failed to load externally changed source for candidate review:', error));
    return () => { cancelled = true; };
  }, [diffReviewState.documentPath, diffReviewState.isOpen, externalChangeConflict, markCandidateBaselineStale, settings.defaultEncoding]);

  // 检视面板的「以 Diff 审阅」入口:读改稿文件 → diff(当前文档,改稿)→ 开审阅态。
  // SPEC §2.1 A 类:检视产物已声明"是当前文档修订版",直接进。
  const handleReviewRevision = useCallback(async (
    revisionPath: string,
    options?: { history?: boolean },
  ) => {
    if (!file.path) {
      await messageDialog('请先打开原文档再审阅 AI 改稿。', { title: '以 Diff 审阅' });
      return;
    }
    try {
      const proposedContent = await readTextFile(revisionPath);
      const revisionName = revisionPath.replace(/\\/g, '/').split('/').pop() ?? '改稿';
      const selfCheck = options?.history
        ? { status: 'fresh' as const, summary: '这是应用前历史版本；确认 Diff 后才会恢复到当前文档。' }
        : await readCandidateSelfCheck(revisionPath);
      diffReviewController.open({
        source: 'review',
        title: options?.history ? `审阅历史版本：${revisionName}` : `审阅 AI 改稿：${revisionName}`,
        documentPath: file.path,
        candidatePath: options?.history ? undefined : revisionPath,
        originalContent: file.content,
        proposedContent,
        selfCheckStatus: selfCheck.status,
        selfCheckSummary: selfCheck.summary,
      });
      setLeftRailMode('none');
      setRightPanelMode('none');
    } catch (error) {
      await messageDialog(`读取改稿失败:${String(error)}`, { title: '以 Diff 审阅' });
    }
  }, [diffReviewController, file.content, file.path, setLeftRailMode, setRightPanelMode]);

  const runCandidateAgent = useCallback(async (candidatePath: string, prompt: string): Promise<void> => {
    const conversationId = convManager.activeConvId;
    const conversation = convManager.conversations.get(conversationId);
    if (!conversation || conversation.runState === 'running' || conversation.runState === 'waitingForUser') {
      throw new Error('当前 AI Session 正在处理其他任务，请等待本轮结束。');
    }
    if (pendingCandidateRunRef.current) throw new Error('候选稿已有一轮修改正在进行。');

    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const completion = new Promise<void>((done, failed) => {
      resolve = done;
      reject = failed;
    });
    pendingCandidateRunRef.current = {
      candidatePath,
      conversationId,
      started: false,
      resolve,
      reject,
    };
    setCandidateRunVersion((value) => value + 1);
    try {
      await convManager.send([
        documentContextBoundary(conversation.currentFileContextPath, file.path),
        prompt,
      ].filter(Boolean).join('\n\n'), {
        conversationId,
        currentFileContextPath: file.path,
        referencePaths: [file.path, candidatePath].filter(Boolean),
      });
      if (pendingCandidateRunRef.current?.conversationId === conversationId) {
        pendingCandidateRunRef.current.started = true;
        setCandidateRunVersion((value) => value + 1);
      }
    } catch (error) {
      pendingCandidateRunRef.current = null;
      const failure = error instanceof Error ? error : new Error(String(error));
      reject(failure);
      throw failure;
    }
    return completion;
  }, [convManager, file.path]);

  const handleCandidateFeedback = useCallback(async (request: DiffFeedbackRequest) => {
    const state = diffReviewController.state;
    if (!state.candidatePath) {
      await messageDialog('当前候选稿不是可继续写入的 AI 改稿文件。', { title: '继续修改' });
      return;
    }
    const focused = state.hunks[state.focusIndex];
    const focusedText = focused
      ? ('after' in focused ? focused.after : 'content' in focused ? focused.content : '')
      : '';
    const scopeInstruction = request.scope === 'current-diff'
      ? `只修改包含以下当前差异的最小段落：\n${focusedText}`
      : request.scope === 'current-section'
        ? `只修改包含以下当前差异的 Markdown 章节，不要改动其他章节：\n${focusedText}`
        : '可以修改整份候选稿，但只能响应本轮明确要求。';
    const candidateName = pathBasename(state.candidatePath);
    const selfCheckName = pathBasename(candidateSelfCheckPath(state.candidatePath));
    await writeTextFile(state.candidatePath, request.candidateContent);
    await writeTextFile(candidateSelfCheckPath(state.candidatePath), JSON.stringify({
      status: 'warning',
      summary: '本轮修改尚未完成自检。',
    }));
    const prompt = [
      '继续修改当前候选稿。沿用本 Session 已有讨论，不重新创建文档或对话。',
      `源文档只读：${file.path}`,
      `候选稿文件：${candidateName}`,
      `本轮要求：${request.text}`,
      `本轮范围：${scopeInstruction}`,
      `直接覆盖写回 ${candidateName}，不要创建新候选稿，不要修改源文档。`,
      `完成后把自检写入 ${selfCheckName}，JSON 格式：`,
      '{"status":"fresh|warning|blocked","summary":"一句话说明完成情况、越界风险和高影响变化"}',
      '执行一轮修改和自检后停止，不要提问。',
    ].join('\n\n');
    try {
      await runCandidateAgent(state.candidatePath, prompt);
    } catch (error) {
      await messageDialog(String(error), { title: '继续修改失败' });
    }
  }, [diffReviewController.state, file.path, runCandidateAgent]);

  const handleCandidateRecheck = useCallback(async () => {
    const state = diffReviewController.state;
    if (!state.candidatePath) {
      await messageDialog('当前候选稿没有可更新的 AI 改稿文件。', { title: '重新检视' });
      return;
    }
    const candidateContent = state.hunks.length > 0
      ? mergeDecisions(state.hunks, state.decisions)
      : state.proposedContent;
    const candidateName = pathBasename(state.candidatePath);
    const selfCheckName = pathBasename(candidateSelfCheckPath(state.candidatePath));
    await writeTextFile(state.candidatePath, candidateContent);
    await writeTextFile(candidateSelfCheckPath(state.candidatePath), JSON.stringify({
      status: 'warning',
      summary: '重新检视尚未完成。',
    }));
    const prompt = [
      `只重新检视 ${candidateName}，不要修改候选稿或源文档。`,
      '检查本 Session 最近一轮要求是否完成、是否超出范围、是否有大范围结构变化或高影响修改。',
      `把结果写入 ${selfCheckName}，JSON 格式：`,
      '{"status":"fresh|warning|blocked","summary":"一句话自检结论"}',
      '完成后停止，不要提问。',
    ].join('\n\n');
    try {
      await runCandidateAgent(state.candidatePath, prompt);
    } catch (error) {
      await messageDialog(String(error), { title: '重新检视失败' });
    }
  }, [diffReviewController.state, runCandidateAgent]);

  const handleSaveCandidateAs = useCallback(async (candidateContent: string) => {
    if (!file.path) return;
    const separator = file.path.includes('\\') ? '\\' : '/';
    const normalized = file.path.replace(/\\/gu, '/');
    const directoryEnd = normalized.lastIndexOf('/');
    const directory = directoryEnd >= 0 ? file.path.slice(0, directoryEnd) : '';
    const defaultName = `${pathBasenameWithoutExtension(file.path)}-改稿.md`;
    const target = await saveFileDialog(directory ? `${directory}${separator}${defaultName}` : defaultName);
    if (!target) return;
    if (sameLocalPath(target, file.path)) {
      await messageDialog('另存为不能覆盖当前源文档。请换一个文件名。', { title: '另存候选稿' });
      return;
    }
    await writeTextFile(target, candidateContent);
    diffReviewController.close();
    candidateNavigationBypassRef.current = true;
    try {
      await handleOpenPath(target);
    } finally {
      candidateNavigationBypassRef.current = false;
    }
    setLeftRailMode('none');
    setRightPanelMode('review');
    setTransientMessage('候选稿已另存并成为当前文档，AI Session 保持不变。');
  }, [diffReviewController, file.path, handleOpenPath, setLeftRailMode, setRightPanelMode]);

  const handleResetCandidateToLatestSource = useCallback(async () => {
    if (externalChangeConflict) await handleAcceptExternal();
    diffReviewController.resetToLatestSource();
  }, [diffReviewController, externalChangeConflict, handleAcceptExternal]);

  const handleRebaseCandidateToLatestSource = useCallback(async () => {
    if (externalChangeConflict) await handleAcceptExternal();
    diffReviewController.rebaseCandidateToLatestSource();
  }, [diffReviewController, externalChangeConflict, handleAcceptExternal]);

  const candidateNavigationGuard = useCallback(async () => {
    if (candidateNavigationBypassRef.current) {
      candidateNavigationBypassRef.current = false;
      return true;
    }
    const state = diffReviewController.state;
    if (!state.isOpen) return true;
    const choice = await requestCandidateNavigationChoice();
    if (choice === 'cancel') return false;
    if (choice === 'discard') {
      diffReviewController.close();
      return true;
    }
    const candidate = mergeDecisions(state.hunks, state.decisions);
    if (choice === 'save-as') {
      await handleSaveCandidateAs(candidate);
      return false;
    }
    try {
      const applied = await diffReviewController.apply();
      if (!applied) {
        const reason = state.baselineStatus === 'stale'
          ? '源文档已在候选稿生成后发生变化，请重新对比或以最新文档重新开始。'
          : state.selfCheckSummary || '候选稿自检未通过，请处理阻断项后再应用。';
        await messageDialog(reason, { title: '暂不能应用候选稿' });
      }
      return applied;
    } catch (error) {
      await messageDialog(String(error), { title: '应用候选稿失败' });
      return false;
    }
  }, [diffReviewController, handleSaveCandidateAs, requestCandidateNavigationChoice]);
  useEffect(() => {
    candidateNavigationGuardRef.current = candidateNavigationGuard;
    return () => {
      candidateNavigationGuardRef.current = async () => true;
    };
  }, [candidateNavigationGuard]);

  useEffect(() => {
    const pending = pendingCandidateRunRef.current;
    if (!pending?.started) return;
    const conversation = convManager.conversations.get(pending.conversationId);
    if (!conversation || conversation.runState === 'running') return;
    if (conversation.runState === 'waitingForUser') {
      diffReviewController.setSelfCheckStatus('warning', 'AI 需要补充信息，本轮候选稿尚未完成。');
      setLeftRailMode('aiWorkbench');
      return;
    }
    pendingCandidateRunRef.current = null;
    if (conversation.runState === 'error') {
      diffReviewController.setSelfCheckStatus('warning', conversation.lastError || 'AI 本轮执行失败。');
      pending.resolve();
      return;
    }
    void Promise.all([
      readTextFile(pending.candidatePath),
      readCandidateSelfCheck(pending.candidatePath),
    ]).then(([content, selfCheck]) => {
      diffReviewController.updateCandidate(content, selfCheck.status, selfCheck.summary);
      refreshRevisions();
      setTransientMessage('候选稿已更新，可继续对比或反馈。');
      pending.resolve();
    }).catch((error) => {
      diffReviewController.setSelfCheckStatus('warning', `读取更新后的候选稿失败：${String(error)}`);
      pending.resolve();
    });
  }, [candidateRunVersion, convManager.conversations, diffReviewController, refreshRevisions, setLeftRailMode]);

  const openingInitialCandidateRef = useRef(false);
  useEffect(() => {
    const pending = pendingInitialCandidate;
    if (!pending?.started || openingInitialCandidateRef.current) return;
    const conversation = convManager.conversations.get(pending.conversationId);
    if (!conversation || conversation.runState === 'running') return;
    if (conversation.runState === 'waitingForUser') {
      setLeftRailMode('aiWorkbench');
      setTransientMessage('AI 需要补充信息，请在当前 Session 中回答。');
      return;
    }
    if (conversation.runState === 'error') {
      setPendingInitialCandidate(null);
      void messageDialog(conversation.lastError || 'AI 改稿失败。', { title: 'AI 改稿失败' });
      return;
    }
    if (file.path !== pending.documentPath) return;
    openingInitialCandidateRef.current = true;
    refreshRevisions();
    void handleReviewRevision(pending.candidatePath)
      .then(() => setPendingInitialCandidate(null))
      .finally(() => { openingInitialCandidateRef.current = false; });
  }, [convManager.conversations, file.path, handleReviewRevision, pendingInitialCandidate, refreshRevisions, setLeftRailMode]);

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
    // 用 MarkdownAnalysisService 找覆盖 match 位置的 heading section,
    // 仅当其 foldKey 出现在 foldedHeadings 时移除该 key。
    if (editorMode === 'source') {
      const sections = markdownAnalysis.foldSections;
      const coveringKeys: FoldKey[] = [];
      for (const section of sections) {
        if (section.from <= match.index && match.index < section.to) {
          // 展开命中行所在的完整父链,否则只展开最深层时父 heading 仍可能折住内容。
          const sectionIndex = Number(section.headingId.slice('heading-'.length));
          coveringKeys.push(foldKey(section.level, section.title, sectionIndex));
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
  }, [editorMode, file.content, foldedHeadings]);

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
  }, insertAt: number | null = null, request?: ImageInsertRequest) => {
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

    const insertImageMarkdown = (src: string) => {
      const replacement = request?.replace;
      const title = replacement?.title ? ` "${replacement.title}"` : '';
      const markdown = replacement
        ? `![${replacement.alt}](${src}${title})`
        : createImageMarkdown('图片', src);
      if (replacement) {
        editorCommandRef.current?.replaceRange(replacement.from, replacement.to, markdown);
      } else {
        insertMarkdownAt(markdown, insertAt);
      }
    };

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
        const src = settings.imageApplyToLocal
          ? formatImageSrc(source.localPath, currentFile.path, settings)
          : formatImageSrc(source.localPath, undefined, {
            imagePreferRelative: false,
            imageEnsureDotPrefix: false,
            imageEscapeUrl: false,
          });
        insertImageMarkdown(src);
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
          insertImageMarkdown(url);
          setTransientMessage('图片已上传。');
          return;
        } catch (error) {
          console.warn('Image upload failed, falling back to copy:', error);
          setTransientMessage('图片上传失败，已回退为本地复制。');
          const copied = source.localPath ? await copyImage() : uploadPath;
          insertImageMarkdown(formatImageSrc(copied, currentFile.path, settings));
          return;
        }
      }

      const copiedPath = await copyImage();
      insertImageMarkdown(formatImageSrc(copiedPath, currentFile.path, settings));
      setTransientMessage(`图片已保存到 ${copyDestination}。`);
    } catch (error) {
      console.warn('Failed to insert image:', error);
      setTransientMessage('图片插入失败。');
    }
  }, [insertMarkdownAt, settings]);

  // 工具栏/菜单「插入本地图片」入口:打开系统文件对话框 → 走 insertImageFromSource。
  const handleSelectLocalImage = useCallback(async (request?: ImageInsertRequest) => {
    if (fileRef.current.fileType === 'docx') return;
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'] }],
      });
      if (typeof selected !== 'string') return;
      await insertImageFromSource({ localPath: selected }, null, request);
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
    setEditorMode((mode) => {
      const next = mode === 'source' ? 'wysiwyg' : 'source';
      setHtmlPresentationVisible(file.fileType === 'html' && next !== 'source');
      return next;
    });
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
      if (e.key === 'o' && e.shiftKey && !e.altKey) { e.preventDefault(); void handleOpenFolder(); return; }
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
    handleOpenFolder,
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

  const handleOpenHtmlInBrowser = useCallback(async (path: string) => {
    if (!path) return;
    try {
      // 自定义命令 open_path_external — 绕开 tauri-plugin-opener 的
      // opener:scope 验证,后者用 canonicalize 后会把 Windows 路径变成
      // \\?\D:\... 形式,跟 capabilities 里 $HOME/$DESKTOP 等 glob 永远
      // 匹配不上,报「Not allowed to open path \\?\D」。
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('open_path_external', { path });
    } catch (error) {
      console.warn('Failed to open HTML in browser:', error);
      await messageDialog(String(error), { title: '浏览器打开失败' });
    }
  }, []);

  const handleOpenMarkdownLink = useCallback(async (link: MarkdownLink) => {
    const target = link.url.trim();
    if (!target) return;
    if (target.startsWith('#')) {
      const anchorText = target.slice(1);
      const headingIndex = markdownAnalysis.headings.findIndex((heading) => heading.text === anchorText);
      if (headingIndex < 0) {
        await messageDialog(`未找到文档锚点：${target}`, { title: '打开链接失败' });
        return;
      }
      setSourceHeadingScrollRequest({ index: headingIndex, requestId: Date.now() });
      return;
    }
    if (/^(?:https?:|mailto:)/iu.test(target)) {
      try {
        await openUrl(target);
      } catch (error) {
        await messageDialog(String(error), { title: '打开链接失败' });
      }
      return;
    }
    if (/^[a-z][a-z0-9+.-]*:/iu.test(target)) {
      await messageDialog(`不支持的链接协议：${target}`, { title: '打开链接失败' });
      return;
    }
    if (!file.path) {
      await messageDialog('当前文档尚未保存，无法解析相对路径。', { title: '打开链接失败' });
      return;
    }
    const path = target.split('#', 1)[0]!;
    const directory = file.path.replace(/[\\/][^\\/]*$/u, '');
    const resolvedPath = /^(?:[A-Za-z]:[\\/]|[\\/])/u.test(path) ? path : joinLocalPath(directory, path);
    if (!isOpenableDocumentPath(resolvedPath)) {
      await messageDialog(`链接不是可打开的文档：${target}`, { title: '打开链接失败' });
      return;
    }
    try {
      await handleOpenPath(resolvedPath);
    } catch (error) {
      await messageDialog(String(error), { title: '打开链接失败' });
    }
  }, [file.path, handleOpenPath, markdownAnalysis.headings]);

  const handleOpenArtifactExternally = useCallback(async (path: string) => {
    try {
      // 同上,绕开 opener scope。image / 任意本地文件都用 ShellExecuteW 派发。
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('open_path_external', { path });
    } catch (error) {
      console.warn('Failed to open artifact externally:', error);
      await messageDialog(String(error), { title: '打开失败' });
    }
  }, []);

  const handleRevealPathInFolder = useCallback(async (path: string) => {
    try {
      const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
      await revealItemInDir(path);
    } catch (error) {
      console.warn('Failed to reveal path in folder:', error);
      await messageDialog(String(error), { title: '打开所在文件夹失败' });
    }
  }, []);

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
  ) : shouldShowHtmlPresentation ? (
    <Suspense fallback={<div className="html-presentation-pane lazy-pane" aria-label={t('htmlPresentationAria')} />}>
      <HtmlPresentationPane
        source={file.content}
        filePath={file.path}
        onOpenInBrowser={() => { void handleOpenHtmlInBrowser(file.path); }}
      />
    </Suspense>
  ) : (
    <Suspense fallback={<div className="cm6-markdown-editor-pane lazy-pane"><span>CM6 编辑器加载中</span></div>}>
      <Cm6MarkdownEditorPane
        ref={editorCommandRef}
        mode={editorMode}
        source={file.content}
        onChange={handleContentChange}
        headingScrollRequest={sourceHeadingScrollRequest}
        filePath={file.path}
        onScrollRatio={handleEditorScrollRatio}
        onAIAction={handleEditorAIAction}
        onPreviewHeadingChange={handleEditorHeadingChange}
        foldedHeadings={foldedHeadings}
        onFoldChange={handleEditorFoldChange}
        reviewComments={reviewStateApi.state.comments}
        onOpenLink={handleOpenMarkdownLink}
        onRequestImageInsert={handleSelectLocalImage}
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
      currentSource={file.content}
      onJump={(comment: ReviewComment) => {
        const hit = resolveStoredReviewAnchor(file.content, file.path, comment.anchor);
        if (!hit) {
          setTransientMessage('原文位置已变化，未执行跳转。');
          return;
        }
        editorCommandRef.current?.revealRange(hit.from, hit.to, {
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
      onSetIgnored={(commentId, ignored) => reviewStateApi.setIgnored(commentId, ignored)}
      onExport={() => void handleExportReviewMarkdown()}
      onSendToAI={() => void handleSendReviewToAI()}
      revisions={aiRevisions}
      onOpenRevision={(path) => { void handleOpenPath(path).catch((e) => console.warn('Failed to open AI revision:', e)); }}
      onReviewRevision={(path) => { void handleReviewRevision(path); }}
      onRefreshRevisions={refreshRevisions}
      histories={documentHistories}
      onReviewHistory={(path) => { void handleReviewRevision(path, { history: true }); }}
      onRefreshHistories={refreshDocumentHistories}
      styleGuidePath={styleGuidePath}
      reviewSkills={reviewSkillOptions}
      aiReviewRunning={aiReviewRunning}
      onStartAIReview={(options) => { void handleStartAIReview(options); }}
      aiRewriteRunning={Boolean(pendingInitialCandidate)}
      onStartAIRewrite={(request) => { void handleStartAIRewrite(request); }}
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
      onOpenExternal={(path) => { void handleOpenArtifactExternally(path); }}
      onRevealInFolder={(path) => { void handleRevealPathInFolder(path); }}
      onPreviewHtml={(path) => {
        void handleOpenPath(path)
          .then(() => setRightPanelMode('none'))
          .catch((error) => console.warn('Failed to open HTML artifact:', error));
      }}
      onOpenSource={(path) => {
        void handleOpenPath(path)
          .then(() => {
            // 用户明确点了「源码」,跳到主编辑器并切到 source 模式。
            setEditorMode('source');
            setRightPanelMode('none');
          })
          .catch((error) => console.warn('Failed to open HTML source:', error));
      }}
    />
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
          editorMode,
          workspacePanelVisible: leftRailMode !== 'none',
          wordPreviewVisible: rightPanelMode === 'word',
          wechatPreviewVisible: rightPanelMode === 'wechat',
          artifactsVisible: rightPanelMode === 'artifacts',
          terminalVisible,
          editingDisabled: isDocx,
          docMode,
          onToggleEditorMode: handleToggleEditorMode,
          onFormat: handleEditorFormat,
          onToggleWorkspacePanel: handleTogglePrimaryPanel,
          onToggleWordPreview: handleToggleWordPreview,
          onToggleWechatPreview: handleToggleWechatPreview,
          onToggleArtifacts: () => setRightPanelMode((mode) => (mode === 'artifacts' ? 'none' : 'artifacts')),
          onToggleTerminal: handleToggleTerminal,
          onOpenToc: () => setTocOpenRequest((tick) => tick + 1),
          onSetDocMode: (next) => void setDocMode(next),
          onNew: handleNewFile,
          onOpen: handleOpen,
          onOpenFolder: handleOpenFolder,
          onSave: handleSave,
          onSaveAs: handleSaveAs,
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
          onRevealInFolder: (path) => { void handleRevealPathInFolder(path); },
          onOpenExternal: (path) => { void handleOpenArtifactExternally(path); },
        }}
        onLeftPanelResize={handleLeftPanelResizerPointerDown}
        showToc={!isDocx}
        tocProps={{
          items: toc,
          activeIndex: activeTocIndex,
          pinned: tocPinned,
          alwaysPinned: settings.tocAlwaysPinned,
          openRequest: tocOpenRequest,
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
        <DiffReviewPane
          controller={diffReviewController}
          onFeedback={handleCandidateFeedback}
          onRecheck={handleCandidateRecheck}
          onSaveAs={handleSaveCandidateAs}
          onResetToLatestSource={handleResetCandidateToLatestSource}
          onRebaseCandidateToLatestSource={handleRebaseCandidateToLatestSource}
        />
      </Suspense>
      <CandidateNavigationDialog
        open={candidateNavigationDialogOpen}
        onChoice={handleCandidateNavigationChoice}
      />
      <AppLayoutOverlays
        findVisible={findVisible}
        findFocusTarget={findFocusTarget}
        source={file.content}
        readOnly={isDocx}
        onCloseFind={() => setFindVisible(false)}
        onReplace={replaceFromFindPanel}
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
