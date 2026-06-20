import { useEffect, useState } from 'react';
import { Save, X } from 'lucide-react';
import { readMcpConfig, writeMcpConfig } from '../../services/agent/mcpConfigService';

type ComposerMcpPanelProps = {
  cwd?: string;
  onClose: () => void;
};

/**
 * MCP editor panel extracted from Composer without changing its behavior or copy.
 */
export function ComposerMcpPanel({ cwd, onClose }: ComposerMcpPanelProps) {
  const [mcpText, setMcpText] = useState('');
  const [mcpMessage, setMcpMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    setMcpMessage('');
    if (!cwd) {
      setMcpText('');
      setMcpMessage('请先在 AI 工作台顶部选择工作区。');
      return undefined;
    }

    void readMcpConfig(cwd)
      .then((value) => {
        if (cancelled) return;
        setMcpText(value ?? '{\n  "mcpServers": {}\n}\n');
      })
      .catch((error) => {
        if (cancelled) return;
        setMcpMessage(error instanceof Error ? error.message : String(error));
      });

    return () => {
      cancelled = true;
    };
  }, [cwd]);

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

  return (
    <div className="conversation-config-panel">
      <div className="conversation-config-panel-header">
        <strong>MCP · {cwd ? `${cwd}\\.mcp.json` : '未选择工作区'}</strong>
        <button type="button" onClick={onClose} aria-label="关闭 MCP 设置">
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
  );
}
