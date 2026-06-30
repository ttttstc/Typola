import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Send, Square } from 'lucide-react';
import type { AgentProvider } from '../../services/agent/provider';
import { AGENT_PROVIDERS, getAgentProviderConfig } from '../../services/agent/provider';
import { ComposerContextChips } from './ComposerContextChips';
import { ComposerPlusMenu } from './ComposerPlusMenu';
import { ComposerMcpPanel } from './ComposerMcpPanel';
import { ComposerPluginsPanel } from './ComposerPluginsPanel';
import { WorkingDirPicker } from './WorkingDirPicker';
import { useComposerContextState } from './useComposerContextState';

export type ComposerHandle = {
  injectText: (text: string) => void;
  addAttachments: (paths: string[]) => void;
};

type ComposerProps = {
  disabled?: boolean;
  running?: boolean;
  cwd?: string;
  workspaceSuggestion?: string;
  workspaceRecents?: string[];
  currentFileName?: string;
  currentFilePath?: string;
  /** AI Provider 进程实际运行的模型(来自 init/status 事件),Composer 优先显示这个。 */
  currentModel?: string;
  activeProvider: AgentProvider;
  configuredModel?: string;
  /** 本会话是否已注入过"当前文档"context → 后续 send 不再重复啰嗦。 */
  fileContextInjected?: boolean;
  currentFileContextPath?: string;
  promptReferenceTextEnabled?: boolean;
  onPickWorkspace: () => void;
  onSelectWorkspace: (path: string) => void;
  onClearWorkspace: () => void;
  onSwitchProvider: (provider: AgentProvider) => void;
  onSend: (text: string, context?: { currentFileContextPath?: string; referencePaths?: string[] }) => void;
  onCancel: () => void;
};

export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer({
  disabled = false,
  running = false,
  cwd,
  workspaceSuggestion,
  workspaceRecents = [],
  currentFileName,
  currentFilePath,
  currentModel,
  activeProvider,
  configuredModel,
  fileContextInjected = false,
  currentFileContextPath,
  promptReferenceTextEnabled = false,
  onPickWorkspace,
  onSelectWorkspace,
  onClearWorkspace,
  onSwitchProvider,
  onSend,
  onCancel,
}: ComposerProps, ref) {
  const [value, setValue] = useState('');
  const [panel, setPanel] = useState<'mcp' | 'plugins' | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const providerLabel = getAgentProviderConfig(activeProvider).label;
  const {
    attachedFiles,
    currentFileDismissed,
    recentDirs,
    appendContext,
    dismissCurrentFile,
    removeAttachment,
    addAttachments,
    handleAttachFiles,
  } = useComposerContextState({
    cwd,
    workspaceSuggestion,
    workspaceRecents,
    currentFilePath,
    activeProvider,
    fileContextInjected,
    currentFileContextPath,
    promptReferenceTextEnabled,
  });

  useImperativeHandle(ref, () => ({
    injectText(text: string) {
      setValue(text);
      // 等到 textarea 真正渲染出新 value 后再 focus + 定位光标
      window.requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        const pos = text.length;
        try {
          el.setSelectionRange(pos, pos);
        } catch {
          // 部分浏览器对未聚焦元素 setSelectionRange 会抛错，吞掉
        }
      });
    },
    addAttachments(paths: string[]) {
      addAttachments(paths);
    },
  }), [addAttachments]);

  const submit = () => {
    const text = value.trim();
    if (!text || disabled || running) return;
    setValue('');
    const next = appendContext(text);
    onSend(next.text, {
      currentFileContextPath: next.currentFileContextPath,
      referencePaths: next.referencePaths,
    });
  };

  const handleOpenMcp = () => {
    setPanel('mcp');
  };

  const handleOpenPlugins = () => {
    setPanel('plugins');
  };

  return (
    <div className="conversation-composer">
      <ComposerContextChips
        currentFileName={currentFileName}
        currentFilePath={currentFilePath}
        currentFileDismissed={currentFileDismissed}
        attachedFiles={attachedFiles}
        onDismissCurrentFile={dismissCurrentFile}
        onRemoveAttachment={removeAttachment}
      />
      <textarea
        ref={textareaRef}
        value={value}
        placeholder={`让 ${providerLabel} 帮你润色、总结、生成文档...`}
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault();
            submit();
          }
        }}
      />
      <div className="conversation-composer-actions">
        <div className="conversation-composer-left-actions">
          <ComposerPlusMenu
            onAttachFiles={() => void handleAttachFiles()}
            onOpenMcp={handleOpenMcp}
            onOpenPlugins={handleOpenPlugins}
          />
          <WorkingDirPicker
            workingDir={cwd ?? null}
            recentDirs={recentDirs}
            onPickDirectory={onPickWorkspace}
            onSelectRecent={onSelectWorkspace}
            onClear={onClearWorkspace}
            placement="up"
          />
          <div
            className="conversation-provider-picker"
            role="group"
            aria-label="AI Provider"
            title="切换 AI Provider 会开始新对话"
          >
            {AGENT_PROVIDERS.map((provider) => (
              <button
                key={provider.id}
                type="button"
                className={provider.id === activeProvider ? 'active' : ''}
                aria-pressed={provider.id === activeProvider}
                onClick={() => onSwitchProvider(provider.id)}
              >
                {provider.label}
              </button>
            ))}
          </div>
          <span className="conversation-model-placeholder" title="在设置 · AI CLI 配置模型">
            {currentModel
              ? `${providerLabel} · ${currentModel}`
              : configuredModel
                ? `${providerLabel} · ${configuredModel}`
                : `${providerLabel} · 默认模型`}
          </span>
        </div>
        {running ? (
          <button type="button" onClick={onCancel} title="停止">
            <Square size={14} /> 停止
          </button>
        ) : (
          <button type="button" onClick={submit} disabled={disabled || !value.trim()} title="发送 Ctrl+Enter">
            <Send size={14} /> 发送
          </button>
        )}
      </div>
      {panel === 'mcp' && (
        <ComposerMcpPanel cwd={cwd} onClose={() => setPanel(null)} />
      )}
      {panel === 'plugins' && (
        <ComposerPluginsPanel onClose={() => setPanel(null)} />
      )}
    </div>
  );
});
