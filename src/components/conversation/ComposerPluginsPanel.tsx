import { useEffect, useState } from 'react';
import { Save, X } from 'lucide-react';
import { useSettings } from '../../hooks/useSettings';
import { updateSettings } from '../../services/settingsService';

type ComposerPluginsPanelProps = {
  onClose: () => void;
};

/**
 * Plugins panel extracted from Composer to keep the main composer focused on input UX.
 */
export function ComposerPluginsPanel({ onClose }: ComposerPluginsPanelProps) {
  const settings = useSettings();
  const [pluginText, setPluginText] = useState(settings.aiPluginDirs.join('\n'));

  useEffect(() => {
    setPluginText(settings.aiPluginDirs.join('\n'));
  }, [settings.aiPluginDirs]);

  const handleSavePlugins = () => {
    updateSettings({
      aiPluginDirs: pluginText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    });
    onClose();
  };

  return (
    <div className="conversation-config-panel">
      <div className="conversation-config-panel-header">
        <strong>Plugin directories</strong>
        <button type="button" onClick={onClose} aria-label="关闭 Plugins 设置">
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
  );
}
