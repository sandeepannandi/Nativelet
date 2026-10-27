#!/usr/bin/env bash
set -euo pipefail
OUT=smoke-out/ui-profile; mkdir -p "$OUT"
PKG=com.anonymous.nativeletshowcase
adb root
adb wait-for-device
adb shell id | tee "$OUT/adb-id.txt"
grep -q 'uid=0' "$OUT/adb-id.txt" || { echo 'BLOCKER adb root unavailable'; exit 1; }
adb shell am force-stop "$PKG"
adb logcat -c
adb shell am start -W -a android.intent.action.VIEW -d 'nativelet-showcase:///shatter' "$PKG"
sleep 12
bash scripts/android-system-ready.sh
adb exec-out screencap -p > "$OUT/before.png"
SIZE=$(adb shell wm size | grep -o '[0-9]*x[0-9]*' | tail -1); W=${SIZE%x*}; H=${SIZE#*x}
adb shell input tap "$((W/2))" "$((H/2-H/20))"
# One controlled fracture, bounded 90-second completion wait.
for i in $(seq 1 30); do
  sleep 3
  adb logcat -d > "$OUT/logcat.txt"
  grep -q 'SHATTER_PROFILE saved=\|SHATTER_PROFILE error-' "$OUT/logcat.txt" && break
done
adb exec-out screencap -p > "$OUT/after.png"
grep 'SHATTER_PROFILE\|SHATTER_UI\|SHATTER_BENCH' "$OUT/logcat.txt" | tee "$OUT/summary.txt" || true
REMOTE=$(sed -n 's/.*SHATTER_PROFILE saved=\([^[:space:]]*\).*/\1/p' "$OUT/logcat.txt" | tail -1 | tr -d '\r')
[ -n "$REMOTE" ] || { echo 'BLOCKER no saved profile path'; exit 1; }
adb pull "$REMOTE" "$OUT/ui.cpuprofile"
python3 - "$OUT/ui.cpuprofile" <<'PY'
import json,sys,os
p=sys.argv[1]; d=json.load(open(p)); print('PROFILE_BYTES',os.path.getsize(p)); print('PROFILE_KEYS',list(d)); print('PROFILE_SAMPLES',len(d.get('samples',[])))
if not d.get('samples'):raise SystemExit('BLOCKER empty sampled trace')
PY
