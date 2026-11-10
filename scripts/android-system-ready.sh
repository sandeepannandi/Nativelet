#!/usr/bin/env bash
# Bound recovery for the observed Pixel Launcher ANR, not the app under test.
# A missing or invalid hierarchy is not proof that the launcher is ready.
set -u
OUT=smoke-out/system; mkdir -p "$OUT"
for attempt in 1 2; do
  rm -f "$OUT/system-$attempt.xml"
  timeout 12 adb shell uiautomator dump /sdcard/system-check.xml >"$OUT/system-$attempt.dump.txt" 2>&1 || true
  timeout 10 adb pull /sdcard/system-check.xml "$OUT/system-$attempt.xml" >"$OUT/system-$attempt.pull.txt" 2>&1 || true
  POS=$(python3 - "$OUT/system-$attempt.xml" <<'PY'
import sys,re,xml.etree.ElementTree as E
try:r=E.parse(sys.argv[1]).getroot()
except Exception:raise SystemExit(0)
if r.tag!='hierarchy' or not any(True for _ in r.iter('node')):raise SystemExit(0)
if not any("Pixel Launcher isn't responding" in n.get('text','') for n in r.iter('node')):
 print('NO_ANR');raise SystemExit(0)
for n in r.iter('node'):
 if n.get('text')=='Close app':
  v=list(map(int,re.findall(r'\d+',n.get('bounds',''))))
  if len(v)==4:print((v[0]+v[2])//2,(v[1]+v[3])//2);break
PY
)
  if [ "$POS" = "NO_ANR" ]; then exit 0; fi
  if [ -z "$POS" ]; then
    echo "system-recovery hierarchy-unavailable attempt=$attempt" | tee -a "$OUT/summary.txt"
    continue
  fi
  adb exec-out screencap -p > "$OUT/launcher-anr-$attempt.png"
  echo "system-recovery identified=Pixel-Launcher-ANR action=close-launcher attempt=$attempt" | tee -a "$OUT/summary.txt"
  adb shell input tap $POS; sleep 2
done
# Never treat an unhandled modal or unavailable hierarchy as valid interaction evidence.
if ! bash scripts/android-ui-dump.sh "$OUT" system-final /sdcard/system-final.xml; then
  echo 'system-recovery FAILED final-hierarchy-unavailable' | tee -a "$OUT/summary.txt"
  exit 1
fi
python3 - "$OUT/system-final.xml" <<'PY'
import json,sys,xml.etree.ElementTree as E
r=E.parse(sys.argv[1]).getroot()
nodes=list(r.iter('node'))
if any("Pixel Launcher isn't responding" in n.get('text','') for n in nodes):
 texts=[n.get('text','') for n in nodes if n.get('text','')]
 print('system-recovery FAILED launcher-ANR-still-visible')
 print('system-visible-texts '+json.dumps(texts[:40]))
 raise SystemExit(1)
PY
