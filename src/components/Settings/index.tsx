import { useEffect, useMemo, useState } from 'react';
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { useUIStore, SettingsTab } from '../../store/ui';
import { syncWorkspaceSearchDefaultsFromSettings } from '../../store/search';
import { useAIStore } from '../../store/ai';
import {
  ANTHROPIC_MODELS,
  OPENAI_COMPAT_PRESETS,
  getErrorMessage,
  type AIProviderSetupInput,
  type AISettingsSummary,
  type OpenAICompatiblePreset,
} from '../../llm/types';

function FieldLabel({ title, description }: { title: string; description?: string }) {
  return (
    <div style={{ display: 'grid', gap: '2px' }}>
      <div style={{ fontSize: '13px', fontWeight: 600 }}>{title}</div>
      {description ? <div style={{ fontSize: '12px', color: 'var(--color-muted)' }}>{description}</div> : null}
    </div>
  );
}

function Row({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        padding: '12px 0',
        borderBottom: '1px solid var(--color-line-soft)',
      }}
    >
      {children}
    </div>
  );
}

function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        width: '280px',
        height: '36px',
        padding: '0 10px',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--color-line-soft)',
        background: 'var(--color-paper)',
        color: 'var(--color-ink)',
        ...(props.style ?? {}),
      }}
    />
  );
}

function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      style={{
        minWidth: '160px',
        height: '36px',
        padding: '0 10px',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--color-line-soft)',
        background: 'var(--color-paper)',
        color: 'var(--color-ink)',
        ...(props.style ?? {}),
      }}
    />
  );
}

function SecondaryButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        height: '36px',
        padding: '0 12px',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--color-line-soft)',
        background: 'var(--color-paper)',
        color: 'var(--color-ink)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        height: '36px',
        padding: '0 12px',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid transparent',
        background: 'var(--color-ink)',
        color: 'var(--color-paper)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function ShortcutsContent() {
  const { t } = useTranslation();

  const shortcuts = [
    { label: t('shortcuts.save'), key: 'Ctrl+S' },
    { label: t('shortcuts.newFile'), key: 'Ctrl+N' },
    { label: t('shortcuts.findInFile'), key: 'Ctrl+F' },
    { label: t('shortcuts.findInWorkspace'), key: 'Ctrl+Shift+F' },
    { label: t('shortcuts.toggleSidebar'), key: 'Ctrl+\\' },
    { label: t('shortcuts.toggleOutline'), key: 'Ctrl+Shift+\\' },
    { label: t('shortcuts.toggleTheme'), key: 'Ctrl+Shift+D' },
    { label: t('shortcuts.bold'), key: 'Ctrl+B' },
    { label: t('shortcuts.italic'), key: 'Ctrl+I' },
    { label: t('shortcuts.strikethrough'), key: 'Ctrl+Shift+S' },
    { label: t('shortcuts.inlineCode'), key: 'Ctrl+`' },
    { label: t('shortcuts.link'), key: 'Ctrl+K' },
    { label: t('shortcuts.body'), key: 'Ctrl+0' },
    { label: t('shortcuts.heading1'), key: 'Ctrl+1' },
    { label: t('shortcuts.heading2'), key: 'Ctrl+2' },
    { label: t('shortcuts.heading3'), key: 'Ctrl+3' },
    { label: t('shortcuts.openSettings'), key: 'Ctrl+,' },
  ];

  return (
    <div>
      <h2 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600 }}>{t('shortcuts.title')}</h2>
      <div style={{ display: 'grid', gap: '8px' }}>
        {shortcuts.map((shortcut) => (
          <div
            key={shortcut.label}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '8px 12px',
              background: 'var(--color-surface-sunken)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <span style={{ fontSize: '13px' }}>{shortcut.label}</span>
            <kbd
              style={{
                padding: '4px 8px',
                background: 'var(--color-paper)',
                border: '1px solid var(--color-line-soft)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {shortcut.key}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlaceholderContent({ title }: { title: string }) {
  const { t } = useTranslation();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '220px',
        color: 'var(--color-muted)',
        fontSize: '14px',
      }}
    >
      {title} - {t('settings.notImplemented')}
    </div>
  );
}

function GeneralContent() {
  const { t } = useTranslation();
  const searchDefaults = useUIStore((state) => state.searchDefaults);
  const setSearchDefaults = useUIStore((state) => state.setSearchDefaults);

  const updateSearchDefaults = (patch: Partial<typeof searchDefaults>) => {
    setSearchDefaults(patch);
    syncWorkspaceSearchDefaultsFromSettings();
  };

  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      <h2 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 600 }}>{t('settings.searchGroup')}</h2>
      <Row>
        <FieldLabel title={t('search.caseSensitive')} description={t('settings.defaultSearchDescription')} />
        <Checkbox
          checked={searchDefaults.caseSensitive}
          onChange={(checked) => updateSearchDefaults({ caseSensitive: checked })}
          label={t('settings.enableByDefault')}
        />
      </Row>
      <Row>
        <FieldLabel title={t('search.wholeWord')} description={t('settings.wholeWordDescription')} />
        <Checkbox
          checked={searchDefaults.wholeWord}
          onChange={(checked) => updateSearchDefaults({ wholeWord: checked })}
          label={t('settings.enableByDefault')}
        />
      </Row>
      <Row>
        <FieldLabel title={t('search.regex')} description={t('settings.regexDescription')} />
        <Checkbox
          checked={searchDefaults.useRegex}
          onChange={(checked) => updateSearchDefaults({ useRegex: checked })}
          label={t('settings.enableByDefault')}
        />
      </Row>
      <Row>
        <FieldLabel title={t('settings.includeGlob')} description={t('settings.includeGlobDescription')} />
        <TextInput
          value={searchDefaults.includeGlob}
          onChange={(event) => updateSearchDefaults({ includeGlob: event.target.value })}
        />
      </Row>
      <Row>
        <FieldLabel title={t('settings.excludeGlob')} description={t('settings.excludeGlobDescription')} />
        <TextInput
          value={searchDefaults.excludeGlob}
          onChange={(event) => updateSearchDefaults({ excludeGlob: event.target.value })}
        />
      </Row>
    </div>
  );
}

function ExportContent() {
  const { t } = useTranslation();
  const exportSettings = useUIStore((state) => state.exportSettings);
  const setExportSettings = useUIStore((state) => state.setExportSettings);

  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      <h2 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 600 }}>{t('settings.exportPdf')}</h2>
      <Row>
        <FieldLabel title={t('settings.pageSize')} description={t('settings.pageSizeDescription')} />
        <Select
          value={exportSettings.pdfPageSize}
          onChange={(event) => setExportSettings({ pdfPageSize: event.target.value as 'A4' | 'Letter' })}
        >
          <option value="A4">A4</option>
          <option value="Letter">Letter</option>
        </Select>
      </Row>
      <Row>
        <FieldLabel title={t('settings.margin')} description={t('settings.marginDescription')} />
        <Select
          value={exportSettings.pdfMargin}
          onChange={(event) => setExportSettings({ pdfMargin: event.target.value as 'compact' | 'normal' | 'wide' })}
        >
          <option value="compact">{t('settings.marginCompact')}</option>
          <option value="normal">{t('settings.marginNormal')}</option>
          <option value="wide">{t('settings.marginWide')}</option>
        </Select>
      </Row>
      <Row>
        <FieldLabel title={t('settings.printBackground')} description={t('settings.printBackgroundDescription')} />
        <Checkbox
          checked={exportSettings.pdfPrintBackground}
          onChange={(checked) => setExportSettings({ pdfPrintBackground: checked })}
          label={t('settings.enableByDefault')}
        />
      </Row>
      <Row>
        <FieldLabel title={t('settings.headerFooter')} description={t('settings.headerFooterDescription')} />
        <Checkbox
          checked={exportSettings.pdfHeaderFooter}
          onChange={(checked) => setExportSettings({ pdfHeaderFooter: checked })}
          label={t('settings.enableByDefault')}
        />
      </Row>

      <h2 style={{ margin: '16px 0 8px', fontSize: '16px', fontWeight: 600 }}>{t('settings.exportHtml')}</h2>
      <Row>
        <FieldLabel title={t('settings.imageMode')} description={t('settings.imageModeDescription')} />
        <Select
          value={exportSettings.htmlImageMode}
          onChange={(event) =>
            setExportSettings({ htmlImageMode: event.target.value as 'relative' | 'base64' | 'external' })
          }
        >
          <option value="relative">{t('settings.imageModeRelative')}</option>
          <option value="base64">{t('settings.imageModeBase64')}</option>
          <option value="external">{t('settings.imageModeExternal')}</option>
        </Select>
      </Row>
    </div>
  );
}

function summaryToForm(summary: AISettingsSummary): AIProviderSetupInput {
  if (summary.provider === 'anthropic') {
    return {
      provider: 'anthropic',
      apiKey: '',
      model: summary.model,
      requestTimeoutMs: summary.requestTimeoutMs,
    };
  }

  return {
    provider: 'openai-compatible',
    apiKey: '',
    model: summary.model,
    baseUrl: summary.baseUrl,
    preset: summary.preset,
    requestTimeoutMs: summary.requestTimeoutMs,
  };
}

function AIContent() {
  const { t } = useTranslation();
  const settings = useAIStore((state) => state.settings);
  const pendingAction = useAIStore((state) => state.pendingAction);
  const lastError = useAIStore((state) => state.lastError);
  const lastSuccess = useAIStore((state) => state.lastSuccess);
  const setSettings = useAIStore((state) => state.setSettings);
  const setLastError = useAIStore((state) => state.setLastError);
  const setLastSuccess = useAIStore((state) => state.setLastSuccess);
  const clearMessages = useAIStore((state) => state.clearMessages);
  const clearPendingAction = useAIStore((state) => state.clearPendingAction);
  const runAction = useAIStore((state) => state.runAction);
  const [form, setForm] = useState<AIProviderSetupInput>(() => summaryToForm(settings));
  const [submitting, setSubmitting] = useState(false);
  const setSettingsOpen = useUIStore((state) => state.setSettingsOpen);

  useEffect(() => {
    setForm(summaryToForm(settings));
  }, [settings]);

  const presetItems = useMemo(() => Object.values(OPENAI_COMPAT_PRESETS), []);

  const setProvider = (provider: 'anthropic' | 'openai-compatible') => {
    clearMessages();
    if (provider === 'anthropic') {
      setForm({
        provider: 'anthropic',
        apiKey: '',
        model: ANTHROPIC_MODELS[0],
        requestTimeoutMs: 30000,
      });
      return;
    }

    const preset = OPENAI_COMPAT_PRESETS.openai;
    setForm({
      provider: 'openai-compatible',
      apiKey: '',
      preset: preset.id,
      baseUrl: preset.baseUrl,
      model: preset.defaultModel,
      requestTimeoutMs: 30000,
    });
  };

  const applyPreset = (presetId: OpenAICompatiblePreset) => {
    if (presetId === 'custom') {
      setForm((prev) =>
        prev.provider === 'openai-compatible'
          ? {
              ...prev,
              preset: 'custom',
            }
          : {
              provider: 'openai-compatible',
              apiKey: '',
              preset: 'custom',
              baseUrl: '',
              model: '',
              requestTimeoutMs: 30000,
            }
      );
      return;
    }

    const preset = OPENAI_COMPAT_PRESETS[presetId];
    setForm((prev) => ({
      provider: 'openai-compatible',
      apiKey: prev.provider === 'openai-compatible' ? prev.apiKey : '',
      preset: preset.id,
      baseUrl: preset.baseUrl,
      model: preset.defaultModel,
      requestTimeoutMs: prev.requestTimeoutMs ?? 30000,
    }));
  };

  const handleSave = async () => {
    clearMessages();
    setSubmitting(true);
    try {
      const saved = await window.electronAPI.saveAISettings(form);
      setSettings(saved);
      setLastSuccess(t('settings.aiSaved'));
    } catch (error) {
      setLastError(error instanceof Error ? error.message : t('settings.aiSaveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleTest = async () => {
    clearMessages();
    setSubmitting(true);
    try {
      const saved = await window.electronAPI.saveAISettings(form);
      setSettings(saved);

      const result = await window.electronAPI.testAIConnection();
      if (!result.ok) {
        setLastError(getErrorMessage(result.error));
        return;
      }

      setLastSuccess(`${t('settings.aiConnectionOk')}: ${result.data.providerLabel} · ${result.data.model}`);

      if (pendingAction) {
        const actionResult = await runAction(pendingAction.action, pendingAction.selection);
        clearPendingAction();
        if (actionResult.ok) {
          setSettingsOpen(false);
        }
      }
    } catch (error) {
      setLastError(error instanceof Error ? error.message : t('settings.aiSaveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const savedKeyHint = settings.hasApiKey ? t('settings.aiKeySavedHint') : t('settings.aiKeyRequiredHint');

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <div style={{ display: 'grid', gap: '8px' }}>
        <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>{t('settings.aiProvider')}</h2>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <SecondaryButton onClick={() => setProvider('anthropic')}>
            Anthropic
          </SecondaryButton>
          <SecondaryButton onClick={() => setProvider('openai-compatible')}>
            OpenAI Compatible
          </SecondaryButton>
        </div>
      </div>

      {form.provider === 'anthropic' ? (
        <div style={{ display: 'grid', gap: '8px' }}>
          <Row>
            <FieldLabel
              title={t('settings.aiConsoleLink')}
              description={t('settings.aiAnthropicConsoleDescription')}
            />
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--color-ink)', fontSize: '13px' }}
            >
              console.anthropic.com
            </a>
          </Row>
          <Row>
            <FieldLabel title={t('settings.aiApiKey')} description={savedKeyHint} />
            <TextInput
              type="password"
              placeholder="sk-ant-..."
              value={form.apiKey}
              onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
            />
          </Row>
          <Row>
            <FieldLabel title={t('settings.aiModel')} />
            <Select
              value={form.model}
              onChange={(event) => setForm({ ...form, model: event.target.value })}
            >
              {ANTHROPIC_MODELS.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </Select>
          </Row>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '8px' }}>
          <Row>
            <FieldLabel title={t('settings.aiPreset')} description={t('settings.aiPresetDescription')} />
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {presetItems.map((preset) => (
                <SecondaryButton key={preset.id} onClick={() => applyPreset(preset.id)}>
                  {preset.label}
                </SecondaryButton>
              ))}
              <SecondaryButton onClick={() => applyPreset('custom')}>Custom</SecondaryButton>
            </div>
          </Row>
          <Row>
            <FieldLabel title={t('settings.aiApiKey')} description={savedKeyHint} />
            <TextInput
              type="password"
              placeholder="sk-..."
              value={form.apiKey}
              onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
            />
          </Row>
          <Row>
            <FieldLabel title={t('settings.aiBaseUrl')} />
            <TextInput
              value={form.baseUrl}
              onChange={(event) => setForm({ ...form, baseUrl: event.target.value })}
            />
          </Row>
          <Row>
            <FieldLabel title={t('settings.aiModel')} />
            <TextInput
              value={form.model}
              onChange={(event) => setForm({ ...form, model: event.target.value })}
            />
          </Row>
        </div>
      )}

      <Row>
        <FieldLabel title={t('settings.aiTimeout')} description={t('settings.aiTimeoutDescription')} />
        <TextInput
          type="number"
          min={5000}
          step={1000}
          value={String(form.requestTimeoutMs ?? 30000)}
          onChange={(event) =>
            setForm({
              ...form,
              requestTimeoutMs: Number(event.target.value) || 30000,
            })
          }
        />
      </Row>

      {pendingAction ? (
        <div
          style={{
            fontSize: '12px',
            color: 'var(--color-muted)',
            background: 'var(--color-surface-sunken)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 12px',
          }}
        >
          {t('settings.aiPendingAction')}
        </div>
      ) : null}

      {lastError ? (
        <div
          style={{
            fontSize: '12px',
            color: '#b42318',
            background: '#fef3f2',
            borderRadius: 'var(--radius-md)',
            padding: '10px 12px',
          }}
        >
          {lastError}
        </div>
      ) : null}

      {lastSuccess ? (
        <div
          style={{
            fontSize: '12px',
            color: '#067647',
            background: '#ecfdf3',
            borderRadius: 'var(--radius-md)',
            padding: '10px 12px',
          }}
        >
          {lastSuccess}
        </div>
      ) : null}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
        <SecondaryButton onClick={handleSave} disabled={submitting}>
          {t('common.save')}
        </SecondaryButton>
        <PrimaryButton onClick={handleTest} disabled={submitting}>
          {submitting ? t('settings.aiTesting') : t('settings.aiTestConnection')}
        </PrimaryButton>
      </div>
    </div>
  );
}

function SettingsContent({ activeTab }: { activeTab: SettingsTab }) {
  const { t } = useTranslation();

  switch (activeTab) {
    case 'shortcuts':
      return <ShortcutsContent />;
    case 'general':
      return <GeneralContent />;
    case 'ai':
      return <AIContent />;
    case 'export':
      return <ExportContent />;
    case 'editor':
      return <PlaceholderContent title={t('settings.editor')} />;
    case 'appearance':
      return <PlaceholderContent title={t('settings.appearance')} />;
    case 'terminal':
      return <PlaceholderContent title={t('settings.terminal')} />;
    default:
      return <GeneralContent />;
  }
}

export function Settings() {
  const { t } = useTranslation();
  const settingsOpen = useUIStore((state) => state.settingsOpen);
  const settingsActiveTab = useUIStore((state) => state.settingsActiveTab);
  const setSettingsOpen = useUIStore((state) => state.setSettingsOpen);
  const setSettingsActiveTab = useUIStore((state) => state.setSettingsActiveTab);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === ',') {
        event.preventDefault();
        setSettingsOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setSettingsOpen]);

  const tabGroups = [
    {
      label: t('settings.common'),
      items: [
        { id: 'general' as SettingsTab, label: t('settings.general') },
        { id: 'ai' as SettingsTab, label: t('settings.ai') },
        { id: 'editor' as SettingsTab, label: t('settings.editor') },
        { id: 'appearance' as SettingsTab, label: t('settings.appearance') },
        { id: 'export' as SettingsTab, label: t('settings.export') },
      ],
    },
    {
      label: t('settings.advanced'),
      items: [
        { id: 'terminal' as SettingsTab, label: t('settings.terminal') },
        { id: 'shortcuts' as SettingsTab, label: t('settings.shortcuts') },
      ],
    },
  ];

  if (!settingsOpen) return null;

  const activeItem = tabGroups.flatMap((group) => group.items).find((item) => item.id === settingsActiveTab);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 3000,
      }}
      onClick={() => setSettingsOpen(false)}
    >
      <div
        style={{
          background: 'var(--color-paper)',
          borderRadius: 'var(--radius-lg)',
          width: '780px',
          height: '560px',
          display: 'flex',
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          style={{
            width: '190px',
            borderRight: '1px solid var(--color-line-soft)',
            padding: '16px 0',
            overflow: 'auto',
          }}
        >
          {tabGroups.map((group) => (
            <div key={group.label} style={{ marginBottom: '16px' }}>
              <div
                style={{
                  padding: '6px 16px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--color-muted)',
                  textTransform: 'uppercase',
                }}
              >
                {group.label}
              </div>
              {group.items.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSettingsActiveTab(item.id)}
                  style={{
                    padding: '8px 16px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    background: settingsActiveTab === item.id ? 'var(--color-surface-sunken)' : 'transparent',
                    borderLeft:
                      settingsActiveTab === item.id
                        ? '2px solid var(--color-accent)'
                        : '2px solid transparent',
                  }}
                >
                  {item.label}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div style={{ flex: 1, padding: '24px', overflow: 'auto' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}
          >
            <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>{activeItem?.label}</h1>
            <button
              onClick={() => setSettingsOpen(false)}
              style={{
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                color: 'var(--color-muted)',
                border: 'none',
                background: 'transparent',
              }}
            >
              <X size={18} />
            </button>
          </div>
          <SettingsContent activeTab={settingsActiveTab} />
        </div>
      </div>
    </div>
  );
}
