#!/usr/bin/env bash
# Bound recovery for the observed Pixel Launcher ANR, not the app under test.
set -u
OUT=smoke-out/system; mkdir -p "$OUT"
for attempt in 1 2; do
  timeout 12 adb shell uiautomator dump /sdcard/system-check.xml >/dev/null 2>&1 || true
  timeout 10 adb pull /sdcard/system-check.xml "$OUT/system-$attempt.xml" >/dev/null 2>&1 || true
  POS=$(python3 - "$OUT/system-$attempt.xml" <<'PY'
import sys,re,xml.etree.ElementTree as E
try:r=E.parse(sys.argv[1]).getroot()
except Exception:raise SystemExit(0)
if not any("Pixel Launcher isn't responding" in n.get('text','') for n in r.iter('node')):raise SystemExit(0)
for n in r.iter('node'):
 if n.get('text')=='Close app':
  v=list(map(int,re.findall(r'\d+',n.get('bounds',''))))
  if len(v)==4:print((v[0]+v[2])//2,(v[1]+v[3])//2);break
PY
)
  if [ -z "$POS" ]; then exit 0; fi
  adb exec-out screencap -p > "$OUT/launcher-anr-$attempt.png"
  echo "system-recovery identified=Pixel-Launcher-ANR action=close-launcher attempt=$attempt" | tee -a "$OUT/summary.txt"
  adb shell input tap $POS; sleep 2
done
# Never treat an unhandled modal as valid interaction evidence.
timeout 12 adb shell uiautomator dump /sdcard/system-final.xml >/dev/null 2>&1 || true
adb shell cat /sdcard/system-final.xml > "$OUT/system-final.xml"
if grep -q "Pixel Launcher isn't responding" "$OUT/system-final.xml"; then
  echo 'system-recovery FAILED launcher-ANR-still-visible' | tee -a "$OUT/summary.txt"; exit 1
fi
