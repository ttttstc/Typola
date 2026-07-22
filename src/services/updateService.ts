import type { DownloadEvent, Update } from '@tauri-apps/plugin-updater';

// GitHub release metadata may cross two redirects and have a slow first TLS
// connection, especially on Windows networks with a system proxy.
const UPDATE_CHECK_TIMEOUT_MS = 30_000;
export const DEVELOPMENT_APP_VERSION = 'dev';
export const TYPOLA_RELEASES_URL = 'https://github.com/ttttstc/Typola/releases';

export type UpdateSource = 'auto' | 'manual';
export type DistributionKind = 'installed' | 'portable';

export type UpdateProgress = {
  status: 'downloading' | 'ready' | 'installing' | 'relaunching';
  downloadedBytes: number;
  totalBytes?: number;
  percent?: number;
};

export type UpdateCheckResult =
  | { status: 'unsupported' }
  | { status: 'not-available' }
  | { status: 'available'; update: Update; version: string; date?: string; body?: string }
  | { status: 'error'; message: string };

type AvailableUpdate = Extract<UpdateCheckResult, { status: 'available' }>;
let pendingUpdateCheck: Promise<UpdateCheckResult> | null = null;

export type AppUpdateState =
  | { phase: 'idle' }
  | { phase: 'checking'; source: UpdateSource }
  | { phase: 'available'; source: UpdateSource; update: AvailableUpdate }
  | { phase: 'ignored'; source: UpdateSource; update: AvailableUpdate }
  | { phase: 'downloading'; source: UpdateSource; update: AvailableUpdate; progress: UpdateProgress }
  | { phase: 'ready'; source: UpdateSource; update: AvailableUpdate }
  | { phase: 'installing'; source: UpdateSource; update: AvailableUpdate }
  | { phase: 'error'; source: UpdateSource; update?: AvailableUpdate; message: string };

export function isTauriRuntime(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '更新检查失败';
}

export async function getCurrentAppVersion(): Promise<string> {
  if (!isTauriRuntime()) return DEVELOPMENT_APP_VERSION;
  try {
    const { getVersion } = await import('@tauri-apps/api/app');
    return await getVersion();
  } catch {
    return DEVELOPMENT_APP_VERSION;
  }
}

export async function getDistributionKind(): Promise<DistributionKind> {
  if (!isTauriRuntime()) return 'installed';
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<DistributionKind>('get_distribution_kind');
}

export async function openReleaseForVersion(version: string): Promise<void> {
  const { openUrl } = await import('@tauri-apps/plugin-opener');
  await openUrl(`${TYPOLA_RELEASES_URL}/tag/v${encodeURIComponent(version)}`);
}

async function performUpdateCheck(): Promise<UpdateCheckResult> {
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check({ timeout: UPDATE_CHECK_TIMEOUT_MS });
    if (!update) return { status: 'not-available' };
    return {
      status: 'available',
      update,
      version: update.version,
      date: update.date,
      body: update.body,
    };
  } catch (error) {
    return { status: 'error', message: toErrorMessage(error) };
  }
}

export function checkForAppUpdate(): Promise<UpdateCheckResult> {
  if (!isTauriRuntime()) return Promise.resolve({ status: 'unsupported' });
  if (pendingUpdateCheck) return pendingUpdateCheck;
  pendingUpdateCheck = performUpdateCheck().finally(() => {
    pendingUpdateCheck = null;
  });
  return pendingUpdateCheck;
}

export async function downloadAppUpdate(
  update: Update,
  onProgress?: (progress: UpdateProgress) => void,
): Promise<void> {
  let downloadedBytes = 0;
  let totalBytes: number | undefined;

  await update.download((event: DownloadEvent) => {
    if (event.event === 'Started') {
      downloadedBytes = 0;
      totalBytes = event.data.contentLength;
      onProgress?.({ status: 'downloading', downloadedBytes, totalBytes, percent: 0 });
      return;
    }

    if (event.event === 'Progress') {
      downloadedBytes += event.data.chunkLength;
      const percent = totalBytes ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : undefined;
      onProgress?.({ status: 'downloading', downloadedBytes, totalBytes, percent });
      return;
    }

    onProgress?.({ status: 'ready', downloadedBytes, totalBytes, percent: 100 });
  });
}

export async function installDownloadedAppUpdate(
  update: Update,
  onProgress?: (progress: UpdateProgress) => void,
): Promise<void> {
  onProgress?.({ status: 'installing', downloadedBytes: 0, percent: 100 });
  await update.install();
  onProgress?.({ status: 'relaunching', downloadedBytes: 0, percent: 100 });
  const { relaunch } = await import('@tauri-apps/plugin-process');
  await relaunch();
}

export async function installAppUpdate(
  update: Update,
  onProgress?: (progress: UpdateProgress) => void,
): Promise<void> {
  await downloadAppUpdate(update, onProgress);
  await installDownloadedAppUpdate(update, onProgress);
}
