#!/usr/bin/env bash
# Expose and validate the hosted runner's real Android SDK BEFORE emulator action.
# No device, SDK install, stub, guessed adb fallback, or softened preflight.
set -euo pipefail
OUT=smoke-out/host-preflight; mkdir -p "$OUT"
: "${ANDROID_HOME:?hosted Android SDK root required}"
[ -d "$ANDROID_HOME" ]
if [ -n "${ANDROID_SDK_ROOT:-}" ]; then [ "$(realpath "$ANDROID_SDK_ROOT")" = "$(realpath "$ANDROID_HOME")" ]; fi
ADB="$ANDROID_HOME/platform-tools/adb"
SDKMANAGER="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
[ -x "$ADB" ] || { echo 'BLOCKER actual SDK platform-tools adb absent'; exit 1; }
[ -x "$SDKMANAGER" ] || { echo 'BLOCKER actual SDK sdkmanager absent'; exit 1; }
command -v java >/dev/null
java -version 2> "$OUT/java-version.txt"
"$ADB" version > "$OUT/adb-version.txt"
"$SDKMANAGER" --version > "$OUT/sdkmanager-version.txt"
"$SDKMANAGER" --list_installed > "$OUT/sdk-installed.txt"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
[ "$(realpath "$(command -v adb)")" = "$(realpath "$ADB")" ]
printf '%s\n' "$ANDROID_HOME/platform-tools" "$ANDROID_HOME/cmdline-tools/latest/bin" >> "${GITHUB_PATH:?GitHub PATH file required}"
printf 'ANDROID_HOME=%s\nADB=%s\nSDKMANAGER=%s\n' "$ANDROID_HOME" "$ADB" "$SDKMANAGER" > "$OUT/sdk-paths.txt"
cat "$OUT/sdk-paths.txt" "$OUT/adb-version.txt" "$OUT/sdkmanager-version.txt"
