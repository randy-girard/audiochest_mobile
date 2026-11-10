import { Capacitor, Plugins } from '@capacitor/core';

export const GITHUB_REPOSITORY = 'randy-girard/audiochest_mobile';
export const APP_VERSION_NAME = '1.1.1';
export const APP_VERSION_CODE = 3;
export const AUTO_UPDATE_KEY = 'audiochest.autoUpdate';
export const DISMISSED_UPDATE_KEY = 'audiochest.dismissedUpdate';

export interface InstalledVersion {
  versionName: string;
  versionCode: number;
}

export interface RemoteRelease {
  tag: string;
  versionName: string;
  versionCode: number;
  apkUrl: string;
  notes: string;
  pageUrl: string;
}

export interface UpdateCheck {
  local: InstalledVersion;
  remote: RemoteRelease | null;
  newer: boolean;
  offer: boolean;
  error: string;
}

interface ReleaseAsset {
  name?: string;
  browser_download_url?: string;
}

interface ReleasePayload {
  tag_name?: string;
  body?: string;
  html_url?: string;
  assets?: ReleaseAsset[];
}

interface AppUpdatePlugin {
  info: () => Promise<InstalledVersion>;
  installRelease: (options: { url: string }) => Promise<void>;
}

export function releasesUrl(repository = GITHUB_REPOSITORY): string {
  return `https://api.github.com/repos/${repository}/releases/latest`;
}

export function compareVersions(left: string, right: string): number {
  const parse = (value: string) => value.split(/[.+-]/).map((part) => {
    const number = parseInt(part, 10);
    return Number.isFinite(number) ? number : 0;
  });
  const a = parse(left);
  const b = parse(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (a[index] || 0) - (b[index] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function updateIdentity(release: Pick<RemoteRelease, 'versionCode' | 'versionName'>): string {
  return release.versionCode > 0 ? String(release.versionCode) : release.versionName;
}

export function isNewerRelease(local: InstalledVersion, remote: RemoteRelease): boolean {
  if (remote.versionCode > 0 && local.versionCode > 0) return remote.versionCode > local.versionCode;
  return compareVersions(remote.versionName, local.versionName) > 0;
}

export function parseRelease(payload: unknown): RemoteRelease | null {
  if (!payload || typeof payload !== 'object') return null;
  const body = payload as ReleasePayload;
  const notes = String(body.body || '');
  const tag = String(body.tag_name || '');
  const assets = Array.isArray(body.assets) ? body.assets : [];
  const apk = assets.find((asset) => /\.apk$/i.test(asset.name || '') && /release/i.test(asset.name || ''))
    || assets.find((asset) => /\.apk$/i.test(asset.name || ''));
  if (!apk || !apk.browser_download_url) return null;
  const codeMatch = notes.match(/versionCode:\s*(\d+)/i);
  const nameMatch = notes.match(/versionName:\s*([0-9A-Za-z.+-]+)/i);
  return {
    tag,
    versionName: (nameMatch && nameMatch[1]) || tag.replace(/^v/i, '') || '0',
    versionCode: codeMatch ? Number(codeMatch[1]) : 0,
    apkUrl: apk.browser_download_url,
    notes,
    pageUrl: String(body.html_url || ''),
  };
}

export function readAutoUpdate(storage: Pick<Storage, 'getItem'>): boolean {
  const raw = storage.getItem(AUTO_UPDATE_KEY);
  if (raw == null) return true;
  return raw === '1';
}

export function writeAutoUpdate(storage: Pick<Storage, 'setItem'>, enabled: boolean): void {
  storage.setItem(AUTO_UPDATE_KEY, enabled ? '1' : '0');
}

export function readDismissedUpdate(storage: Pick<Storage, 'getItem'>): string {
  return storage.getItem(DISMISSED_UPDATE_KEY) || '';
}

export function writeDismissedUpdate(storage: Pick<Storage, 'setItem'>, identity: string): void {
  storage.setItem(DISMISSED_UPDATE_KEY, identity);
}

export function shouldOfferUpdate(input: {
  manual: boolean;
  autoCheck: boolean;
  newer: boolean;
  identity: string;
  dismissed: string;
}): boolean {
  if (!input.newer) return false;
  if (input.manual) return true;
  if (!input.autoCheck) return false;
  return input.dismissed !== input.identity;
}

export async function fetchLatestRelease(
  repository = GITHUB_REPOSITORY,
  fetchImpl: typeof fetch = fetch,
): Promise<RemoteRelease> {
  const response = await fetchImpl(releasesUrl(repository), {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (response.status === 404) {
    throw new Error('No public GitHub release was found. Publish a release that includes the APK, and make that repository public so the phone can download it.');
  }
  if (!response.ok) throw new Error(`GitHub returned ${response.status} while checking for updates.`);
  const release = parseRelease(await response.json());
  if (!release) throw new Error('The latest GitHub release does not include an APK.');
  return release;
}

export async function checkForAppUpdate(options: {
  manual: boolean;
  local: InstalledVersion;
  autoCheck: boolean;
  dismissed: string;
  repository?: string;
  fetchImpl?: typeof fetch;
}): Promise<UpdateCheck> {
  try {
    const remote = await fetchLatestRelease(options.repository, options.fetchImpl);
    const newer = isNewerRelease(options.local, remote);
    return {
      local: options.local,
      remote,
      newer,
      offer: shouldOfferUpdate({
        manual: options.manual,
        autoCheck: options.autoCheck,
        newer,
        identity: updateIdentity(remote),
        dismissed: options.dismissed,
      }),
      error: '',
    };
  } catch (error) {
    const message = error instanceof Error && error.message
      ? error.message
      : 'Could not check for updates.';
    return {
      local: options.local,
      remote: null,
      newer: false,
      offer: false,
      error: message,
    };
  }
}

function nativeUpdater(): AppUpdatePlugin | null {
  const plugins = Plugins as unknown as { AppUpdate?: AppUpdatePlugin };
  return plugins.AppUpdate || null;
}

export async function installedVersion(): Promise<InstalledVersion> {
  const plugin = nativeUpdater();
  if (Capacitor.getPlatform() !== 'android' || !plugin) {
    return { versionName: APP_VERSION_NAME, versionCode: APP_VERSION_CODE };
  }
  const info = await plugin.info();
  return {
    versionName: info.versionName || APP_VERSION_NAME,
    versionCode: Number(info.versionCode) || APP_VERSION_CODE,
  };
}

export async function installRelease(url: string): Promise<void> {
  const plugin = nativeUpdater();
  if (Capacitor.getPlatform() !== 'android' || !plugin) {
    throw new Error('Open the Android app to install the update.');
  }
  await plugin.installRelease({ url });
}
