#!/usr/bin/env bash
set -euo pipefail
OUT=smoke-out/native-verification; mkdir -p "$OUT"
PKG=com.anonymous.nativeletshowcase
adb shell am force-stop "$PKG"
adb logcat -c
adb shell am start -W -a android.intent.action.VIEW -d 'nativelet-showcase:///shatter-native-test' "$PKG"
for i in $(seq 1 120); do
 sleep 5
 adb logcat -d > "$OUT/logcat.txt"
 grep -q 'SHATTER_NATIVE_DONE\|SHATTER_NATIVE_ERROR' "$OUT/logcat.txt" && break
done
adb exec-out screencap -p > "$OUT/final.png"
python3 - "$OUT/logcat.txt" <<'PY'
import sys,json,re
s=open(sys.argv[1]).read()
if 'SHATTER_NATIVE_ERROR' in s: raise SystemExit('native runtime harness error')
rows=[json.loads(x) for x in re.findall(r'SHATTER_NATIVE_CASE (\{[^\r\n]+\})',s)]
assert len(rows)==54 and len({x['job'] for x in rows})==54,('missing/duplicate cases',len(rows))
assert all(x['exact'] and x['frames']==240 and x['shards']>=300 for x in rows)
assert 'SHATTER_NATIVE_BOUNDARY' in s and 'SHATTER_NATIVE_DONE cases=54 frames=12960' in s
print('PASS actual Android JSI boundary and full-state 54cases/12960frames. NOT behavior/pacing/full-suite qualification.')
PY
