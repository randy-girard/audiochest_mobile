import fs from 'fs';
import path from 'path';
import {
  APP_VERSION_CODE,
  APP_VERSION_NAME,
  GITHUB_REPOSITORY,
  checkForAppUpdate,
  compareVersions,
  isNewerRelease,
  parseRelease,
  readAutoUpdate,
  releasesUrl,
  shouldOfferUpdate,
  updateIdentity,
  writeAutoUpdate,
  writeDismissedUpdate,
} from './appUpdates';

const release = {
  tag_name: 'v1.2.0',
  body: 'versionCode: 4\nversionName: 1.2.0\n\nAndroid release.',
  html_url: 'https://github.com/randy-girard/AudioChestApp/releases/tag/v1.2.0',
  assets: [
    { name: 'notes.txt', browser_download_url: 'https://github.com/example/notes.txt' },
    { name: 'AudioChest.apk', browser_download_url: 'https://github.com/randy-girard/AudioChestApp/releases/download/v1.2.0/AudioChest.apk' },
  ],
};

describe('app updates', () => {
  it('keeps the published version aligned with the android project', () => {
    const gradle = fs.readFileSync(path.join(__dirname, '../android/app/build.gradle'), 'utf8');
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
    expect(gradle).toContain(`versionName "${APP_VERSION_NAME}"`);
    expect(gradle).toContain(`versionCode ${APP_VERSION_CODE}`);
    expect(pkg.version).toBe(APP_VERSION_NAME);
    expect(releasesUrl()).toBe(`https://api.github.com/repos/${GITHUB_REPOSITORY}/releases/latest`);
  });

  it('reads the release apk and version from GitHub', () => {
    const parsed = parseRelease(release);
    expect(parsed).toMatchObject({
      tag: 'v1.2.0',
      versionName: '1.2.0',
      versionCode: 4,
      apkUrl: 'https://github.com/randy-girard/AudioChestApp/releases/download/v1.2.0/AudioChest.apk',
    });
    expect(updateIdentity(parsed!)).toBe('4');
  });

  it('reads the version hidden under a changelog', () => {
    const parsed = parseRelease({
      tag_name: 'v1.4.0',
      body: [
        '## AudioChest 1.4.0',
        '',
        '- Add a short changelog to each GitHub release.',
        '',
        '<!--',
        'versionName: 1.4.0',
        'versionCode: 9',
        '-->',
      ].join('\n'),
      assets: [{ name: 'AudioChest.apk', browser_download_url: 'https://github.com/randy-girard/audiochest_mobile/releases/download/v1.4.0/AudioChest.apk' }],
    });
    expect(parsed).toMatchObject({ versionName: '1.4.0', versionCode: 9 });
  });

  it('falls back to the tag when the notes omit the version', () => {
    const parsed = parseRelease({
      tag_name: 'v1.3.0',
      assets: [{ name: 'AudioChest-release.apk', browser_download_url: 'https://github.com/example/app.apk' }],
    });
    expect(parsed?.versionName).toBe('1.3.0');
    expect(parsed?.versionCode).toBe(0);
    expect(updateIdentity(parsed!)).toBe('1.3.0');
  });

  it('ignores a release that has no apk', () => {
    expect(parseRelease({ tag_name: 'v1.2.0', assets: [{ name: 'readme.txt', browser_download_url: 'https://example.com/readme.txt' }] })).toBeNull();
    expect(parseRelease(null)).toBeNull();
  });

  it('compares installed and published versions', () => {
    const remote = parseRelease(release)!;
    expect(isNewerRelease({ versionName: '1.1.1', versionCode: 3 }, remote)).toBe(true);
    expect(isNewerRelease({ versionName: '1.2.0', versionCode: 4 }, remote)).toBe(false);
    expect(isNewerRelease({ versionName: '1.3.0', versionCode: 5 }, remote)).toBe(false);
    expect(compareVersions('1.2.0', '1.1.1')).toBeGreaterThan(0);
    expect(compareVersions('1.1.1', '1.1.1')).toBe(0);
    const named = parseRelease({
      tag_name: 'v1.2.0',
      assets: [{ name: 'AudioChest.apk', browser_download_url: 'https://github.com/example/app.apk' }],
    })!;
    expect(isNewerRelease({ versionName: '1.1.1', versionCode: 0 }, named)).toBe(true);
    expect(isNewerRelease({ versionName: '1.2.0', versionCode: 0 }, named)).toBe(false);
  });

  it('offers an automatic update once per release and always offers a manual check', () => {
    expect(shouldOfferUpdate({
      manual: false,
      autoCheck: true,
      newer: true,
      identity: '4',
      dismissed: '',
    })).toBe(true);
    expect(shouldOfferUpdate({
      manual: false,
      autoCheck: true,
      newer: true,
      identity: '4',
      dismissed: '4',
    })).toBe(false);
    expect(shouldOfferUpdate({
      manual: true,
      autoCheck: false,
      newer: true,
      identity: '4',
      dismissed: '4',
    })).toBe(true);
    expect(shouldOfferUpdate({
      manual: true,
      autoCheck: true,
      newer: false,
      identity: '4',
      dismissed: '',
    })).toBe(false);
  });

  it('stores the automatic check preference', () => {
    const storage = new Map<string, string>();
    const memory = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
    };
    expect(readAutoUpdate(memory)).toBe(true);
    writeAutoUpdate(memory, false);
    expect(readAutoUpdate(memory)).toBe(false);
    writeDismissedUpdate(memory, '4');
    expect(storage.get('audiochest.dismissedUpdate')).toBe('4');
  });

  it('reports a newer public release and a missing release', async () => {
    const found = await checkForAppUpdate({
      manual: true,
      local: { versionName: '1.1.1', versionCode: 3 },
      autoCheck: true,
      dismissed: '',
      fetchImpl: (async () => ({
        ok: true,
        status: 200,
        json: async () => release,
      })) as unknown as typeof fetch,
    });
    expect(found.newer).toBe(true);
    expect(found.offer).toBe(true);
    expect(found.remote?.apkUrl).toContain('AudioChest.apk');

    const missing = await checkForAppUpdate({
      manual: true,
      local: { versionName: '1.1.1', versionCode: 3 },
      autoCheck: true,
      dismissed: '',
      fetchImpl: (async () => ({
        ok: false,
        status: 404,
        json: async () => ({}),
      })) as unknown as typeof fetch,
    });
    expect(missing.newer).toBe(false);
    expect(missing.error).toMatch(/public/i);
  });
});
