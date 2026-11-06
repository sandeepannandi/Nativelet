#!/usr/bin/env bash
# Focused native pixel evidence for the Mechanical Watch: the 3D steel case
# and movement render (not a crash/blank), and the movement visibly runs
# (escapement, gear train, idle turntable change pixels over 3s).
set -eu
python3 -m pip install -q pillow
OUT=smoke-out/watch; mkdir -p "$OUT"
PKG=com.anonymous.nativeletshowcase
adb shell am force-stop "$PKG"; adb logcat -c
adb shell am start -W -a android.intent.action.VIEW -d 'nativelet-showcase:///watch' "$PKG" > "$OUT/start.txt"
sleep 9
bash scripts/android-system-ready.sh
sleep 2
shot(){ adb exec-out screencap -p > "$OUT/$1.png"; }
shot initial
adb logcat -d > "$OUT/logcat-early.txt" || true
trap 'adb logcat -d > "$OUT/logcat-onexit.txt" 2>/dev/null || true' EXIT
sleep 3
shot later
python3 - "$OUT" <<'PY'
from PIL import Image, ImageChops
import sys, os
p=sys.argv[1]
def steel(name):
    im=Image.open(os.path.join(p,name+'.png')).convert('RGB'); w,h=im.size
    x0,x1=int(w*.2),int(w*.8); y0,y1=int(h*.25),int(h*.75)
    n=0
    for y in range(y0,y1,2):
        for x in range(x0,x1,2):
            r,g,b=im.getpixel((x,y))
            if 80<r<215 and max(r,g,b)-min(r,g,b)<22: n+=1
    return n,(x0,y0,x1,y1)
a=Image.open(os.path.join(p,'initial.png')).convert('RGB')
b=Image.open(os.path.join(p,'later.png')).convert('RGB')
d=ImageChops.difference(a,b); w,h=d.size
x0,x1=int(w*.2),int(w*.8); y0,y1=int(h*.25),int(h*.75)
moved=0
for y in range(y0,y1,2):
    for x in range(x0,x1,2):
        r,g,bl=d.getpixel((x,y))
        if max(r,g,bl)>14: moved+=1
steel0,box=steel('initial')
checks=[
 ('watch-renders',steel0>2000,steel0),
 ('watch-moves',moved>1500,moved),
]
with open(os.path.join(p,'summary.txt'),'a') as f:
    for n,ok,value in checks: f.write(f'{n} {"ok" if ok else "FAIL"} value={value}\n')
print(open(os.path.join(p,'summary.txt')).read())
assert all(ok for _,ok,_ in checks),'watch behavior failed'
with open(os.path.join(p,'summary.txt'),'a') as f: f.write('watch-session ok crash=no\n')
PY
