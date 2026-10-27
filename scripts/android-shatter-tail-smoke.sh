#!/usr/bin/env bash
set -euo pipefail
OUT=smoke-out/tail; mkdir -p "$OUT"
PKG=com.anonymous.nativeletshowcase
: "${SHATTER_TRACE_PROCESSOR:?}"
adb root; adb wait-for-device
adb shell id | tee "$OUT/adb-id.txt"; grep -q 'uid=0' "$OUT/adb-id.txt"
adb shell perfetto --query > "$OUT/perfetto-query.txt"
for source in linux.perf linux.ftrace linux.process_stats; do grep -q "$source" "$OUT/perfetto-query.txt"; done
adb shell am force-stop "$PKG"; adb logcat -c
adb shell am start -W -a android.intent.action.VIEW -d 'nativelet-showcase:///shatter' "$PKG"
sleep 12; bash scripts/android-system-ready.sh
PID=$(adb shell pidof "$PKG" | tr -d '\r'); [[ "$PID" =~ ^[0-9]+$ ]]
echo "$PID" > "$OUT/pid.txt"
adb shell dumpsys window > "$OUT/focus.txt"; grep 'mCurrentFocus=' "$OUT/focus.txt" | grep -q "$PKG"
adb exec-out screencap -p > "$OUT/initial.png"
python3 scripts/shatter-trace-match.py target "$OUT/initial.png" > "$OUT/target.json"
python3 scripts/shatter-trace-match.py intact "$OUT/initial.png" > "$OUT/initial-rim.json"
read HX HY RX RY < <(python3 -c 'import json,sys;j=json.load(open(sys.argv[1]));print(*j["hit"],*j["reset"])' "$OUT/target.json")
adb shell cat /proc/"$PID"/maps > "$OUT/maps.txt"
adb shell ps -T -p "$PID" > "$OUT/threads.txt"
cat > "$OUT/config.pbtxt" <<CFG
duration_ms: 40000
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
timeout --signal=TERM --kill-after=5s 55s adb shell perfetto --txt -c - -o /data/misc/perfetto-traces/shatter.pftrace < "$OUT/config.pbtxt" > "$OUT/perfetto-log.txt" 2>&1 &
TRACE_JOB=$!
trap 'kill "$TRACE_JOB" 2>/dev/null || true' EXIT
sleep 2; kill -0 "$TRACE_JOB"
adb shell cat /proc/uptime > "$OUT/fracture-before-uptime.txt"
adb shell input tap "$HX" "$HY"
adb shell cat /proc/uptime > "$OUT/fracture-after-uptime.txt"
sleep 0.5; adb exec-out screencap -p > "$OUT/first-mid.png"
sleep 14.5; adb exec-out screencap -p > "$OUT/first-clear.png"
adb shell input tap "$RX" "$RY"; sleep 2
adb exec-out screencap -p > "$OUT/reset.png"
adb shell input tap "$HX" "$HY"
sleep 0.5; adb exec-out screencap -p > "$OUT/second-mid.png"
sleep 14.5; adb exec-out screencap -p > "$OUT/second-clear.png"
wait "$TRACE_JOB"; trap - EXIT
adb pull /data/misc/perfetto-traces/shatter.pftrace "$OUT/shatter.pftrace"
adb logcat -d > "$OUT/logcat.txt"
[ "$(adb shell pidof "$PKG" | tr -d '\r')" = "$PID" ]
# Independent statuses: quality failure cannot suppress pixels or marker checks.
set +e
python3 scripts/shatter-tail-validate.py "$SHATTER_TRACE_PROCESSOR" "$OUT" "$PID"
B=$?
python3 scripts/shatter-host-preflight/validate-capture.py "$SHATTER_TRACE_PROCESSOR" "$OUT" "$PID" > "$OUT/quality.txt" 2>&1
Q=$?
printf 'behavior_marker_exit=%s\nperformance_quality_exit=%s\n' "$B" "$Q" > "$OUT/status.txt"
cat "$OUT/status.txt"
exit "$B"
