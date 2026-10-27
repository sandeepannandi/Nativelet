#!/usr/bin/env bash
# Distinct rebuilt-APK diagnostic, never retained-byte or qualification claim.
set -euo pipefail
OUT=smoke-out/native-trace;mkdir -p "$OUT"
# Identity was gated before install by host SDK entrypoint. Reconfirm same bytes.
python3 scripts/shatter-host-preflight/verify-native-apk.py apk/app-release.apk > "$OUT/identity-recheck.json"
bash scripts/android-shatter-native-pacing.sh
python3 - <<'REPRO'
import json
p=json.load(open('smoke-out/native-pacing/timing.json'))
assert not p['pass'] and len(p['cycles'])==2 and len(p['cpu_total_avg'])==2
assert all(60<=float(x[2])<=100 for x in p['cycles']),'BLOCKER materially different pacing than retained75-79ms'
assert all(float(x)<=16.67 for x in p['cpu_total_avg']),'BLOCKER different CPU-cost profile'
print('Reproduced same unrecorded pacing failure on separately labeled rebuilt diagnostic bytes')
REPRO
ROOT="$RUNNER_TEMP/shatter-native-trace-host";mkdir -p "$ROOT"
python3 scripts/shatter-host-preflight/download.py "$ROOT"
chmod +x "$ROOT/perfetto/linux-amd64/trace_processor_shell"
export SHATTER_TRACE_PROCESSOR="$ROOT/perfetto/linux-amd64/trace_processor_shell"
"$SHATTER_TRACE_PROCESSOR" query --format csv -f scripts/shatter-host-preflight/upstream-query.sql "$ROOT/perf_sample.pb" > "$ROOT/upstream-actual.csv"
diff -u scripts/shatter-host-preflight/upstream-expected.csv "$ROOT/upstream-actual.csv"
python3 scripts/shatter-host-preflight/verify-parser.py "$ROOT"
bash scripts/android-shatter-perfetto.sh
