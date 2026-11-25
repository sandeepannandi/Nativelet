#!/usr/bin/env bash
set -euo pipefail
OUT=snow-out; rm -rf "$OUT"; mkdir -p "$OUT"
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
adb shell am start -W -a android.intent.action.VIEW -d 'nativelet-showcase:///snow-globe' "$PKG"
dump_ui() { adb shell rm -f /sdcard/snow.xml; adb shell uiautomator dump /sdcard/snow.xml >/dev/null 2>&1 || return 1; adb pull /sdcard/snow.xml "$OUT/ui.xml" >/dev/null 2>&1; }
FOUND=""
for i in $(seq 1 24); do
  sleep 5
  dump_ui || continue
  if grep -q 'text="Shake"' "$OUT/ui.xml"; then FOUND=1; break; fi
done
adb exec-out screencap -p > "$OUT/initial.png"
if [ -z "$FOUND" ]; then echo "Snow Globe never mounted"; grep -o 'text="[^"]*"' "$OUT/ui.xml" | sort -u | head -20 || true; exit 1; fi
python3 -m pip install -q pillow numpy
read -r RX RY < <(python3 - <<'PY'
import xml.etree.ElementTree as E,re
n=next(n for n in E.parse('snow-out/ui.xml').iter('node') if n.get('text')=='Shake')
x,y,r,b=map(int,re.findall(r'\d+',n.get('bounds')));print((x+r)//2,(y+b)//2)
PY
)
adb shell input tap "$RX" "$RY"
for t in 1 2 3 4 5 6; do sleep 1; adb exec-out screencap -p > "$OUT/shake_t$t.png"; done
sleep 20
adb exec-out screencap -p > "$OUT/settled.png"
grep -o 'text="[^"]*"' "$OUT/ui.xml" | sort -u | head -20 || true
adb logcat -d > "$OUT/logcat.txt"
python3 - <<'PY'
from PIL import Image
import numpy as np,re
a=np.array(Image.open('snow-out/initial.png').convert('RGB')).astype(float)
b=np.array(Image.open('snow-out/shake_t3.png').convert('RGB')).astype(float)
c=np.array(Image.open('snow-out/settled.png').convert('RGB')).astype(float)
# Night-sky blue backdrop and walnut base must both be on screen (scene rendered).
sky=(a[:,:,2]>a[:,:,0]+25)&(a[:,:,2]<170)&(a[:,:,0]<130)
wood=(a[:,:,0]>a[:,:,2]+25)&(a[:,:,0]<130)&(a[:,:,0]>30)
print('sky fraction',sky.mean(),'wood fraction',wood.mean())
assert sky.mean()>0.03,'Snow globe backdrop did not render'
assert wood.mean()>0.02,'Snow globe base did not render'
print('mean abs change initial->shaking',np.abs(a-b).mean(),'initial->settled',np.abs(a-c).mean())
assert np.abs(a-b).mean()>0.4,'Shake did not change the rendered scene'
log=open('snow-out/logcat.txt').read();assert log.strip(),'Missing native logs'
assert not re.search(r'ANR in com\.anonymous\.nativeletshowcase|Cmdline: com\.anonymous\.nativeletshowcase|>>> com\.anonymous\.nativeletshowcase <<<|Shader compilation failed|FATAL EXCEPTION',log),'Native crash or shader failure'
open('snow-out/summary.txt','w').write('PASS native snow globe render, shake changed the scene, no detected crash on tested path\n')
PY
