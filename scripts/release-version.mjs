import fs from 'fs';

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export function parseSemver(value) {
  const match = String(value || '').trim().replace(/^v/i, '').match(SEMVER);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function formatSemver(parts) {
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

export function compareSemver(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

export function bumpSemver(parts, level) {
  if (level === 'major') return [parts[0] + 1, 0, 0];
  if (level === 'minor') return [parts[0], parts[1] + 1, 0];
  return [parts[0], parts[1], parts[2] + 1];
}

export function readGradleVersion(text) {
  const name = text.match(/versionName\s+"([^"]+)"/);
  const code = text.match(/versionCode\s+(\d+)/);
  if (!name || !code) throw new Error('android/app/build.gradle is missing versionName or versionCode');
  return { versionName: name[1], versionCode: Number(code[1]) };
}

export function readReleaseBody(body) {
  const name = String(body || '').match(/versionName:\s*(\d+\.\d+\.\d+)/i);
  const code = String(body || '').match(/versionCode:\s*(\d+)/i);
  return {
    versionName: name ? name[1] : '',
    versionCode: code ? Number(code[1]) : 0,
  };
}

export function decideRelease({ gradle, latest, override = '', bumpLevel = 'patch', hasRelease = false, dispatch = false }) {
  const gradleVersion = parseSemver(gradle.versionName);
  if (!gradleVersion) throw new Error(`Current versionName ${gradle.versionName} is not major.minor.patch`);
  const overrideVersion = override ? parseSemver(override) : null;
  if (override && !overrideVersion) throw new Error(`Version override ${override} must look like 1.2.0`);

  if (!hasRelease && !overrideVersion && !dispatch) {
    return {
      versionName: formatSemver(gradleVersion),
      versionCode: gradle.versionCode,
      replace: false,
    };
  }

  const latestVersion = hasRelease ? (parseSemver(latest && latest.versionName) || gradleVersion) : gradleVersion;
  const latestCode = hasRelease && latest && latest.versionCode > 0 ? latest.versionCode : gradle.versionCode;

  if (overrideVersion) {
    if (hasRelease && compareSemver(overrideVersion, latestVersion) < 0) {
      throw new Error(`Version ${formatSemver(overrideVersion)} is older than published ${formatSemver(latestVersion)}`);
    }
    return {
      versionName: formatSemver(overrideVersion),
      versionCode: hasRelease ? latestCode + 1 : gradle.versionCode,
      replace: hasRelease && compareSemver(overrideVersion, latestVersion) === 0,
    };
  }

  const level = ['major', 'minor', 'patch'].includes(bumpLevel) ? bumpLevel : 'patch';
  return {
    versionName: formatSemver(bumpSemver(latestVersion, level)),
    versionCode: latestCode + 1,
    replace: false,
  };
}

export function applyGradle(text, versionName, versionCode) {
  if (!/versionCode\s+\d+/.test(text) || !/versionName\s+"[^"]+"/.test(text)) {
    throw new Error('Could not update the Android version');
  }
  return text
    .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
    .replace(/versionName\s+"[^"]+"/, `versionName "${versionName}"`);
}

export function applyPackageVersion(text, versionName) {
  if (!/"version":\s*"[^"]+"/.test(text)) throw new Error('package.json is missing version');
  return text.replace(/"version":\s*"[^"]+"/, `"version": "${versionName}"`);
}

export function applyAppVersion(text, versionName, versionCode) {
  if (!/export const APP_VERSION_NAME = '[^']+';/.test(text) || !/export const APP_VERSION_CODE = \d+;/.test(text)) {
    throw new Error('src/appUpdates.ts is missing the version constants');
  }
  return text
    .replace(/export const APP_VERSION_NAME = '[^']+';/, `export const APP_VERSION_NAME = '${versionName}';`)
    .replace(/export const APP_VERSION_CODE = \d+;/, `export const APP_VERSION_CODE = ${versionCode};`);
}

export function releaseNotes(versionName, versionCode) {
  return [
    `versionName: ${versionName}`,
    `versionCode: ${versionCode}`,
    '',
    'Android release of AudioChest.',
    'The phone app reads versionName and versionCode from this release to decide when an update is available.',
    '',
  ].join('\n');
}

function arg(args, name, fallback = '') {
  const index = args.indexOf(name);
  if (index < 0 || index + 1 >= args.length) return fallback;
  return args[index + 1];
}

function writeVersions(decision, gradlePath, packagePath, updatesPath, notesPath) {
  fs.writeFileSync(gradlePath, applyGradle(fs.readFileSync(gradlePath, 'utf8'), decision.versionName, decision.versionCode));
  fs.writeFileSync(packagePath, applyPackageVersion(fs.readFileSync(packagePath, 'utf8'), decision.versionName));
  fs.writeFileSync(updatesPath, applyAppVersion(fs.readFileSync(updatesPath, 'utf8'), decision.versionName, decision.versionCode));
  fs.writeFileSync(notesPath, releaseNotes(decision.versionName, decision.versionCode));
}

function main() {
  const args = process.argv.slice(2);
  const gradlePath = arg(args, '--gradle', 'android/app/build.gradle');
  const packagePath = arg(args, '--package', 'package.json');
  const updatesPath = arg(args, '--updates', 'src/appUpdates.ts');
  const notesPath = arg(args, '--notes', 'release-notes.md');
  const decisionPath = arg(args, '--apply-decision', '');
  if (decisionPath) {
    writeVersions(JSON.parse(fs.readFileSync(decisionPath, 'utf8')), gradlePath, packagePath, updatesPath, notesPath);
    return;
  }
  const gradle = readGradleVersion(fs.readFileSync(gradlePath, 'utf8'));
  const bodyFile = arg(args, '--latest-body-file', '');
  const body = bodyFile ? fs.readFileSync(bodyFile, 'utf8') : arg(args, '--latest-body', '');
  const parsed = readReleaseBody(body);
  const tag = arg(args, '--latest-tag', '').replace(/^v/i, '');
  const decision = decideRelease({
    gradle,
    latest: {
      versionName: parsed.versionName || tag,
      versionCode: parsed.versionCode,
    },
    override: arg(args, '--override', ''),
    bumpLevel: arg(args, '--bump', 'patch'),
    hasRelease: arg(args, '--has-release', 'false') === 'true',
    dispatch: arg(args, '--dispatch', 'false') === 'true',
  });
  if (args.includes('--write')) writeVersions(decision, gradlePath, packagePath, updatesPath, notesPath);
  process.stdout.write(`${JSON.stringify(decision)}\n`);
}

const invoked = process.argv[1] && process.argv[1].endsWith('release-version.mjs');
if (invoked) main();
