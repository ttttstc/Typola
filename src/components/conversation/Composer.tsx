import { useEffect, useMemo, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { Save, Send, Square, X } from 'lucide-react';
import { useSettings } from '../../hooks/useSettings';
import { readMcpConfig, writeMcpConfig } from '../../services/agent/mcpConfigService';
import { updateSettings } from '../../services/settingsService';
import { ComposerPlusMenu } from './ComposerPlusMenu';
import { WorkingDirPicker } from './WorkingDirPicker';

type ComposerProps = {
  disabled?: boolean;
  running?: boolean;
  cwd?: string;
  workspaceSuggestion?: string;
  workspaceRecents: string[];
  currentFileName?: string;
  currentFilePath?: string;
  onPickWorkspace: () => void;
  onSelectWorkspace: (path: string) => void;
  onClearWorkspace: () => void;
  onSend: (text: string) => void;
  onCancel: () => void;
};

export function Composer({
  disabled = false,
  running = false,
  cwd,
  workspaceSuggestion,
  workspaceRecents = [],
  currentFileName,
  currentFilePath,
  onPickWorkspace,
  onSelectWorkspace,
  onClearWorkspace,
  onSend,
  onCancel,
}: ComposerProps) {
  const settings = useSettings();
  const [value, setValue] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<string[]>([]);
  const [panel, setPanel] = useState<'mcp' | 'plugins' | null>(null);
  const [mcpText, setMcpText] = useState('');
  const [mcpMessage, setMcpMessage] = useState('');
  const [pluginText, setPluginText] = useState(settings.aiPluginDirs.join('\n'));
  const [currentFileDismissed, setCurrentFileDismissed] = useState(false);

  useEffect(() => {
    setCurrentFileDismissed(false);
  }, [currentFilePath]);

  const recentDirs = useMemo(() => {
    const ordered = [
      ...(workspaceSuggestion ? [workspaceSuggestion] : []),
      ...workspaceRecents,
    ];
    const seen = new Set<string>();
    return ordered.flatMap((dir) => {
      if (!dir || dir === cwd || seen.has(dir)) return [];
      seen.add(dir);
      return [dir];
    }).slice(0, 8);
  }, [cwd, workspaceRecents, workspaceSuggestion]);

  const contextPaths = [
    ...(currentFilePath && !currentFileDismissed ? [currentFilePath] : []),
    ...attachedFiles,
  ];

  const appendContext = (prompt: string): string => {
    if (contextPaths.length === 0) return prompt;
    const references = contextPaths.map((path) => `- ${path}`).join('\n');
    return `${prompt}\n\n参考以下文件：\n${references}`;
  };

  const submit = () => {
    const text = value.trim();
    if (!text || disabled || running) return;
    setValue('');
    onSend(appendContext(text));
  };

  const handleAttachFiles = async () => {
    const selected = await open({ multiple: true });
    const paths = Array.isArray(selected) ? selected : selected ? [selected] : [];
    setAttachedFiles((current) => {
      const seen = new Set(current);
      return [
        ...current,
        ...paths.flatMap((path) => {
          if (typeof path !== 'string' || seen.has(path)) return [];
          seen.add(path);
          return [path];
        }),
      ];
    });
  };

  const handleOpenMcp = async () => {
    setPanel('mcp');
    setMcpMessage('');
    if (!cwd) {
      setMcpText('');
      setMcpMessage('请先在 AI 工作台顶部选择工作区。');
      return;
    }
    try {
      setMcpText(await readMcpConfig(cwd) ?? '{\n  "mcpServers": {}\n}\n');
    } catch (error) {
      setMcpMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const handleSaveMcp = async () => {
    if (!cwd) {
      setMcpMessage('请先在 AI 工作台顶部选择工作区。');
      return;
    }
    try {
      await writeMcpConfig(cwd, mcpText);
      setMcpMessage('已保存 .mcp.json');
    } catch (error) {
      setMcpMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const handleOpenPlugins = () => {
    setPluginText(settings.aiPluginDirs.join('\n'));
    setPanel('plugins');
  };

  const handleSavePlugins = () => {
    updateSettings({
      aiPluginDirs: pluginText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    });
    setPanel(null);
  };

  return (
    <div className="conversation-composer">
      <div className="conversation-context-chips">
        {currentFilePath && !currentFileDismissed && (
          <span title={currentFilePath}>
            {currentFileName || currentFilePath}
            <button
              type="button"
              onClick={() => setCurrentFileDismissed(true)}
              aria-label="移除当前文档上下文"
            >
              <X size={12} />
            </button>
          </span>
        )}
        {attachedFiles.map((path) => (
          <span key={path} title={path}>
            {path.replace(/\\/g, '/').split('/').pop() || path}
            <button
              type="button"
              onClick={() => setAttachedFiles((current) => current.filter((candidate) => candidate !== path))}
              aria-label="移除附件"
            >
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      <textarea
        value={value}
        placeholder="让 Claude 帮你润色、总结、生成文档..."
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
            onOpenMcp={() => void handleOpenMcp()}
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
          <span className="conversation-model-placeholder">Claude · 默认模型</span>
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
        <div className="conversation-config-panel">
          <div className="conversation-config-panel-header">
            <strong>MCP · {cwd ? `${cwd}\\.mcp.json` : '未选择工作区'}</strong>
            <button type="button" onClick={() => setPanel(null)} aria-label="关闭 MCP 设置">
              <X size={13} />
            </button>
          </div>
          <textarea
            value={mcpText}
            onChange={(event) => setMcpText(event.target.value)}
            placeholder={'{\n  "mcpServers": {}\n}'}
          />
          {mcpMessage && <p>{mcpMessage}</p>}
          <button type="button" onClick={() => void handleSaveMcp()} disabled={!cwd}>
            <Save size={13} /> 保存 MCP
          </button>
        </div>
      )}
      {panel === 'plugins' && (
        <div className="conversation-config-panel">
          <div className="conversation-config-panel-header">
            <strong>Plugin directories</strong>
            <button type="button" onClick={() => setPanel(null)} aria-label="关闭 Plugins 设置">
              <X size={13} />
            </button>
          </div>
          <textarea
            value={pluginText}
            onChange={(event) => setPluginText(event.target.value)}
            placeholder="每行一个 plugin 目录路径"
          />
          <button type="button" onClick={handleSavePlugins}>
            <Save size={13} /> 保存 Plugins
          </button>
        </div>
      )}
    </div>
  );
}
