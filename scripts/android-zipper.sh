#!/usr/bin/env bash
set -euo pipefail
OUT=zipper-out; rm -rf "$OUT"; mkdir -p "$OUT"
trap 'adb logcat -d > "$OUT/logcat.txt" 2>&1 || true' EXIT
PKG=com.anonymous.nativeletshowcase
adb install -r "$1"
adb logcat -c
adb shell am start -W -a android.intent.action.VIEW -d 'nativelet-showcase:///zipper-reveal' "$PKG"
sleep 12
adb exec-out screencap -p > "$OUT/initial.png"
# Screen coordinates are derived from the actual raster, not fixed phone size.
python3 -m pip install -q pillow numpy
python3 - <<'PY'
from PIL import Image
import numpy as np,json
im=np.array(Image.open('zipper-out/initial.png').convert('RGB'))
# Landscape's light background identifies the panel's top margin, outside cloth.
m=(np.abs(im[:,:,0].astype(int)-233)<3)&(np.abs(im[:,:,1].astype(int)-218)<3)&(np.abs(im[:,:,2].astype(int)-193)<3)
y,x=np.where(m)
assert len(x)>1000,'Zipper panel not rendered'
x0,x1=int(x.min()),int(x.max());y0=int(y.min());scale=(x1-x0+1)/360
json.dump(dict(cx=(x0+x1)//2,y0=y0,scale=scale),open('zipper-out/geometry.json','w'))
print('Panel geometry',x0,x1,y0,scale)
PY
read -r X Y END < <(python3 - <<'PY'
import json
j=json.load(open('zipper-out/geometry.json'));s=j['scale'];print(j['cx'],int(j['y0']+110*s),int(j['y0']+370*s))
PY
)
adb shell input swipe "$X" "$Y" "$X" "$END" 1500
sleep 2
adb exec-out screencap -p > "$OUT/open.png"
adb shell input swipe "$X" "$END" "$X" "$Y" 1500
sleep 2
adb exec-out screencap -p > "$OUT/closed.png"
adb logcat -d > "$OUT/logcat.txt"
python3 - <<'PY'
from PIL import Image
import numpy as np,json,re
j=json.load(open('zipper-out/geometry.json'));x=j['cx'];y=int(j['y0']+180*j['scale']);r=int(25*j['scale'])
def light(name):
 a=np.array(Image.open('zipper-out/'+name+'.png').convert('RGB'));p=a[y-r:y+r,x-r:x+r];return float(((p[:,:,0]>155)&(p[:,:,0]>p[:,:,2]*1.1)).mean())
a,b,c=map(light,['initial','open','closed']);print('Revealed center fraction',a,b,c)
assert b>.6 and a<.3 and c<.3,'Native drag did not open and close the actual scene'
im=np.array(Image.open('zipper-out/open.png').convert('RGB'))
for direction in [-1,1]:
 xx=int(x+direction*125*j['scale']);p=im[y-r:y+r,xx-r:xx+r];assert float((p.max(axis=2)<110).mean())>.5,'Open frame lost fabric edges'

log=open('zipper-out/logcat.txt').read();assert not re.search(r'Process: com\.anonymous\.nativeletshowcase[^\n]*|ANR in com\.anonymous\.nativeletshowcase',log),'Native crash'
open('zipper-out/summary.txt','w').write('PASS native panel render, drag open, drag close, no fatal crash during tested path\n')
PY
