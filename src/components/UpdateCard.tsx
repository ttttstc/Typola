import { AlertCircle, ArrowRight, Download, RefreshCw } from 'lucide-react';
import { useSettings } from '../hooks/useSettings';
import { translate } from '../services/i18n';
import type { AppUpdateState, DistributionKind } from '../services/updateService';

type UpdateCardProps = {
  state: AppUpdateState;
  distributionKind: DistributionKind;
  onAction: () => void;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function UpdateCard({ state, distributionKind, onAction }: UpdateCardProps) {
  const settings = useSettings();
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);
  if (state.phase === 'idle' || state.phase === 'checking') return null;

  const version = state.update?.version;
  const busy = state.phase === 'downloading' || state.phase === 'installing';
  const title = state.phase === 'available'
    ? t('updateCardAvailableTitle')
    : state.phase === 'downloading'
      ? t('updateCardDownloading')
      : state.phase === 'ready'
        ? t('updateCardReady')
        : state.phase === 'installing'
          ? t('updateCardInstalling')
          : t('updateCardError');
  const detail = state.phase === 'downloading'
    ? state.progress.percent === undefined
      ? formatBytes(state.progress.downloadedBytes)
      : `${state.progress.percent}%`
    : state.phase === 'error'
      ? state.message
      : version ? `v${version}` : '';
  const action = state.phase === 'error'
    ? t('updateCardRetry')
    : state.phase === 'ready'
      ? t('updateCardRelaunchAction')
      : distributionKind === 'portable'
        ? t('updateCardPortableAction')
        : t('updateCardInstalledAction');

  return (
    <section className={`update-card update-card-${state.phase}`} role="status" aria-live="polite">
      <div className="update-card-icon" aria-hidden="true">
        {state.phase === 'error'
          ? <AlertCircle size={18} />
          : state.phase === 'downloading'
            ? <Download size={18} />
            : <RefreshCw size={18} className={busy ? 'spinning' : ''} />}
      </div>
      <div className="update-card-copy">
        <strong>{title}</strong>
        {detail && <span title={detail}>{detail}</span>}
        {state.phase === 'downloading' && state.progress.percent !== undefined && (
          <div className="update-card-progress" aria-hidden="true">
            <span style={{ width: `${state.progress.percent}%` }} />
          </div>
        )}
      </div>
      <button type="button" onClick={onAction} disabled={busy} aria-label={action}>
        {busy ? <span className="update-card-spinner" /> : <ArrowRight size={17} />}
      </button>
    </section>
  );
}
