import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { getSettings, updateSettings, type AppSettings, type ImageInsertAction } from '../../services/settingsService';

type UploadResult = {
  urls: string[];
  rawStdout: string;
  rawStderr: string;
  exitCode: number | null;
};

const ACTIONS: Array<{ value: ImageInsertAction; label: string }> = [
  { value: 'keep', label: '保持原路径' },
  { value: 'copy', label: '复制到指定文件夹' },
  { value: 'upload', label: '上传图床（自定义命令）' },
];

export function ImageSection() {
  const [settings, setSettings] = useState(() => getSettings());
  const [testResult, setTestResult] = useState('');
  const [testing, setTesting] = useState(false);

  const handleChange = (patch: Partial<AppSettings>) => {
    updateSettings(patch);
    setSettings(getSettings());
  };

  const handleTestUploader = async () => {
    if (!settings.imageUploadCommand.trim()) {
      setTestResult('请先填写上传命令。');
      return;
    }
    const picked = await open({
      multiple: false,
      filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'] }],
    });
    if (typeof picked !== 'string') return;

    setTesting(true);
    setTestResult('正在验证上传命令...');
    try {
      const result = await invoke<UploadResult>('upload_image_via_command', {
        request: {
          command: settings.imageUploadCommand,
          imagePaths: [picked],
          documentPath: '',
          documentName: '',
        },
      });
      setTestResult([
        `解析 URL: ${result.urls.join(', ') || '(无)'}`,
        `退出码: ${result.exitCode ?? '(未知)'}`,
        'stdout:',
        result.rawStdout || '(空)',
        'stderr:',
        result.rawStderr || '(空)',
      ].join('\n'));
    } catch (error) {
      setTestResult(`验证失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setTesting(false);
    }
  };

  const showCopyDestination = settings.imageInsertAction === 'copy';
  const showUploadCommand = settings.imageInsertAction === 'upload' || settings.imageAllowYamlUpload;

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">图像</h3>

      <div className="settings-row">
        <div>
          <div className="settings-label">插入图片时</div>
          <div className="settings-description">拖拽、粘贴、选择本地图片时自动处理。</div>
        </div>
        <select
          className="settings-select"
          value={settings.imageInsertAction}
          onChange={(event) => handleChange({ imageInsertAction: event.target.value as ImageInsertAction })}
        >
          {ACTIONS.map((action) => (
            <option key={action.value} value={action.value}>{action.label}</option>
          ))}
        </select>
      </div>

      {showCopyDestination && (
        <label className="settings-row">
          <div>
            <div className="settings-label">目标文件夹</div>
            <div className="settings-description">相对当前文档目录，支持 {'{filename}'}、{'{year}'}、{'{month}'} 占位符。</div>
          </div>
          <input
            className="settings-input"
            value={settings.imageCopyDestination}
            onChange={(event) => handleChange({ imageCopyDestination: event.target.value })}
            placeholder="assets"
          />
        </label>
      )}

      <div className="settings-row">
        <div>
          <div className="settings-label">优先使用相对路径</div>
        </div>
        <button
          type="button"
          className={`toggle-switch ${settings.imagePreferRelative ? 'on' : ''}`}
          onClick={() => handleChange({ imagePreferRelative: !settings.imagePreferRelative })}
        />
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">相对路径加 ./ 前缀</div>
        </div>
        <button
          type="button"
          className={`toggle-switch ${settings.imageEnsureDotPrefix ? 'on' : ''}`}
          onClick={() => handleChange({ imageEnsureDotPrefix: !settings.imageEnsureDotPrefix })}
        />
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">插入时转义路径</div>
          <div className="settings-description">例如把空格写成 %20。</div>
        </div>
        <button
          type="button"
          className={`toggle-switch ${settings.imageEscapeUrl ? 'on' : ''}`}
          onClick={() => handleChange({ imageEscapeUrl: !settings.imageEscapeUrl })}
        />
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">对本地图片应用上述规则</div>
        </div>
        <button
          type="button"
          className={`toggle-switch ${settings.imageApplyToLocal ? 'on' : ''}`}
          onClick={() => handleChange({ imageApplyToLocal: !settings.imageApplyToLocal })}
        />
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">允许 YAML 自动上传</div>
          <div className="settings-description">front matter 写 typora-copy-images-to: upload 时启用上传。</div>
        </div>
        <button
          type="button"
          className={`toggle-switch ${settings.imageAllowYamlUpload ? 'on' : ''}`}
          onClick={() => handleChange({ imageAllowYamlUpload: !settings.imageAllowYamlUpload })}
        />
      </div>

      {showUploadCommand && (
        <div className="settings-row settings-row-stacked">
          <div>
            <div className="settings-label">上传命令</div>
            <div className="settings-description">
              执行此命令上传图片,从输出末尾按图片数读取链接(每张一行)。
              可用 <code>${'${filename}'}</code> / <code>${'${filepath}'}</code> 代表当前文档。
            </div>
          </div>
          <div className="settings-inline-actions">
            <input
              className="settings-input"
              value={settings.imageUploadCommand}
              onChange={(event) => handleChange({ imageUploadCommand: event.target.value })}
              placeholder="picgo upload"
            />
            <button
              type="button"
              className="settings-action-button"
              onClick={handleTestUploader}
              disabled={testing}
            >
              {testing ? '验证中...' : '验证'}
            </button>
          </div>
          {testResult && <pre className="settings-test-output">{testResult}</pre>}
        </div>
      )}
    </div>
  );
}
