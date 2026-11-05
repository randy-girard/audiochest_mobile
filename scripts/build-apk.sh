#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE="${1:-debug}"
export JAVA_HOME="${JAVA_HOME:-$HOME/.local/jdk-17.0.21+9/Contents/Home}"
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}"
export ANDROID_HOME="$ANDROID_SDK_ROOT"
export PATH="$JAVA_HOME/bin:$PATH"

if [[ ! -d "$JAVA_HOME" ]]; then
  echo "JAVA_HOME not found at $JAVA_HOME"
  exit 1
fi

ensure_release_keystore() {
  local props="$ROOT/android/keystore.properties"
  local store="$ROOT/android/keystore/audiochest-release.jks"
  if [[ -f "$props" && -f "$store" ]]; then
    return
  fi
  mkdir -p "$ROOT/android/keystore"
  local password
  password="$(python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(18))
PY
)"
  keytool -genkeypair -v \
    -keystore "$store" \
    -alias audiochest \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -storepass "$password" \
    -keypass "$password" \
    -dname "CN=AudioChest, OU=AudioChest, O=AudioChest, L=Unknown, ST=Unknown, C=US"
  cat > "$props" <<EOF
storePassword=$password
keyPassword=$password
keyAlias=audiochest
storeFile=keystore/audiochest-release.jks
EOF
  echo "Created release keystore at android/keystore/audiochest-release.jks"
  echo "Back up that file and android/keystore.properties; you need them for app updates."
}

cd "$ROOT"
npm run build
npx cap sync android
node scripts/prepare-android.js
cd android

if [[ "$MODE" == "release" ]]; then
  ensure_release_keystore
  ./gradlew assembleRelease --no-daemon
  cp -f app/build/outputs/apk/release/app-release.apk "$ROOT/AudioChest-release.apk"
  ls -lh "$ROOT/AudioChest-release.apk"
  echo "APK ready: $ROOT/AudioChest-release.apk"
else
  ./gradlew assembleDebug --no-daemon
  cp -f app/build/outputs/apk/debug/app-debug.apk "$ROOT/AudioChest-debug.apk"
  ls -lh "$ROOT/AudioChest-debug.apk"
  echo "APK ready: $ROOT/AudioChest-debug.apk"
fi
