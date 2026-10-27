#!/usr/bin/env bash
set -euo pipefail
OUT=smoke-out/native-trace; mkdir -p "$OUT"
PKG=com.anonymous.nativeletshowcase
for tool in adb timeout python3; do command -v "$tool" >/dev/null; done
: "${SHATTER_TRACE_PROCESSOR:?verified trace processor required}"
[ -x "$SHATTER_TRACE_PROCESSOR" ]
adb root; adb wait-for-device
adb shell id | tee "$OUT/adb-id.txt"; grep -q 'uid=0' "$OUT/adb-id.txt"
adb shell perfetto --query > "$OUT/perfetto-query.txt"
grep -q linux.perf "$OUT/perfetto-query.txt" || { echo 'BLOCKER linux.perf absent'; exit 1; }
grep -q linux.ftrace "$OUT/perfetto-query.txt" || { echo 'BLOCKER linux.ftrace absent'; exit 1; }
grep -q linux.process_stats "$OUT/perfetto-query.txt" || { echo 'BLOCKER process_stats absent'; exit 1; }
[ "$(adb shell getprop ro.build.version.sdk | tr -d '\r')" = 34 ]
[ "$(adb shell getprop ro.product.cpu.abi | tr -d '\r')" = x86_64 ]
adb shell atrace --list_categories > "$OUT/atrace-categories.txt"
for category in gfx view binder_driver; do grep -Eq "^[[:space:]]*$category[[:space:]]+-" "$OUT/atrace-categories.txt"; done
adb shell 'for t in am logcat dumpsys pidof screencap input ps perfetto; do command -v "$t" || exit 1; done'
adb shell 'test -d /data/misc/perfetto-traces && test -w /data/misc/perfetto-traces'
adb shell df -k /data/misc/perfetto-traces > "$OUT/device-space.txt"
python3 - "$OUT/device-space.txt" <<'SPACE'
import pathlib,sys
rows=pathlib.Path(sys.argv[1]).read_text().splitlines()
assert len(rows)>1 and int(rows[-1].split()[3])>=131072,'BLOCKER less than128MiB device space'
SPACE
adb shell wm size > "$OUT/device-size.txt"; adb shell wm density > "$OUT/device-density.txt"
# APK already exact-hash gated on host; confirm installed APK bytes too.
adb shell pm path "$PKG" > "$OUT/package-path.txt"
APK_PATH=$(sed -n 's/^package://p' "$OUT/package-path.txt" | tr -d '\r'); [ -n "$APK_PATH" ]
adb shell sha256sum "$APK_PATH" > "$OUT/installed-checksum.txt"
grep -q '^221eea2e66db390a78868c5f4b47bce1c412c279be34e0b218e331aff54f5a15 ' "$OUT/installed-checksum.txt"
adb shell cat /sys/kernel/tracing/available_events > "$OUT/available-events.txt"
for event in sched_switch sched_waking sched_blocked_reason; do grep -q "sched:$event" "$OUT/available-events.txt"; done
adb shell am force-stop "$PKG"; adb logcat -c
adb shell am start -W -a android.intent.action.VIEW -d 'nativelet-showcase:///shatter' "$PKG"
sleep 12; bash scripts/android-system-ready.sh
# Fresh visual gates before warm-up; no idle-dependent hierarchy dump.
adb shell dumpsys window > "$OUT/focus.txt"
grep -E 'mCurrentFocus=' "$OUT/focus.txt" | grep -q "$PKG"
# A generic package occurrence elsewhere in dumpsys is insufficient.
PID=$(adb shell pidof "$PKG" | tr -d '\r'); [ -n "$PID" ]
adb exec-out screencap -p > "$OUT/initial.png"
python3 scripts/shatter-trace-match.py target "$OUT/initial.png" > "$OUT/initial-target.json"
python3 scripts/shatter-trace-match.py intact "$OUT/initial.png" > "$OUT/initial-rim.json"
read HX HY < <(python3 -c 'import json,sys;print(*json.load(open(sys.argv[1]))["hit"])' "$OUT/initial-target.json")
# Retained APK has no phase markers or sampler. Exactly one measured fall,
# bounded by uptime, scheduler/native stacks and Android gfx/view trace slices.
# Initial intact state is checked above; no warm-up fracture or reset.
cp "$OUT/initial.png" "$OUT/before.png"
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
timeout --signal=TERM --kill-after=5s 30s adb shell perfetto --txt -c - -o /data/misc/perfetto-traces/shatter.pftrace < "$OUT/config.pbtxt" > "$OUT/perfetto-log.txt" 2>&1 &
TRACE_JOB=$!
trap 'kill "$TRACE_JOB" 2>/dev/null || true' EXIT
sleep 2
kill -0 "$TRACE_JOB" || { echo 'BLOCKER trace process exited before fracture'; exit 1; }
adb shell cat /proc/uptime > "$OUT/fracture-before-uptime.txt"
adb shell input tap "$HX" "$HY"
adb shell cat /proc/uptime > "$OUT/fracture-after-uptime.txt"
sleep 0.5; adb exec-out screencap -p > "$OUT/mid.png"
wait "$TRACE_JOB"
trap - EXIT
adb logcat -d > "$OUT/capture-logcat.txt"
adb pull /data/misc/perfetto-traces/shatter.pftrace "$OUT/shatter.pftrace"
adb exec-out screencap -p > "$OUT/after.png"
! grep -q 'SHATTER_PROFILE\|Glass Shatter stopped:' "$OUT/capture-logcat.txt"
[ "$(grep -c 'SHATTER_UI' "$OUT/capture-logcat.txt")" -eq 1 ]
[ "$(adb shell pidof "$PKG" | tr -d '\r')" = "$PID" ]
python3 scripts/shatter-trace-match.py clear "$OUT/after.png" "$OUT/initial.png" > "$OUT/after-rim.json"
python3 scripts/shatter-trace-match.py fracture "$OUT/mid.png" "$OUT/before.png" > "$OUT/fracture-share.txt"
python3 -c 'import sys;assert float(open(sys.argv[1]).read())>0.03,"BLOCKER no visual fracture"' "$OUT/fracture-share.txt"
grep 'SHATTER_UI' "$OUT/capture-logcat.txt" | tee "$OUT/summary.txt" || true
[ -s "$OUT/shatter.pftrace" ] || { echo 'BLOCKER trace empty'; exit 1; }

# A nonempty file is not success: target samples, useful stacks and scheduler coverage.
python3 scripts/shatter-host-preflight/validate-capture.py "$SHATTER_TRACE_PROCESSOR" "$OUT" "$PID"
