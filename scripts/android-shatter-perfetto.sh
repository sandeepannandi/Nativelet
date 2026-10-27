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
# Fresh visual gates before warm-up; no idle-dependent hierarchy dump.
adb shell dumpsys window > "$OUT/focus.txt"
grep -q "$PKG" "$OUT/focus.txt"
PID=$(adb shell pidof "$PKG" | tr -d '\r'); [ -n "$PID" ]
adb exec-out screencap -p > "$OUT/initial.png"
python3 scripts/shatter-trace-match.py target "$OUT/initial.png" > "$OUT/initial-target.json"
python3 scripts/shatter-trace-match.py intact "$OUT/initial.png" > "$OUT/initial-rim.json"
read HX HY < <(python3 -c 'import json,sys;print(*json.load(open(sys.argv[1]))["hit"])' "$OUT/initial-target.json")
adb shell input tap "$HX" "$HY"
for i in $(seq 1 30); do sleep 3; adb logcat -d > "$OUT/warmup-logcat.txt"; grep -q 'SHATTER_PROFILE saved=' "$OUT/warmup-logcat.txt" && break; done
check_sampler() {
 [ "$(grep -c 'SHATTER_PROFILE started' "$1")" -eq 1 ]
 [ "$(grep -c 'SHATTER_PROFILE saved=' "$1")" -eq 1 ]
 ! grep -q 'SHATTER_PROFILE error' "$1"
 [ "$(adb shell pidof "$PKG" | tr -d '\r')" = "$PID" ]
}
check_sampler "$OUT/warmup-logcat.txt"
grep -q 'SHATTER_UI' "$OUT/warmup-logcat.txt"
adb exec-out screencap -p > "$OUT/cleared.png"
python3 scripts/shatter-trace-match.py clear "$OUT/cleared.png" "$OUT/initial.png" > "$OUT/cleared-rim.json"
python3 scripts/shatter-trace-match.py target "$OUT/cleared.png" > "$OUT/reset-target.json"
read RX RY < <(python3 -c 'import json,sys;print(*json.load(open(sys.argv[1]))["reset"])' "$OUT/reset-target.json")
adb shell input tap "$RX" "$RY"; sleep 2
adb exec-out screencap -p > "$OUT/before.png"
python3 scripts/shatter-trace-match.py reset "$OUT/before.png" "$OUT/initial.png" > "$OUT/reset-rim.json"
python3 scripts/shatter-trace-match.py target "$OUT/before.png" > "$OUT/capture-target.json"
adb logcat -d > "$OUT/reset-logcat.txt"; check_sampler "$OUT/reset-logcat.txt"
read HX HY < <(python3 -c 'import json,sys;print(*json.load(open(sys.argv[1]))["hit"])' "$OUT/capture-target.json")
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
adb shell perfetto --txt -c - -o /data/misc/perfetto-traces/shatter.pftrace < "$OUT/config.pbtxt" > "$OUT/perfetto-log.txt" 2>&1 &
TRACE_JOB=$!
sleep 2
adb shell input tap "$HX" "$HY"
sleep 0.5; adb exec-out screencap -p > "$OUT/mid.png"
wait "$TRACE_JOB"
adb logcat -d > "$OUT/capture-logcat.txt"
adb pull /data/misc/perfetto-traces/shatter.pftrace "$OUT/shatter.pftrace"
adb exec-out screencap -p > "$OUT/after.png"
check_sampler "$OUT/capture-logcat.txt"
[ "$(grep -c 'SHATTER_UI' "$OUT/capture-logcat.txt")" -eq 2 ]
python3 scripts/shatter-trace-match.py clear "$OUT/after.png" "$OUT/initial.png" > "$OUT/after-rim.json"
python3 scripts/shatter-trace-match.py fracture "$OUT/mid.png" "$OUT/before.png" > "$OUT/fracture-share.txt"
python3 -c 'import sys;assert float(open(sys.argv[1]).read())>0.03,"BLOCKER no visual fracture"' "$OUT/fracture-share.txt"
grep 'SHATTER_UI' "$OUT/capture-logcat.txt" | tee "$OUT/summary.txt" || true
[ -s "$OUT/shatter.pftrace" ] || { echo 'BLOCKER trace empty'; exit 1; }
