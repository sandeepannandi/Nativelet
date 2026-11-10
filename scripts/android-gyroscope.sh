#!/usr/bin/env bash
# Focused Gyroscope native evidence. Keep all existing suite gates unchanged.
# Motion pixels are not a physical-model, realism or GPU performance approval.
set -eu
OUT=smoke-out/gyroscope; mkdir -p "$OUT"
PKG=com.anonymous.nativeletshowcase
capture_native_anr_evidence(){
  local dir="$OUT/anr-evidence"
  local remote base
  mkdir -p "$dir"
  adb shell 'ls -t /data/anr/anr_* 2>/dev/null | head -5' > "$dir/anr-files.txt" 2> "$dir/anr-list.err" || true
  sed 's/\r$//' "$dir/anr-files.txt" | while read -r remote; do
    [ -n "$remote" ] || continue
    base=$(basename "$remote")
    timeout 10 adb pull "$remote" "$dir/$base" > "$dir/$base.pull.txt" 2>&1 || true
  done
}
trap 'status=$?; adb logcat -d > "$OUT/logcat-onexit.txt" 2>/dev/null || true; if [ "$status" -ne 0 ]; then capture_native_anr_evidence; fi' EXIT
adb shell am force-stop "$PKG"; adb logcat -c
adb shell am start -W -a android.intent.action.VIEW -d 'nativelet-showcase:///gyroscope' "$PKG" > "$OUT/start.txt"
sleep 9
bash scripts/android-system-ready.sh "$PKG" 'nativelet-showcase:///gyroscope'
sleep 2
shot(){ adb exec-out screencap -p > "$OUT/$1.png"; }
ui(){ bash scripts/android-ui-dump.sh "$OUT" "$1"; }
failure_context(){
  echo 'gyroscope-failure-context begin'
  adb shell dumpsys activity activities | grep -E 'mResumedActivity|topResumedActivity|ACTIVITY' | tail -20 || true
  adb logcat -d | grep -E "Process: $PKG|Process $PKG .*has died|ANR in $PKG|ReactNativeJS|AndroidRuntime|Gyroscope|Error|Exception" | tail -80 || true
  echo 'gyroscope-failure-context end'
}
shot initial; ui initial
if ! python3 - "$OUT" <<'PY'
import json,re,sys,xml.etree.ElementTree as ET
from pathlib import Path
p=Path(sys.argv[1]);root=ET.parse(p/'initial.xml')
nodes=list(root.iter('node'))
canvas=next((x for x in nodes if x.get('content-desc','').startswith('Gyroscope.')),None)
def visible_summary():
 texts=[n.get('text','') for n in nodes if n.get('text','')]
 descs=[n.get('content-desc','') for n in nodes if n.get('content-desc','')]
 print('gyroscope-visible-texts '+json.dumps(texts[:40]))
 print('gyroscope-visible-descriptions '+json.dumps(descs[:40]))
if canvas is None:
 print('gyroscope-controls FAIL accessible canvas absent')
 visible_summary();raise SystemExit(1)
def bounds(x):return list(map(int,re.findall(r'\d+',x.get('bounds',''))))
coords={};coords['canvas']=bounds(canvas)
for name in ['Drag frame','Flick rotor','Slow motion','Reset']:
 n=next((x for x in nodes if x.get('text')==name),None)
 if n is None:
  print('gyroscope-controls FAIL missing control '+name)
  visible_summary();raise SystemExit(1)
 coords[name]=bounds(n)
(p/'coords.json').write_text(json.dumps(coords))
print('gyroscope-controls PASS canvas and four controls present')
PY
then
  failure_context
  exit 1
fi
coord(){ python3 - "$OUT/coords.json" "$1" "$2" <<'PY'
import json,sys
x0,y0,x1,y1=json.load(open(sys.argv[1]))[sys.argv[2]]
print((x0+x1)//2 if sys.argv[3]=='x' else (y0+y1)//2)
PY
}
X=$(coord canvas x); Y=$(coord canvas y)
adb shell dumpsys gfxinfo "$PKG" reset >/dev/null
adb shell input swipe "$((X+70))" "$Y" "$((X-70))" "$Y" 160
sleep 1; shot flick
adb shell input tap "$(coord 'Drag frame' x)" "$(coord 'Drag frame' y)"
adb shell input swipe "$((X-65))" "$((Y-40))" "$((X+65))" "$((Y+40))" 2400
sleep 1; shot frame; ui frame
adb shell input tap "$(coord 'Slow motion' x)" "$(coord 'Slow motion' y)"
sleep 1; shot slow; ui slow
adb shell input tap "$(coord Reset x)" "$(coord Reset y)"
sleep 1; shot reset
adb shell screenrecord --time-limit 6 /sdcard/gyroscope.mp4
adb pull /sdcard/gyroscope.mp4 "$OUT/gyroscope.mp4" >/dev/null 2>&1
adb shell dumpsys gfxinfo "$PKG" framestats > "$OUT/gfxinfo.txt"
adb logcat -d > "$OUT/logcat.txt"
adb shell pidof "$PKG" > "$OUT/pid.txt"
if grep -E "Process: $PKG|Process $PKG .*has died|ANR in $PKG|ReactNativeJS.*(Error|Exception)" "$OUT/logcat.txt";then
 echo 'gyroscope-session FAIL crash_or_js_error' | tee "$OUT/summary.txt";exit 1
fi
if ! python3 - "$OUT" <<'PY'
import sys,hashlib,xml.etree.ElementTree as ET
from pathlib import Path
p=Path(sys.argv[1])
assert (p/'pid.txt').read_text().strip(),'process absent'
texts=[n.get('text') for n in ET.parse(p/'slow.xml').iter('node')]
assert '¼ speed' in texts,'slow motion did not toggle'
hashes={n:hashlib.sha256((p/f'{n}.png').read_bytes()).hexdigest() for n in ['initial','flick','frame','slow','reset']}
assert len(set(hashes.values()))>=4,'native pixels did not change across interactions'
(p/'summary.txt').write_text('gyroscope-session PASS process_alive no_recorded_crash controls_present slow_toggle screenshot_changes\nNOT_TESTED reduced_motion native_state_impulse physical_accuracy realism_acceptance\nGFXINFO is frame evidence, not a GPU-time measurement\n')
print((p/'summary.txt').read_text());print(hashes)
PY
then
  failure_context
  exit 1
fi
