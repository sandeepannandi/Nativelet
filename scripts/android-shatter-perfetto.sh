#!/usr/bin/env bash
set -euo pipefail
OUT=smoke-out/native-trace; mkdir -p "$OUT"
PKG=com.anonymous.nativeletshowcase
adb root; adb wait-for-device
adb shell id | tee "$OUT/adb-id.txt"; grep -q 'uid=0' "$OUT/adb-id.txt"
adb shell perfetto --query > "$OUT/perfetto-query.txt"
grep -q linux.perf "$OUT/perfetto-query.txt" || { echo 'BLOCKER linux.perf absent'; exit 1; }
grep -q linux.ftrace "$OUT/perfetto-query.txt" || { echo 'BLOCKER linux.ftrace absent'; exit 1; }
adb shell cat /sys/kernel/tracing/available_events > "$OUT/available-events.txt"
grep -q 'sched:sched_switch' "$OUT/available-events.txt" || { echo 'BLOCKER sched_switch absent'; exit 1; }
adb shell am force-stop "$PKG"; adb logcat -c
adb shell am start -W -a android.intent.action.VIEW -d 'nativelet-showcase:///shatter' "$PKG"
sleep 12; bash scripts/android-system-ready.sh
SIZE=$(adb shell wm size | grep -o '[0-9]*x[0-9]*' | tail -1); W=${SIZE%x*}; H=${SIZE#*x}
# Consume the APK's one-shot Hermes sample before the native capture.
adb shell input tap "$((W/2))" "$((H/2-H/20))"
for i in $(seq 1 30); do sleep 3; adb logcat -d > "$OUT/warmup-logcat.txt"; grep -q 'SHATTER_PROFILE saved=' "$OUT/warmup-logcat.txt" && break; done
grep -q 'SHATTER_PROFILE saved=' "$OUT/warmup-logcat.txt" || { echo 'BLOCKER warmup sampler not stopped'; exit 1; }
# Resolve Reset glass from the observed UI hierarchy, not guessed coordinates.
adb shell uiautomator dump /sdcard/shatter-reset.xml >/dev/null
adb pull /sdcard/shatter-reset.xml "$OUT/reset.xml"
read RX RY < <(python3 - "$OUT/reset.xml" <<'PY'
import sys,xml.etree.ElementTree as E,re
for e in E.parse(sys.argv[1]).iter('node'):
 if e.get('text')=='Reset glass' or e.get('content-desc')=='Reset glass':
  a=list(map(int,re.findall(r'\d+',e.get('bounds'))));print((a[0]+a[2])//2,(a[1]+a[3])//2);break
else:raise SystemExit('BLOCKER no reset element')
PY
)
[ -n "${RX:-}" ] || { echo 'BLOCKER reset unavailable'; exit 1; }
adb shell input tap "$RX" "$RY"; sleep 2
adb exec-out screencap -p > "$OUT/before.png"
PID=$(adb shell pidof "$PKG" | tr -d '\r'); [ -n "$PID" ]
adb shell cat /proc/"$PID"/maps > "$OUT/maps.txt"
adb shell ps -T -p "$PID" > "$OUT/threads.txt"
cat > "$OUT/config.pbtxt" <<CFG
duration_ms: 15000
buffers { size_kb: 65536 fill_policy: DISCARD }
data_sources { config { name: "linux.perf" perf_event_config {
 timebase { counter: SW_CPU_CLOCK frequency: 100 }
 callstack_sampling { scope { target_pid: $PID } }
} } }
data_sources { config { name: "linux.ftrace" ftrace_config {
 ftrace_events: "sched/sched_switch"
 ftrace_events: "sched/sched_waking"
 ftrace_events: "sched/sched_blocked_reason"
 atrace_categories: "gfx"
 atrace_categories: "view"
 atrace_categories: "binder_driver"
 atrace_apps: "$PKG"
} } }
data_sources { config { name: "linux.process_stats" process_stats_config { scan_all_processes_on_start: true } } }
CFG
adb logcat -c
adb shell perfetto --txt -c - -o /data/misc/perfetto-traces/shatter.pftrace < "$OUT/config.pbtxt" > "$OUT/perfetto-log.txt" 2>&1 &
TRACE_JOB=$!
sleep 2
adb shell input tap "$((W/2))" "$((H/2-H/20))"
sleep 0.5; adb exec-out screencap -p > "$OUT/mid.png"
wait "$TRACE_JOB"
adb logcat -d > "$OUT/capture-logcat.txt"
adb pull /data/misc/perfetto-traces/shatter.pftrace "$OUT/shatter.pftrace"
adb exec-out screencap -p > "$OUT/after.png"
if grep -q 'SHATTER_PROFILE started' "$OUT/capture-logcat.txt"; then echo 'BLOCKER Hermes restarted during capture'; exit 1; fi
grep 'SHATTER_UI' "$OUT/capture-logcat.txt" | tee "$OUT/summary.txt" || true
[ -s "$OUT/shatter.pftrace" ] || { echo 'BLOCKER trace empty'; exit 1; }
