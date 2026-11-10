import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyAppVersion,
  applyGradle,
  applyPackageVersion,
  decideRelease,
  releaseNotes,
} from './release-version.mjs';

const gradle = { versionName: '1.1.1', versionCode: 3 };

test('the first automatic release uses the version already in the project', () => {
  assert.deepEqual(decideRelease({ gradle, hasRelease: false, dispatch: false }), {
    versionName: '1.1.1',
    versionCode: 3,
    replace: false,
  });
});

test('a later push bumps the patch and the Android version code', () => {
  assert.deepEqual(decideRelease({
    gradle,
    hasRelease: true,
    latest: { versionName: '1.1.1', versionCode: 3 },
  }), {
    versionName: '1.1.2',
    versionCode: 4,
    replace: false,
  });
});

test('a manual run can bump minor or major', () => {
  assert.equal(decideRelease({
    gradle,
    hasRelease: true,
    dispatch: true,
    bumpLevel: 'minor',
    latest: { versionName: '1.1.2', versionCode: 4 },
  }).versionName, '1.2.0');
  assert.equal(decideRelease({
    gradle,
    hasRelease: true,
    dispatch: true,
    bumpLevel: 'major',
    latest: { versionName: '1.2.0', versionCode: 5 },
  }).versionName, '2.0.0');
});

test('an override publishes that semantic version and can replace the same release', () => {
  assert.deepEqual(decideRelease({
    gradle,
    hasRelease: true,
    dispatch: true,
    override: '2.0.0',
    latest: { versionName: '1.1.1', versionCode: 3 },
  }), {
    versionName: '2.0.0',
    versionCode: 4,
    replace: false,
  });
  assert.deepEqual(decideRelease({
    gradle,
    hasRelease: true,
    dispatch: true,
    override: 'v1.1.1',
    latest: { versionName: '1.1.1', versionCode: 3 },
  }), {
    versionName: '1.1.1',
    versionCode: 4,
    replace: true,
  });
});

test('an older override is rejected', () => {
  assert.throws(() => decideRelease({
    gradle,
    hasRelease: true,
    override: '1.0.0',
    latest: { versionName: '1.1.1', versionCode: 3 },
  }), /older/);
  assert.throws(() => decideRelease({
    gradle,
    override: '1.2',
  }), /1\.2\.0/);
});

test('version edits and release notes keep the contract the app parses', () => {
  const notes = releaseNotes('1.4.0', 9);
  assert.match(notes, /^versionName: 1\.4\.0\nversionCode: 9\n/);
  assert.equal(
    applyGradle('versionCode 3\nversionName "1.1.1"\n', '1.4.0', 9),
    'versionCode 9\nversionName "1.4.0"\n',
  );
  assert.equal(applyPackageVersion('{\n  "version": "1.1.1"\n}\n', '1.4.0'), '{\n  "version": "1.4.0"\n}\n');
  assert.match(
    applyAppVersion("export const APP_VERSION_NAME = '1.1.1';\nexport const APP_VERSION_CODE = 3;\n", '1.4.0', 9),
    /APP_VERSION_NAME = '1\.4\.0';\nexport const APP_VERSION_CODE = 9;/,
  );
});
