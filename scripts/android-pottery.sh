#!/usr/bin/env bash
# Native Skia evidence for Pottery Wheel: renders, a real touch drag reshapes the clay, no crash.
set -eu
python3 -m pip install -q pillow numpy
OUT=smoke-out/pottery; rm -rf "$OUT"; mkdir -p "$OUT"
PKG=com.anonymous.nativeletshowcase
trap 'adb logcat -d > "$OUT/logcat.txt" 2>&1 || true' EXIT
adb shell am force-stop "$PKG"; adb logcat -c
adb shell am start -W -a android.intent.action.VIEW -d 'nativelet-showcase:///pottery-wheel' "$PKG" > "$OUT/start.txt"
sleep 10
bash scripts/android-system-ready.sh
sleep 2
adb exec-out screencap -p > "$OUT/initial.png"
cat > "$OUT/geom.py" <<'PY'
import sys,json,numpy as np
from PIL import Image
im=np.array(Image.open(sys.argv[1]).convert('RGB')).astype(int)
bg=np.array([0xec,0xe7,0xde])
m=(np.abs(im-bg).max(axis=2)<=3)
ys,xs=np.where(m)
assert len(xs)>20000,'Pottery panel not rendered'
x0,x1,y0,y1=int(xs.min()),int(xs.max()),int(ys.min()),int(ys.max())
s=(x1-x0+1)/360.0
def width_at(y):
    row=m[y,x0:x1+1]; return int((~row).sum())
print(json.dumps(dict(x0=x0,x1=x1,y0=y0,y1=y1,s=s)))
PY
python3 "$OUT/geom.py" "$OUT/initial.png" | tee "$OUT/geom.json"
read -r CX WY WX0 < <(python3 - "$OUT/geom.json" "$OUT/initial.png" <<'PY'
import sys,json,numpy as np
from PIL import Image
g=json.load(open(sys.argv[1]));im=np.array(Image.open(sys.argv[2]).convert('RGB')).astype(int)
bg=np.array([0xec,0xe7,0xde]);s=g['s']
cx=int(g['x0']+180*s);base=int(g['y0']+372*s)
col=np.abs(im[g['y0']:g['y1'],cx]-bg).max(axis=1)>12
ys=np.where(col)[0]+g['y0']
assert len(ys)>50,'No clay in center column'
top=int(ys.min());y=(top+base)//2
row=np.abs(im[y,g['x0']:g['x1']+1]-bg).max(axis=1)>12
xs=np.where(row)[0]+g['x0']
print(cx,y,int(xs.max()))
PY
)
echo "cx=$CX y=$WY wall=$WX0"
IN=$(( WX0 - (WX0-CX)/2 ))
adb shell input swipe "$WX0" "$WY" "$IN" "$WY" 900
sleep 0.5
adb shell input swipe "$WX0" "$WY" "$IN" "$WY" 900
sleep 4
adb exec-out screencap -p > "$OUT/shaped.png"
python3 - "$OUT" "$WY" <<'PY'
import sys,json,numpy as np
from PIL import Image
out,y=sys.argv[1],int(sys.argv[2]);g=json.load(open(out+'/geom.json'))
bg=np.array([0xec,0xe7,0xde])
def w(n):
    im=np.array(Image.open(f'{out}/{n}.png').convert('RGB')).astype(int)
    r=np.abs(im[y-4:y+5,g['x0']:g['x1']+1]-bg).max(axis=2)>12
    return float(r.sum(axis=1).mean())
a,b=w('initial'),w('shaped')
print('waist width px',a,b)
ok=b<a*0.93
open(out+'/summary.txt','w').write(f'pottery-drag {"ok" if ok else "FAIL"} initial_width={a:.1f} shaped_width={b:.1f}\n')
assert ok,'Drag did not narrow the clay at the touched height'
PY
if grep -E "Process: $PKG|ANR in $PKG|ReactNativeJS.*(Error|Exception)" <(adb logcat -d); then echo 'pottery-session FAIL crash_or_js_error' >> "$OUT/summary.txt"; exit 1; fi
echo 'pottery-session ok crash=no' >> "$OUT/summary.txt"
cat "$OUT/summary.txt"
