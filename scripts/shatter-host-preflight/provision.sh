#!/usr/bin/env bash
# Run after actions/setup-python@v5 with python-version: '3.10', before emulator.
# Host-only environment; no change to app dependencies or APK.
set -euo pipefail
ROOT=${1:?provide absolute preflight bundle directory}
python3 -c 'import sys;assert sys.version_info[:2]==(3,10),"requires Python3.10"'
python3 -m venv "$ROOT/venv"
export PATH="$ROOT/venv/bin:$PATH"
export PYTHONNOUSERSITE=1
python3 -m pip install --no-deps --require-hashes -r "$ROOT/requirements.txt"
python3 "$ROOT/download.py" "$ROOT"
chmod +x "$ROOT/perfetto/linux-amd64/trace_processor_shell"
"$ROOT/perfetto/linux-amd64/trace_processor_shell" --version
"$ROOT/perfetto/linux-amd64/trace_processor_shell" query --format csv -f "$ROOT/upstream-query.sql" "$ROOT/perf_sample.pb" > "$ROOT/upstream-actual.csv"
diff -u "$ROOT/upstream-expected.csv" "$ROOT/upstream-actual.csv"
"$ROOT/perfetto/linux-amd64/trace_processor_shell" query --format csv -f "$ROOT/schema-query.sql" "$ROOT/perf_sample.pb" > "$ROOT/schema-query.csv"
python3 - <<'PY'
from PIL import Image,ImageChops,ImageStat
import sys,json,re,xml.etree.ElementTree,pathlib,collections,hashlib,zipfile,subprocess
print('all host Python imports verified',sys.executable,Image.__version__)
PY
python3 "$ROOT/verify-parser.py" "$ROOT"
# Export same PATH at job scope for every subsequent python3 invocation.
echo "Interpreter PATH=$ROOT/venv/bin"
if [ -n "${GITHUB_PATH:-}" ]; then echo "$ROOT/venv/bin" >> "$GITHUB_PATH"; fi
