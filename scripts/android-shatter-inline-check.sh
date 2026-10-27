#!/usr/bin/env bash
# One strict identical-source rebuild fallback. Never trace mismatched bytes.
set -euo pipefail
OUT=smoke-out/native-trace;mkdir -p "$OUT"
sha256sum apk/*.apk | tee "$OUT/rebuilt-checksum.txt"
[ "$(sha256sum apk/*.apk | cut -d' ' -f1)" = '221eea2e66db390a78868c5f4b47bce1c412c279be34e0b218e331aff54f5a15' ] || { echo 'BLOCKER rebuilt APK differs from retained qualified bytes' | tee "$OUT/summary.txt";exit 1; }
ROOT="$RUNNER_TEMP/shatter-native-trace-host";mkdir -p "$ROOT"
python3 scripts/shatter-host-preflight/download.py "$ROOT"
chmod +x "$ROOT/perfetto/linux-amd64/trace_processor_shell"
export SHATTER_TRACE_PROCESSOR="$ROOT/perfetto/linux-amd64/trace_processor_shell"
"$SHATTER_TRACE_PROCESSOR" query --format csv -f scripts/shatter-host-preflight/upstream-query.sql "$ROOT/perf_sample.pb" > "$ROOT/upstream-actual.csv"
diff -u scripts/shatter-host-preflight/upstream-expected.csv "$ROOT/upstream-actual.csv"
python3 scripts/shatter-host-preflight/verify-parser.py "$ROOT"
bash scripts/android-shatter-perfetto.sh
