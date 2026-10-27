#!/usr/bin/env bash
# Diagnostic only: retains each failure, never waives the full smoke gate.
set -u
OUT=smoke-out/prism-diagnostic; mkdir -p "$OUT"
PKG=com.anonymous.nativeletshowcase
for round in 1 2 3 4 5; do
  adb shell am force-stop "$PKG"; adb logcat -c
  adb shell am start -W -a android.intent.action.VIEW -d nativelet-showcase:///prism "$PKG" > "$OUT/$round.start.txt" 2>&1
  sleep 8
  adb exec-out screencap -p > "$OUT/$round.png"
  adb logcat -d > "$OUT/$round.logcat.txt"
  ALIVE=$(adb shell pidof "$PKG" | tr -d '\r')
  CR=no; grep -Eq 'Fatal signal|FATAL EXCEPTION|ANR in' "$OUT/$round.logcat.txt" && CR=yes
  echo "prism-diagnostic round=$round alive=${ALIVE:-no} crash=$CR" | tee -a "$OUT/summary.txt"
done
