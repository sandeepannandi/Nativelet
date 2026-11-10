#!/usr/bin/env bash
# Bound recovery for the observed Pixel Launcher ANR, not the app under test.
# A missing or invalid hierarchy is not proof that the launcher is ready.
set -u
OUT=smoke-out/system; mkdir -p "$OUT"
PKG="${1:-com.anonymous.nativeletshowcase}"
ROUTE_URL="${2:-}"
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
capture_final(){
  bash scripts/android-ui-dump.sh "$OUT" system-final /sdcard/system-final.xml
}
final_has_anr(){
  python3 - "$OUT/system-final.xml" <<'PY'
import sys,xml.etree.ElementTree as E
r=E.parse(sys.argv[1]).getroot()
if any("Pixel Launcher isn't responding" in n.get('text','') for n in r.iter('node')):raise SystemExit(0)
raise SystemExit(1)
PY
}
print_visible(){
  python3 - "$OUT/system-final.xml" <<'PY'
import json,sys,xml.etree.ElementTree as E
r=E.parse(sys.argv[1]).getroot();nodes=list(r.iter('node'))
texts=[n.get('text','') for n in nodes if n.get('text','')]
print('system-visible-texts '+json.dumps(texts[:40]))
PY
}
print_dump_errors(){
  local scope="$1"
  local dump_log
  for dump_log in "$OUT"/system-final.dump-*.txt; do
    [ -f "$dump_log" ] || continue
    sed -n '1,6p' "$dump_log"
  done | awk '!seen[$0]++' | tail -12 | sed "s/^/system-dump-error scope=$scope /"
}
recover_system(){
  reason="$1"
  echo "system-recovery action=back-force-stop-launcher reason=$reason" | tee -a "$OUT/summary.txt"
  adb shell input keyevent KEYCODE_BACK || true
  adb shell am force-stop com.google.android.apps.nexuslauncher || true
  if [ -n "$ROUTE_URL" ]; then
    if ! adb shell am start -W -a android.intent.action.VIEW -d "$ROUTE_URL" "$PKG" >"$OUT/relaunch.txt" 2>&1; then
      echo 'system-recovery FAILED app-relaunch' | tee -a "$OUT/summary.txt"
      exit 1
    fi
  fi
  sleep 5
}
# Never treat an unhandled modal or unavailable hierarchy as valid interaction evidence.
if capture_final; then
  if ! final_has_anr; then exit 0; fi
  echo 'system-recovery launcher-ANR-still-visible after taps' | tee -a "$OUT/summary.txt"
  recover_system launcher-ANR-still-visible
  if ! capture_final; then
    echo 'system-recovery FAILED final-hierarchy-unavailable-after-recovery' | tee -a "$OUT/summary.txt"
    print_dump_errors post-recovery
    exit 1
  fi
  if final_has_anr; then
    echo 'system-recovery FAILED launcher-ANR-still-visible' | tee -a "$OUT/summary.txt"
    print_visible
    exit 1
  fi
  echo 'system-recovery PASS launcher-ANR-cleared-after-relaunch' | tee -a "$OUT/summary.txt"
  exit 0
fi
print_dump_errors pre-recovery
cp "$OUT/system-final.ui-dump-attempts.txt" "$OUT/system-final.before-recovery.txt" 2>/dev/null || true
recover_system final-hierarchy-unavailable
if ! capture_final; then
  echo 'system-recovery FAILED final-hierarchy-unavailable' | tee -a "$OUT/summary.txt"
  print_dump_errors post-recovery
  exit 1
fi
if final_has_anr; then
  echo 'system-recovery FAILED launcher-ANR-still-visible' | tee -a "$OUT/summary.txt"
  print_visible
  exit 1
fi
echo 'system-recovery PASS hierarchy-available-after-relaunch' | tee -a "$OUT/summary.txt"
