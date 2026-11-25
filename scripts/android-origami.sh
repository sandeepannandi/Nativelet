#!/usr/bin/env bash
set -euo pipefail
OUT=fold-out; rm -rf "$OUT"; mkdir -p "$OUT"
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
adb shell am start -W -a android.intent.action.VIEW -d 'nativelet-showcase:///origami-fold' "$PKG"
dump_ui() { adb shell rm -f /sdcard/fold.xml; adb shell uiautomator dump /sdcard/fold.xml >/dev/null 2>&1 || return 1; adb pull /sdcard/fold.xml "$OUT/ui.xml" >/dev/null 2>&1; }
FOUND=""
for i in $(seq 1 24); do
  sleep 5
  dump_ui || continue
  if grep -q 'text="Fold"' "$OUT/ui.xml"; then FOUND=1; break; fi
done
adb exec-out screencap -p > "$OUT/initial.png"
if [ -z "$FOUND" ]; then echo "Origami Fold never mounted"; grep -o 'text="[^"]*"' "$OUT/ui.xml" | sort -u | head -20 || true; exit 1; fi
python3 -m pip install -q pillow numpy
read -r RX RY < <(python3 - <<'PY'
import xml.etree.ElementTree as E,re
n=next(n for n in E.parse('fold-out/ui.xml').iter('node') if n.get('text')=='Fold')
x,y,r,b=map(int,re.findall(r'\d+',n.get('bounds')));print((x+r)//2,(y+b)//2)
PY
)
# Fold once, watch it settle, then fold a second time.
adb shell input tap "$RX" "$RY"
for t in 1 2 3 4 5 6; do sleep 1; adb exec-out screencap -p > "$OUT/fold_t$t.png"; done
SETTLED=""
for i in $(seq 1 15); do
  sleep 2
  dump_ui || continue
  if grep -q 'Step 1 of 4' "$OUT/ui.xml"; then SETTLED=1; break; fi
done
adb exec-out screencap -p > "$OUT/step1.png"
adb shell input tap "$RX" "$RY"
sleep 8
adb exec-out screencap -p > "$OUT/step2.png"
grep -o 'text="[^"]*"' "$OUT/ui.xml" | sort -u | head -20 || true
adb logcat -d > "$OUT/logcat.txt"
python3 - <<'PY'
from PIL import Image
import numpy as np,re
ld=lambda n: np.array(Image.open('fold-out/'+n+'.png').convert('RGB')).astype(float)
a,m,b,c=ld('initial'),ld('fold_t3'),ld('step1'),ld('step2')
def red(x): return ((x[:,:,0]>170)&(x[:,:,1]<120)&(x[:,:,2]<100)&(x[:,:,0]>x[:,:,1]+80)).mean()
def cream(x): return ((x[:,:,0]>200)&(x[:,:,1]>190)&(x[:,:,2]>170)&(abs(x[:,:,0]-x[:,:,2])<50)).mean()
print('red fraction initial/step1/step2',red(a),red(b),red(c))
print('cream fraction initial/step1/step2',cream(a),cream(b),cream(c))
assert red(a)>0.03,'Paper did not render'
print('mean abs change initial->mid',np.abs(a-m).mean(),'initial->step1',np.abs(a-b).mean(),'step1->step2',np.abs(b-c).mean())
assert np.abs(a-b).mean()>1.0,'Folding did not change the rendered scene'
assert cream(b)>cream(a)+0.01,'Back of the paper did not show after the fold'
log=open('fold-out/logcat.txt').read();assert log.strip(),'Missing native logs'
assert not re.search(r'ANR in com\.anonymous\.nativeletshowcase|Cmdline: com\.anonymous\.nativeletshowcase|>>> com\.anonymous\.nativeletshowcase <<<|Shader compilation failed|FATAL EXCEPTION',log),'Native crash or shader failure'
open('fold-out/summary.txt','w').write('PASS native origami render, fold turned the sheet over to its back, no detected crash on tested path\n')
PY
[ -n "$SETTLED" ] || echo "note: step readout not detected in UI tree"
