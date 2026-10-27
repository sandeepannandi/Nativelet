#!/usr/bin/env bash
# Local proposal only. Run only after separate review/approval on an installed
# retained diagnostic APK. No install/build/network/token/profiling in this file.
set -euo pipefail
OUT=${1:?output directory required}; mkdir -p "$OUT"
PKG=com.anonymous.nativeletshowcase
adb shell command -v screenrecord >/dev/null
PID=$(adb shell pidof "$PKG" | tr -d '\r'); [[ "$PID" =~ ^[0-9]+$ ]]
printf '%s\n' "$PID" > "$OUT/pid-before.txt"
adb shell dumpsys window > "$OUT/focus.txt"
grep 'mCurrentFocus=' "$OUT/focus.txt" | grep -q "$PKG"
adb exec-out screencap -p > "$OUT/initial.png"
python3 scripts/shatter-trace-match.py target "$OUT/initial.png" > "$OUT/target.json"
python3 scripts/shatter-trace-match.py intact "$OUT/initial.png" > "$OUT/intact-template.json"
read HX HY RX RY < <(python3 -c 'import json,sys;j=json.load(open(sys.argv[1]));print(*j["hit"],*j["reset"])' "$OUT/target.json")
# One continuous video. Use original device resolution for final pixel review.
# 50s finite limit covers both complete 15s waits plus reset and capture overhead.
timeout --signal=TERM --kill-after=5s 60s adb shell screenrecord --time-limit 50 --bit-rate 6000000 /sdcard/shatter-observe.mp4 > "$OUT/record-log.txt" 2>&1 &
REC=$!
trap 'kill "$REC" 2>/dev/null || true' EXIT
sleep 2; kill -0 "$REC"
adb shell cat /proc/uptime > "$OUT/first-input-before.txt"
adb shell input tap "$HX" "$HY"
adb shell cat /proc/uptime > "$OUT/first-input-after.txt"
sleep 15
adb exec-out screencap -p > "$OUT/first-after.png"
adb shell cat /proc/uptime > "$OUT/reset-before.txt"
adb shell input tap "$RX" "$RY"
sleep 2
adb exec-out screencap -p > "$OUT/reset-after.png"
adb shell cat /proc/uptime > "$OUT/second-input-before.txt"
adb shell input tap "$HX" "$HY"
adb shell cat /proc/uptime > "$OUT/second-input-after.txt"
sleep 15
adb exec-out screencap -p > "$OUT/second-after.png"
wait "$REC"; trap - EXIT
adb pull /sdcard/shatter-observe.mp4 "$OUT/behavior.mp4"
adb shell pidof "$PKG" | tr -d '\r' > "$OUT/pid-after.txt"
[ "$(cat "$OUT/pid-after.txt")" = "$PID" ]
adb logcat -d > "$OUT/logcat.txt"
# No pass is emitted here. Decode the entire video for corrupt/missing frames,
# inspect the actual time sequence, then assign explicit per-cycle outcomes.
printf '%s\n' 'RECORDED ONLY: manual full-video behavior review required; no performance result.'
