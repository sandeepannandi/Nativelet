#!/usr/bin/env bash
# Measurement-only Gyroscope runtime diagnostic. NOT a validation run.
# Collects frame production and UiAutomation availability evidence on the
# same AOSP runtime as the component suite. No assertions are weakened or
# replaced: this script changes nothing about rendering, physics or gates,
# and its output must not be cited as component clearance.
set -u
OUT=smoke-out/gyro-diagnostics; mkdir -p "$OUT"
PKG=com.anonymous.nativeletshowcase
adb shell am force-stop "$PKG"; adb logcat -c
adb shell am start -W -a android.intent.action.VIEW -d 'nativelet-showcase:///gyroscope' "$PKG" > "$OUT/start.txt" 2>&1
STARTED=$SECONDS
sample(){
  local n="$1"
  local dir="$OUT/sample-$n"; mkdir -p "$dir"
  local t0=$SECONDS
  adb exec-out screencap -p < /dev/null > "$dir/screen.png" 2> "$dir/screen.err" || true
  # Bounded long-timeout dump: run275 used 12s and always saw null root.
  # run279: uiautomator exits 0 even on "ERROR: null root node", and a failed
  # dump leaves the PREVIOUS sample's file on /sdcard, so rc==0 + pull
  # produced stale byte-identical root.xml scored as successes. Fix: remove
  # the remote file first, then require the success marker in dump.txt.
  adb shell rm -f /sdcard/diag-root.xml < /dev/null 2>/dev/null || true
  timeout 30 adb shell uiautomator dump /sdcard/diag-root.xml < /dev/null > "$dir/dump.txt" 2>&1
  local dump_rc=$?
  local dump_ms=$(( (SECONDS - t0) * 1000 ))
  local dump_result=error
  if [ "$dump_rc" -eq 124 ]; then
    dump_result=timeout
  elif grep -q 'null root node' "$dir/dump.txt"; then
    dump_result=null_root
  elif [ "$dump_rc" -eq 0 ] && grep -q 'UI hierchary dumped to:' "$dir/dump.txt"; then
    dump_result=ok
  fi
  if [ "$dump_result" = ok ]; then
    adb pull /sdcard/diag-root.xml "$dir/root.xml" < /dev/null > "$dir/pull.txt" 2>&1 || true
    python3 - "$dir/root.xml" > "$dir/root-check.txt" 2>&1 <<'PY'
import sys,xml.etree.ElementTree as E
try:
 r=E.parse(sys.argv[1]).getroot()
 n=list(r.iter('node'))
 print('valid hierarchy nodes=%d' % len(n) if n else 'EMPTY hierarchy')
except Exception as e:
 print('invalid hierarchy: %s' % e)
PY
  fi
  local root_sha=none
  [ -s "$dir/root.xml" ] && root_sha=$(sha256sum "$dir/root.xml" | cut -c1-16)
  printf 'sample=%s elapsed_s=%s dump_rc=%s dump_result=%s root_sha=%s dump_wall_ms=%s\n' "$n" "$((SECONDS-STARTED))" "$dump_rc" "$dump_result" "$root_sha" "$dump_ms" | tee -a "$OUT/dump-timeline.txt"
  adb shell dumpsys activity activities < /dev/null 2>/dev/null | grep -E 'mResumedActivity|topResumedActivity' | head -4 > "$dir/foreground.txt" || true
}
for n in 1 2 3 4 5 6; do
  sample "$n"
  [ "$n" -lt 6 ] && sleep 15
done
# Frame production and contention evidence after the sample window.
adb shell dumpsys gfxinfo "$PKG" framestats < /dev/null > "$OUT/gfxinfo-framestats.txt" 2>&1 || true
adb shell dumpsys gfxinfo "$PKG" < /dev/null > "$OUT/gfxinfo-summary.txt" 2>&1 || true
adb shell dumpsys SurfaceFlinger --latency < /dev/null > "$OUT/surfaceflinger-latency.txt" 2>&1 || true
adb shell dumpsys cpuinfo < /dev/null > "$OUT/cpuinfo.txt" 2>&1 || true
adb logcat -d < /dev/null > "$OUT/logcat.txt" 2>&1 || true
{
  echo 'MEASUREMENT ONLY. No component validation, clearance or readiness claim.'
  echo "davey_events=$(grep -c 'Davey!' "$OUT/logcat.txt" 2>/dev/null || echo 0)"
  echo "skipped_frame_events=$(grep -c 'Skipped [0-9]* frames' "$OUT/logcat.txt" 2>/dev/null || echo 0)"
  echo "anr_or_fatal=$(grep -cE 'ANR in |FATAL EXCEPTION:' "$OUT/logcat.txt" 2>/dev/null || echo 0)"
  echo "dump_successes=$(grep -c 'dump_result=ok' "$OUT/dump-timeline.txt" 2>/dev/null || echo 0)"
  echo "dump_null_root_failures=$(grep -c 'dump_result=null_root' "$OUT/dump-timeline.txt" 2>/dev/null || echo 0)"
  echo "dump_timeouts=$(grep -c 'dump_result=timeout' "$OUT/dump-timeline.txt" 2>/dev/null || echo 0)"
  echo "dump_attempts=6"
} | tee "$OUT/summary.txt"
exit 0
