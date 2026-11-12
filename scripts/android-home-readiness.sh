#!/usr/bin/env bash
# Wait for observed usable launcher rather than treating boot_completed as UI-ready.
# Preserves every failed attempt; bounded 90s deadline; fails closed on ANR/fatal.
OUT=${1:-runtime-qualification/home-readiness}
mkdir -p "$OUT"
deadline=$((SECONDS+90))
attempt=0
while (( SECONDS < deadline )); do
  attempt=$((attempt+1))
  dir="$OUT/attempt-$attempt"; mkdir -p "$dir"
  remaining=$((deadline-SECONDS))
  # One bounded sequence preserves each failed attempt, including a null root.
  # The outer timeout prevents an unresponsive ADB command exceeding the deadline.
  if timeout "$remaining" bash -s -- "$dir" > "$dir/check.stdout" 2> "$dir/check.stderr" <<'SH'
set -eu
d=$1
adb shell getprop sys.boot_completed > "$d/boot.txt"
adb shell dumpsys window > "$d/window.txt"
adb exec-out screencap -p > "$d/screen.png"
adb logcat -d > "$d/logcat.txt"
if grep -E 'ANR in |FATAL EXCEPTION:' "$d/logcat.txt" > "$d/runtime-errors.txt"; then
  exit 2
fi
adb shell rm -f /sdcard/readiness-root.xml
adb shell uiautomator dump /sdcard/readiness-root.xml > "$d/dump.txt" 2>&1
adb pull /sdcard/readiness-root.xml "$d/root.xml" > "$d/pull.txt" 2>&1
python3 - "$d" <<'PY'
from pathlib import Path
import re,struct,sys,xml.etree.ElementTree as ET
p=Path(sys.argv[1])
assert (p/'boot.txt').read_text().strip()=='1','boot flag absent'
w=(p/'window.txt').read_text()
f=re.search(r'mCurrentFocus=Window\{[^\n]*\bu0 ([^\s/]+)/',w)
assert f and f.group(1)=='com.android.launcher3','launcher lacks focused window'
n=list(ET.parse(p/'root.xml').getroot().iter('node'))
assert any(x.get('package')=='com.android.launcher3' and x.get('visible-to-user','true')!='false' for x in n),'launcher root absent'
b=(p/'screen.png').read_bytes()
assert b[:8]==b'\x89PNG\r\n\x1a\n' and all(struct.unpack('>II',b[16:24])),'invalid screenshot'
PY
SH
  then
    printf '%s\n' "PRELIMINARY launcher/root ready on attempt $attempt; mandatory three-sample and ANR gates still required; pixels need inspection." > "$OUT/summary.txt"
    exit 0
  else
    status=$?
    printf '%s\n' "attempt=$attempt exit=$status" > "$dir/result.txt"
    if [ -s "$dir/runtime-errors.txt" ]; then
      echo 'FAIL runtime ANR/fatal during home readiness' > "$OUT/summary.txt"
      exit 1
    fi
  fi
  remaining=$((deadline-SECONDS))
  (( remaining > 0 )) || break
  delay=5; (( remaining >= delay )) || delay=$remaining
  sleep "$delay"
done
echo 'FAIL no focused launcher with accessible root before 90s deadline; no app install' > "$OUT/summary.txt"
exit 1
