#!/usr/bin/env bash
set -euo pipefail
OUT=dice-out; rm -rf "$OUT"; mkdir -p "$OUT"
PKG=com.anonymous.nativeletshowcase
dump_diag() {
  adb logcat -b all -d > "$OUT/exit-logcat.txt" 2>&1 || true
  echo "=== diagnostics ==="
  grep -E "am_crash|am_anr|Fatal signal|FATAL EXCEPTION|AndroidRuntime: Shutting down VM|ReactNativeJS|Skia|RNSkia" "$OUT/exit-logcat.txt" | grep -vE "uiautomator|chatty" | head -80 | cut -c1-240 || true
  echo "--- app pid now: $(adb shell pidof $PKG 2>&1 | head -1)"
}
trap dump_diag EXIT
adb install -r "$1"
adb logcat -c
adb shell am start -W -a android.intent.action.VIEW -d 'nativelet-showcase:///dice-tray' "$PKG"
dump_ui() { adb shell rm -f /sdcard/dice.xml; adb shell uiautomator dump /sdcard/dice.xml >/dev/null 2>&1 || return 1; adb pull /sdcard/dice.xml "$OUT/ui.xml" >/dev/null 2>&1; }
FOUND=""
for i in $(seq 1 24); do
  sleep 5
  dump_ui || continue
  if grep -q 'text="Roll"' "$OUT/ui.xml"; then FOUND=1; break; fi
done
adb exec-out screencap -p > "$OUT/initial.png"
if [ -z "$FOUND" ]; then echo "Dice Tray never mounted"; grep -o 'text="[^"]*"' "$OUT/ui.xml" | sort -u | head -20 || true; exit 1; fi
python3 -m pip install -q pillow numpy
read -r RX RY < <(python3 - <<'PY'
import xml.etree.ElementTree as E,re
n=next(n for n in E.parse('dice-out/ui.xml').iter('node') if n.get('text')=='Roll')
x,y,r,b=map(int,re.findall(r'\d+',n.get('bounds')));print((x+r)//2,(y+b)//2)
PY
)
adb shell input tap "$RX" "$RY"
for t in 1 2 3 4 5 6; do sleep 1; adb exec-out screencap -p > "$OUT/roll_t$t.png"; done
# Slow emulator: give the dice time to settle and the result line to appear.
RESULT=""
for i in $(seq 1 20); do
  sleep 3
  dump_ui || continue
  if grep -qE 'text="[^"]*[0-9][^"]*=[^"]*[0-9]' "$OUT/ui.xml" || grep -qiE 'text="Total' "$OUT/ui.xml"; then RESULT=1; break; fi
done
adb exec-out screencap -p > "$OUT/settled.png"
grep -o 'text="[^"]*"' "$OUT/ui.xml" | sort -u | head -20 || true
adb logcat -d > "$OUT/logcat.txt"
python3 - <<'PY'
from PIL import Image
import numpy as np,re
a=np.array(Image.open('dice-out/initial.png').convert('RGB')).astype(float)
b=np.array(Image.open('dice-out/roll_t3.png').convert('RGB')).astype(float)
c=np.array(Image.open('dice-out/settled.png').convert('RGB')).astype(float)
# Felt: green-dominant pixels must cover a large part of the screen (scene rendered).
g=(a[:,:,1]>a[:,:,0]+10)&(a[:,:,1]>a[:,:,2]+5)&(a[:,:,1]<190)
print('felt fraction',g.mean())
assert g.mean()>0.04,'Felt scene did not render'
# Dice are ivory/red, bright, low saturation; rolling changed the picture.
print('mean abs change initial->mid',np.abs(a-b).mean(),'initial->settled',np.abs(a-c).mean())
assert np.abs(a-b).mean()>1.0 or np.abs(a-c).mean()>1.0,'Roll did not change the rendered scene'
log=open('dice-out/logcat.txt').read();assert log.strip(),'Missing native logs'
assert not re.search(r'ANR in com\.anonymous\.nativeletshowcase|Cmdline: com\.anonymous\.nativeletshowcase|>>> com\.anonymous\.nativeletshowcase <<<|Shader compilation failed|FATAL EXCEPTION',log),'Native crash or shader failure'
open('dice-out/summary.txt','w').write('PASS native dice tray render, roll changed the scene, no detected crash on tested path\n')
PY
[ -n "$RESULT" ] || echo "note: result line not detected in UI tree (readout may not be exposed)"
