#!/usr/bin/env bash
# Gyroscope runtime diagnostic + fail-closed telemetry assertions.
# Collects frame production and UiAutomation availability evidence on the
# same AOSP runtime as the component suite, streams test-only '[gyro-test]'
# sim-state telemetry (showcase launched with ?telemetry=1) and verifies it
# against an independent model port (scripts/gyro-telemetry-verify.py):
# missing or inconsistent evidence FAILS the script. The script changes
# nothing about rendering, physics or gates.
set -u
OUT=smoke-out/gyro-diagnostics; mkdir -p "$OUT"
PKG=com.anonymous.nativeletshowcase
adb shell am force-stop "$PKG"; adb logcat -c
adb shell am start -W -a android.intent.action.VIEW -d 'nativelet-showcase:///gyroscope?telemetry=1' "$PKG" > "$OUT/start.txt" 2>&1
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
# --- Interaction capture stage (diagnostic only; NOT an assertion path) ---
# Purpose: collect real before/after pixels of the control row (including the
# selected '¼ speed' state) plus gestures, so test design can be grounded on
# actual rendered pixels. No capture outcome is a pass/fail signal. Seeded
# bounds come from run-279's one valid hierarchy on pixel_6 1080x2400 AVD
# (canvas [120,469][960,1467]; Flick [203,1533][352,1577]; Drag [441,1533]
# [605,1577]; Slow [695,1533][877,1577]; Reset [497,1670][582,1714]) and are
# only used after fail-closed guards confirm screen size, focused app and
# visible four-label content.
CAP="$OUT/interaction"; mkdir -p "$CAP"
GUARD="$CAP/guards.txt"; : > "$GUARD"
guard_fail=""
WM_SIZE=$(adb shell wm size < /dev/null 2>/dev/null | tr -d '\r')
echo "wm_size=$WM_SIZE" >> "$GUARD"
echo "$WM_SIZE" | grep -q 'Physical size: 1080x2400' || guard_fail="${guard_fail}wm_size "
FG=$(adb shell dumpsys activity activities < /dev/null 2>/dev/null | grep -E 'mResumedActivity|topResumedActivity' | head -2 | tr -d '\r')
echo "foreground=$FG" >> "$GUARD"
echo "$FG" | grep -q "$PKG" || guard_fail="${guard_fail}foreground "
if ! command -v tesseract > /dev/null 2>&1; then
  guard_fail="${guard_fail}tesseract_absent "
  echo "tesseract=absent" >> "$GUARD"
else
  tesseract --version 2>/dev/null | head -1 | sed 's/^/tesseract=/' >> "$GUARD"
  adb exec-out screencap -p < /dev/null > "$CAP/guard-screen.png" 2> "$CAP/guard-screen.err" || true
  tesseract "$CAP/guard-screen.png" stdout --psm 11 -l eng tsv 2>/dev/null > "$CAP/guard-screen.tsv" || true
  python3 - "$CAP/guard-screen.tsv" >> "$GUARD" 2>&1 <<'PY' || guard_fail="${guard_fail}labels "
import sys, csv
# Seeded label anchor rects (x0,y0,x1,y1) from run-279 hierarchy; tolerance 60px.
anchors = {'Flick rotor': (203,1533), 'Drag frame': (441,1533),
           'Slow motion': (695,1533), 'Reset': (497,1670)}
words = []
try:
    for r in csv.DictReader(open(sys.argv[1], encoding='utf-8'), delimiter='\t'):
        t = (r.get('text') or '').strip()
        if t:
            words.append((t, int(r['left']), int(r['top']), int(r['width'])))
except Exception as e:
    print('label_guard=parse_error %s' % e); raise SystemExit(1)
TOL = 60
missing = []
for label, (ax, ay) in anchors.items():
    parts = label.split(' ')
    hit = None
    for i, (t, x, y, w) in enumerate(words):
        if t != parts[0] or abs(x-ax) > TOL or abs(y-ay) > TOL+15:
            continue
        if len(parts) == 1:
            hit = (t, x, y); break
        for t2, x2, y2, w2 in words:
            if t2 == parts[1] and abs(y2-y) <= 10 and 0 <= x2-(x+w) <= 30:
                hit = (t+' '+t2, x, y); break
        if hit: break
    if hit: print('label_found exact="%s" at=%s,%s' % (label, hit[1], hit[2]))
    else: missing.append(label)
if missing:
    print('label_guard=missing %s' % ','.join(missing)); raise SystemExit(1)
print('label_guard=all_four_exact')
PY
fi
if [ -n "$guard_fail" ]; then
  echo "interaction_capture=skipped guard_fail=$guard_fail" | tee -a "$OUT/dump-timeline.txt"
else
  echo "interaction_capture=starting" | tee -a "$OUT/dump-timeline.txt"
  adb shell dumpsys gfxinfo "$PKG" reset < /dev/null > /dev/null 2>&1 || true
  capshot(){ adb exec-out screencap -p < /dev/null > "$CAP/$1.png" 2> "$CAP/$1.err" || true; }
  # Slow-motion toggle: the selected-state ('¼ speed') pixel evidence.
  capshot slow_before
  adb shell input tap 786 1555 < /dev/null
  sleep 10; capshot slow_after  # allow several 2.7s software frames to composite the toggle
  # One bounded hierarchy attempt right after the toggle: retain exact-text
  # evidence if UiAutomation happens to answer (rm-first, content-classified).
  adb shell rm -f /sdcard/diag-slow.xml < /dev/null > /dev/null 2>&1 || true
  timeout 30 adb shell uiautomator dump /sdcard/diag-slow.xml < /dev/null > "$CAP/slow_after.dump.txt" 2>&1 || true
  if grep -q 'UI hierchary dumped to:' "$CAP/slow_after.dump.txt"; then
    adb pull /sdcard/diag-slow.xml "$CAP/slow_after.root.xml" < /dev/null > /dev/null 2>&1 || true
  fi
  tesseract "$CAP/slow_after.png" stdout --psm 11 -l eng tsv 2>/dev/null > "$CAP/slow_after.tsv" || true
  # Flick gesture on canvas center (mirrors validation script geometry).
  capshot flick_before
  adb shell input swipe 610 968 470 968 160 < /dev/null
  sleep 6; capshot flick_after
  # Drag-frame mode + drag gesture.
  adb shell input tap 523 1555 < /dev/null
  sleep 4; capshot drag_mode
  adb shell input swipe 475 928 605 1008 2400 < /dev/null
  sleep 6; capshot drag_after
  # Reset back to defaults.
  adb shell input tap 539 1692 < /dev/null
  sleep 6; capshot reset_after
  adb shell pidof "$PKG" < /dev/null > "$CAP/pid.txt" 2>&1 || true
  for f in slow_before slow_after flick_before flick_after drag_mode drag_after reset_after; do
    [ -s "$CAP/$f.png" ] && echo "capture_file=$f.png bytes=$(stat -c%s "$CAP/$f.png")"
  done | tee -a "$OUT/dump-timeline.txt"
  echo "interaction_capture=captured (diagnostic evidence only; no assertion evaluated)" | tee -a "$OUT/dump-timeline.txt"
fi

# Frame production and contention evidence after the sample window.
adb shell dumpsys gfxinfo "$PKG" framestats < /dev/null > "$OUT/gfxinfo-framestats.txt" 2>&1 || true
adb shell dumpsys gfxinfo "$PKG" < /dev/null > "$OUT/gfxinfo-summary.txt" 2>&1 || true
adb shell dumpsys SurfaceFlinger --latency < /dev/null > "$OUT/surfaceflinger-latency.txt" 2>&1 || true
adb shell dumpsys cpuinfo < /dev/null > "$OUT/cpuinfo.txt" 2>&1 || true
adb logcat -d < /dev/null > "$OUT/logcat.txt" 2>&1 || true

# --- Reduced-motion freeze leg + fail-closed telemetry assertions ---
# Relaunch with reducedMotion pinned: the worklet must not step the sim at
# all, so snapshots must show an exactly frozen state. The verifier
# recomputes every normal-leg snapshot from an independent port of the
# documented model and fails closed on any mismatch or missing evidence.
VERIFY_RC=0
if grep -q 'interaction_capture=captured' "$OUT/dump-timeline.txt"; then
  adb shell log -p i -t gyrotest 'LEG-RM-BEGIN' < /dev/null 2>/dev/null || true
  adb shell am force-stop "$PKG" < /dev/null 2>/dev/null
  adb shell am start -W -a android.intent.action.VIEW -d 'nativelet-showcase:///gyroscope?telemetry=1&reducedMotion=1' "$PKG" > "$CAP/rm-start.txt" 2>&1
  sleep 25
  adb logcat -d < /dev/null > "$CAP/logcat-telemetry.txt" 2>&1 || true
  python3 "$(dirname "$0")/gyro-telemetry-verify.py" "$CAP/logcat-telemetry.txt" > "$CAP/verify.txt" 2>&1 || VERIFY_RC=$?
  grep -E '^ASSERT|^VERIFY' "$CAP/verify.txt" | tee -a "$OUT/dump-timeline.txt"
  echo "telemetry_asserts=$([ "$VERIFY_RC" -eq 0 ] && echo PASS || echo FAIL) rc=$VERIFY_RC" | tee -a "$OUT/dump-timeline.txt"
else
  echo "telemetry_asserts=skipped (interaction stage did not run)" | tee -a "$OUT/dump-timeline.txt"
fi

{
  echo 'MEASUREMENT ONLY. No component validation, clearance or readiness claim.'
  echo "davey_events=$(grep -c 'Davey!' "$OUT/logcat.txt" 2>/dev/null || echo 0)"
  echo "skipped_frame_events=$(grep -c 'Skipped [0-9]* frames' "$OUT/logcat.txt" 2>/dev/null || echo 0)"
  echo "anr_or_fatal=$(grep -cE 'ANR in |FATAL EXCEPTION:' "$OUT/logcat.txt" 2>/dev/null || echo 0)"
  echo "dump_successes=$(grep -c 'dump_result=ok' "$OUT/dump-timeline.txt" 2>/dev/null || echo 0)"
  echo "dump_null_root_failures=$(grep -c 'dump_result=null_root' "$OUT/dump-timeline.txt" 2>/dev/null || echo 0)"
  echo "dump_timeouts=$(grep -c 'dump_result=timeout' "$OUT/dump-timeline.txt" 2>/dev/null || echo 0)"
  echo "dump_attempts=6"
  echo "interaction_capture=$(grep -m1 -o 'interaction_capture=captured\|interaction_capture=skipped' "$OUT/dump-timeline.txt" 2>/dev/null || echo not_run)"
  echo "telemetry_asserts=$(grep -m1 -o 'telemetry_asserts=[A-Za-z]*' "$OUT/dump-timeline.txt" 2>/dev/null || echo not_run)"
} | tee "$OUT/summary.txt"
exit "${VERIFY_RC:-0}"
