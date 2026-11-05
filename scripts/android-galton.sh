#!/usr/bin/env bash
# Focused native pixel evidence for the Galton Board: tap-to-drop lands beads,
# hold-to-pour piles a bell of beads in the bins, fast swipe clears the board.
# Runs before unrelated full-suite tests.
set -eu
python3 -m pip install -q pillow
OUT=smoke-out/galton; mkdir -p "$OUT"
PKG=com.anonymous.nativeletshowcase
adb shell am force-stop "$PKG"; adb logcat -c
adb shell am start -W -a android.intent.action.VIEW -d 'nativelet-showcase:///galton' "$PKG" > "$OUT/start.txt"
sleep 9
bash scripts/android-system-ready.sh
sleep 2
shot(){ adb exec-out screencap -p > "$OUT/$1.png"; }
shot initial
adb logcat -d > "$OUT/logcat-early.txt" || true
trap 'adb logcat -d > "$OUT/logcat-onexit.txt" 2>/dev/null || true' EXIT
# Anchor on the wooden frame (#6d5238): the outer frame band of the 576x720
# logical board spans x 10..566 near the top edge.
python3 - "$OUT/initial.png" > "$OUT/coords.txt" <<'PY'
from PIL import Image
import sys
im=Image.open(sys.argv[1]).convert('RGB'); w,h=im.size
def isframe(p): r,g,b=p; return 85<r<140 and 60<g<105 and 35<b<75
rows=[]
for y in range(int(h*.1),int(h*.6)):
 n=sum(1 for x in range(w//8,w*7//8,2) if isframe(im.getpixel((x,y))))
 if n>80: rows.append(y)
assert rows,'galton frame absent / crash / blank canvas'
y0=min(rows); mid=(y0+min(rows[-1],y0+6))//2
xs=[x for x in range(w) if isframe(im.getpixel((x,mid)))]
x0,x1=min(xs),max(xs)
s=(x1-x0)/556.0
print(int(x0-10*s),int(y0-8*s),s)
PY
read CX CY S < "$OUT/coords.txt"
at(){ python3 -c "print(int($CX+$1*$S))"; }
aty(){ python3 -c "print(int($CY+$1*$S))"; }
# Tap three beads into the lattice, then hold the board to pour the hopper.
adb shell input tap "$(at 288)" "$(aty 300)"
sleep 0.8
adb shell input tap "$(at 288)" "$(aty 300)"
sleep 0.8
adb shell input tap "$(at 288)" "$(aty 300)"
sleep 6
shot dropped
adb shell input swipe "$(at 288)" "$(aty 300)" "$(at 288)" "$(aty 300)" 9000
sleep 45
shot piled
# Fast horizontal fling sweeps the bins clean.
adb shell input swipe "$(at 120)" "$(aty 300)" "$(at 480)" "$(aty 300)" 130
sleep 2
shot cleared
adb logcat -d > "$OUT/logcat.txt"
if grep -E "Process: $PKG|Process $PKG .*has died|ANR in $PKG|ReactNativeJS.*(Error|Exception)" "$OUT/logcat.txt";then
  echo 'galton-session FAIL crash_or_js_error' | tee "$OUT/summary.txt"
  echo '--- fatal logcat context (for diagnosis) ---'
  grep -E -B6 -A45 'FATAL EXCEPTION|Fatal signal|JavascriptException|ANR in|AndroidRuntime|ReactNativeJS' "$OUT/logcat.txt" | head -160 || true
  echo '--- end fatal logcat context ---'
  exit 1
fi
CX=$CX CY=$CY S=$S python3 - "$OUT" <<'PY'
from PIL import Image
import os,sys
from pathlib import Path
p=Path(sys.argv[1]); cx=float(os.environ['CX']); cy=float(os.environ['CY']); s=float(os.environ['S'])
BINS=(34,504,542,688)
def beads(name,box):
 x0,y0,x1,y1=box
 im=Image.open(p/f'{name}.png').convert('RGB').crop((int(cx+x0*s),int(cy+y0*s),int(cx+x1*s),int(cy+y1*s)))
 n=0
 for px in im.getdata():
  r,g,b=px
  if 170<r<235 and 100<g<165 and 30<b<90: n+=1
 return n
dropped=beads('dropped',BINS)
piled=beads('piled',BINS)
cleared=beads('cleared',BINS)
checks=[
 ('drop-lands',dropped>40,dropped),
 ('pour-piles',piled>15000,piled),
 ('swipe-clears',cleared<piled*0.15,(piled,cleared)),
]
with open(p/'summary.txt','a') as f:
 for n,ok,value in checks:f.write(f'galton-{n} {"ok" if ok else "FAIL"} value={value}\n')
print((p/'summary.txt').read_text())
assert all(ok for _,ok,_ in checks),'galton behavior failed'
with open(p/'summary.txt','a') as f:f.write('galton-session ok crash=no\n')
PY
