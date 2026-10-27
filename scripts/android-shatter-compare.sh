#!/usr/bin/env bash
set -euo pipefail
mkdir -p smoke-out/compare
adb logcat -c
adb shell am start -W -a android.intent.action.VIEW -d 'nativelet-showcase:///shatter-compare' com.anonymous.nativeletshowcase
for i in $(seq 1 240); do
  sleep 5
  adb logcat -d > smoke-out/compare/logcat.txt
  if grep -q 'SHATTER_COMPARE_DONE\|SHATTER_COMPARE_ERROR' smoke-out/compare/logcat.txt; then break; fi
done
python3 scripts/check-shatter-compare.py smoke-out/compare/logcat.txt
