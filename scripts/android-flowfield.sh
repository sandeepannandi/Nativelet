#!/usr/bin/env bash
# Flow Field behavior evidence: the current animates on its own, a stir
# injects visible energy, and the flow keeps moving after release.
set -u
OUT=smoke-out/flowfield; mkdir -p "$OUT"
# Resolve the showcase package from the built APK (deterministic). A plain
# `pm list packages | grep nativelet` is not safe here: the timeline suite
# installs dev.nativelet.pinch.test, and head -1 can pick the wrong app.
PKG=com.anonymous.nativeletshowcase
APK=$(ls apps/showcase/android/app/build/outputs/apk/*/app-*.apk 2>/dev/null | head -1)
if [ -n "$APK" ] && command -v aapt >/dev/null 2>&1; then
  DETECTED=$(grep -o "package name=.[a-zA-Z0-9._]*" <<<"$(aapt dump badging "$APK" 2>/dev/null)" | head -1 | cut -d"'" -f2)
  [ -n "$DETECTED" ] && PKG=$DETECTED
fi
open() {
  adb shell am force-stop "$PKG"; adb logcat -c
  adb shell am start -W -a android.intent.action.VIEW -d "nativelet-showcase:///$1" "$PKG" >/dev/null 2>&1
  sleep 6
  # Retry once if the deep link did not bring the app to the foreground.
  adb shell dumpsys window 2>/dev/null | grep -q "mCurrentFocus.*$PKG" || {
    adb shell am start -W -a android.intent.action.VIEW -d "nativelet-showcase:///$1" "$PKG" >/dev/null 2>&1
    sleep 4
  }
  sleep 2
}
shot() { adb exec-out screencap -p > "$OUT/$1.png"; }
report() {
  A=$(md5sum < "$OUT/$2.png" | cut -c1-8); B=$(md5sum < "$OUT/$3.png" | cut -c1-8)
  CR=no; adb logcat -d | grep -E "Process: $PKG|Process $PKG .*has died|ANR in $PKG" | grep -q . && CR=yes
  [ "$CR" = yes ] && adb logcat -d > "$OUT/$1.crash.logcat.txt"
  echo "$1 crash=$CR changed=$([ "$A" != "$B" ] && echo yes || echo no)" | tee -a "$OUT/summary.txt"
}

open flowfield; sleep 2; shot flow-a
# The ambient current should be visibly moving on its own.
sleep 4; shot flow-b
report flowfield-animates flow-a flow-b
# Drag across the card: the paddle stirs swirls and comets.
adb shell input swipe 60 700 480 760 1400 &
sleep 0.7; shot flow-stir-1
sleep 0.8; shot flow-stir-2
wait
report flowfield-stir flow-stir-1 flow-stir-2
report flowfield-stirred flow-a flow-stir-2
# Release: the flow heals back toward ambient but never freezes.
sleep 6; shot flow-healed
report flowfield-heals flow-stir-2 flow-healed
adb logcat -d > "$OUT/flowfield-session.logcat.txt"
CR=no; grep -E "Process: $PKG|Process $PKG .*has died|ANR in $PKG" "$OUT/flowfield-session.logcat.txt" | grep -q . && CR=yes
echo "flowfield-session crash=$CR" | tee -a "$OUT/summary.txt"
