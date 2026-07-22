import { RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../../hooks/useSettings';
import { translate } from '../../services/i18n';
import { updateSettings } from '../../services/settingsService';
import { SettingsToggle } from './SettingsToggle';
import {
  DEVELOPMENT_APP_VERSION,
  getCurrentAppVersion,
  type AppUpdateState,
  type UpdateCheckResult,
} from '../../services/updateService';

type AboutSectionProps = {
  onCheckForUpdate: () => Promise<UpdateCheckResult>;
  updateState: AppUpdateState;
  onUpdateAction: () => void;
  onIgnoreUpdate: () => void;
  onShowIgnoredUpdate?: () => void;
};

type CheckState = 'idle' | 'checking' | 'latest' | 'available' | 'ignored' | 'unsupported' | 'error';
type AvailableUpdate = Extract<UpdateCheckResult, { status: 'available' }>;

const appIconUrl = new URL('../../assets/typola-icon.png', import.meta.url).href;

export function AboutSection({
  onCheckForUpdate,
  updateState,
  onUpdateAction,
  onIgnoreUpdate,
  onShowIgnoredUpdate,
}: AboutSectionProps) {
  const settings = useSettings();
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);
  const [version, setVersion] = useState(DEVELOPMENT_APP_VERSION);
  const [checkState, setCheckState] = useState<CheckState>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [localAvailableUpdate, setLocalAvailableUpdate] = useState<AvailableUpdate | null>(null);
  const updateCheckRequestRef = useRef(0);
  const availableUpdate = ('update' in updateState ? updateState.update : undefined) ?? localAvailableUpdate;
  // The parent state update is scheduled by the same check callback. Keep this
  // local fallback only until that state is visible through props.
  const hasLocalPendingUpdate = localAvailableUpdate !== null && updateState.phase === 'idle';
  const canChooseUpdate = Boolean(
    availableUpdate
      && (updateState.phase === 'available'
        || updateState.phase === 'ready'
        || updateState.phase === 'ignored'
        || hasLocalPendingUpdate),
  );
  const displayMessage = message
    ?? (updateState.phase === 'ignored'
      ? `${t('updateIgnored')} v${availableUpdate?.version ?? ''}`
      : undefined)
    ?? (availableUpdate ? `${t('updateAvailable')} v${availableUpdate.version}` : '');

  useEffect(() => {
    void getCurrentAppVersion().then(setVersion);
  }, []);

  const handleAutoUpdateToggle = () => {
    updateSettings({ autoUpdateCheck: !settings.autoUpdateCheck });
  };

  const handleCheckUpdate = async () => {
    const requestId = updateCheckRequestRef.current + 1;
    updateCheckRequestRef.current = requestId;
    setCheckState('checking');
    setMessage(t('updateCheckingRemote'));

    const result = await onCheckForUpdate();
    if (requestId !== updateCheckRequestRef.current) return;

    if (result.status === 'available') {
      setLocalAvailableUpdate(result);
      const ignored = settings.ignoredVersion === result.version;
      setCheckState(ignored ? 'ignored' : 'available');
      setMessage(ignored
        ? `${t('updateIgnored')} v${result.version}`
        : `${t('updateAvailable')} ${result.version}`);
      return;
    }

    if (result.status === 'not-available') {
      setLocalAvailableUpdate(null);
      setCheckState('latest');
      setMessage(t('updateLatest'));
      return;
    }

    if (result.status === 'unsupported') {
      setLocalAvailableUpdate(null);
      setCheckState('unsupported');
      setMessage(t('updateUnsupported'));
      return;
    }

    setLocalAvailableUpdate(null);
    setCheckState('error');
    setMessage(result.message || t('updateError'));
  };

  const handleIgnoreUpdate = () => {
    // Invalidate a still-running check so its result cannot restore the prompt.
    updateCheckRequestRef.current += 1;
    onIgnoreUpdate();
    setLocalAvailableUpdate(null);
    setCheckState('ignored');
    setMessage(t('updateIgnored'));
  };

  const handleShowIgnoredUpdate = () => {
    onShowIgnoredUpdate?.();
    setCheckState('available');
    setMessage(availableUpdate ? `${t('updateAvailable')} ${availableUpdate.version}` : null);
  };

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">{t('aboutTitle')}</h3>

      <div className="about-product">
        <img
          className="about-app-icon"
          src={appIconUrl}
          alt=""
          width={54}
          height={54}
        />
        <div>
          <div className="about-product-name">
            Typola
          </div>
          <div className="settings-desc about-product-positioning">
            {t('appPositioning')}
          </div>
        </div>
      </div>

      <div className="about-info-panel">
        <div className="about-info-row">
          <span className="about-info-label">{t('versionLabel')}</span>
          <span className="about-info-value">{version}</span>
        </div>

        <div className="about-info-row about-update-row">
          <div>
            <div className="about-info-label">{t('updateLabel')}</div>
            {displayMessage && (
              <div className={`settings-desc update-check-message ${checkState}`}>{displayMessage}</div>
            )}
            {canChooseUpdate && availableUpdate && (
              <div className="about-update-choice">
                <button
                  type="button"
                  className="primary-action-button"
                  onClick={updateState.phase === 'ignored' ? handleShowIgnoredUpdate : onUpdateAction}
                >
                  {updateState.phase === 'ignored'
                    ? t('updateShowAgain')
                    : updateState.phase === 'ready' ? t('updateRelaunch') : t('updateApply')}
                </button>
                {updateState.phase !== 'ignored' && (
                  <button type="button" className="secondary-action-button" onClick={handleIgnoreUpdate}>
                    {t('updateIgnore')}
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="about-update-actions">
            <span className="about-auto-update">
              <span>{t('autoUpdateLabel')}</span>
              <SettingsToggle
                checked={settings.autoUpdateCheck}
                label={t('autoUpdateLabel')}
                onChange={handleAutoUpdateToggle}
              />
            </span>
            <button
              type="button"
              className="settings-action-button"
              onClick={handleCheckUpdate}
              disabled={checkState === 'checking'}
            >
              <RefreshCw size={14} className={checkState === 'checking' ? 'spinning' : ''} />
              {checkState === 'checking' ? t('updateChecking') : t('updateButton')}
            </button>
          </div>
        </div>

        <div className="about-info-row">
          <span className="about-info-label">{t('projectUrlLabel')}</span>
          <a className="about-info-value" href="https://github.com/ttttstc/Typola" target="_blank" rel="noreferrer">
            github.com/ttttstc/Typola
          </a>
        </div>
      </div>

    </div>
  );
}
