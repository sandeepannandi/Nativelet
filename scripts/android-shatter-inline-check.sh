#!/usr/bin/env bash
# Distinct rebuilt-APK diagnostic, never retained-byte or qualification claim.
set -euo pipefail
OUT=smoke-out/native-trace;mkdir -p "$OUT"
# Identity was gated before install by host SDK entrypoint. Reconfirm same bytes.
python3 scripts/shatter-host-preflight/verify-native-apk.py apk/app-release.apk > "$OUT/identity-recheck.json"
bash scripts/android-shatter-native-pacing.sh
# New experiment: characterize this runner, no retained-time reproduction band.
# The previous experiment stopped on its band and remains unchanged in history.
python3 - <<'CHARACTERIZE'
import json
p=json.load(open('smoke-out/native-pacing/timing.json'))
assert len(p['cycles'])==2 and len(p['cpu_total_avg'])==2,'missing characterization'
print('Characterization only, not qualification:',p)
CHARACTERIZE

ROOT="$RUNNER_TEMP/shatter-native-trace-host";mkdir -p "$ROOT"
python3 scripts/shatter-host-preflight/download.py "$ROOT"
chmod +x "$ROOT/perfetto/linux-amd64/trace_processor_shell"
export SHATTER_TRACE_PROCESSOR="$ROOT/perfetto/linux-amd64/trace_processor_shell"
"$SHATTER_TRACE_PROCESSOR" query --format csv -f scripts/shatter-host-preflight/upstream-query.sql "$ROOT/perf_sample.pb" > "$ROOT/upstream-actual.csv"
diff -u scripts/shatter-host-preflight/upstream-expected.csv "$ROOT/upstream-actual.csv"
python3 scripts/shatter-host-preflight/verify-parser.py "$ROOT"
bash scripts/android-shatter-perfetto.sh
