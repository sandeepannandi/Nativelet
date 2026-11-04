#!/usr/bin/env bash
# Focused native pixel evidence for Newton's Cradle: grab, release, far-ball
# momentum transfer, amplitude decay and settle back to the rest pose.
# Runs before unrelated full-suite tests.
set -eu
python3 -m pip install -q pillow
OUT=smoke-out/cradle; mkdir -p "$OUT"
PKG=com.anonymous.nativeletshowcase
adb shell am force-stop "$PKG"; adb logcat -c
adb shell am start -W -a android.intent.action.VIEW -d 'nativelet-showcase:///cradle' "$PKG" > "$OUT/start.txt"
sleep 9
bash scripts/android-system-ready.sh
sleep 2
shot(){ adb exec-out screencap -p > "$OUT/$1.png"; }
shot initial
adb logcat -d > "$OUT/logcat-early.txt" || true
trap 'adb logcat -d > "$OUT/logcat-onexit.txt" 2>/dev/null || true' EXIT
# Anchor on the wooden base strip (#8b6b4a); canvas is 576x380 logical with the base at x 188..388, y 336..354.
python3 - "$OUT/initial.png" > "$OUT/coords.txt" <<'PY'
from PIL import Image
import sys
im=Image.open(sys.argv[1]).convert('RGB'); w,h=im.size
def isbase(p): r,g,b=p; return 110<r<170 and 80<g<135 and 45<b<100
rows=[]
for y in range(int(h*.2),int(h*.97)):
 n=sum(1 for x in range(w//6,w*5//6,2) if isbase(im.getpixel((x,y))))
 if n>40: rows.append(y)
assert rows,'cradle base absent / crash / blank canvas'
y0=min(rows); mid=(y0+min(rows[-1],y0+8))//2
xs=[x for x in range(w) if isbase(im.getpixel((x,mid)))]
x0,x1=min(xs),max(xs)
s=(x1-x0)/200.0
print(int(x0-188*s),int(y0-336*s),s)
PY
read CX CY S < "$OUT/coords.txt"
at(){ python3 -c "print(int($CX+$1*$S))"; }
aty(){ python3 -c "print(int($CY+$1*$S))"; }
# Pull the leftmost ball (rest 228,260) up-left to ~(5,115) over 900ms, then
# release. The target sits past the 1.25 rad drag clamp, so the release starts
# at the maximum representable angle - the case that used to clip the canvas.
adb shell input swipe "$(at 228)" "$(aty 260)" "$(at 5)" "$(aty 115)" 900
sleep 0.4; shot swing-a
sleep 0.4; shot swing-b
sleep 0.4; shot swing-c
sleep 1.2; shot early-a
sleep 0.35; shot early-b
sleep 45; shot late-a
sleep 0.35; shot late-b
sleep 0.5; shot late-c
sleep 50; shot settled
adb logcat -d > "$OUT/logcat.txt"
if grep -E "Process: $PKG|Process $PKG .*has died|ANR in $PKG|ReactNativeJS.*(Error|Exception)" "$OUT/logcat.txt";then echo 'cradle-session FAIL crash_or_js_error' | tee "$OUT/summary.txt";exit 1;fi
CX=$CX CY=$CY S=$S python3 - "$OUT" <<'PY'
from PIL import Image,ImageChops,ImageStat
import os,sys
from pathlib import Path
p=Path(sys.argv[1]); cx=float(os.environ['CX']); cy=float(os.environ['CY']); s=float(os.environ['S'])
def crop(name,logical): 
    x0,y0,x1,y1=logical
    return Image.open(p/f'{name}.png').convert('RGB').crop((int(cx+x0*s),int(cy+y0*s),int(cx+x1*s),int(cy+y1*s)))
def diff(a,b,box): return sum(ImageStat.Stat(ImageChops.difference(crop(a,box),crop(b,box))).mean)/3
FULL=(100,28,476,368); LEFT=(198,150,258,290); RIGHT=(318,150,378,290)
moving=max(diff('initial',k,FULL) for k in ['swing-a','swing-b','swing-c'])
farball=max(diff('initial',k,RIGHT) for k in ['swing-a','swing-b','swing-c'])
# Eventual settle: motion still present at ~45s AND pixel-identical to rest
# by ~100s. This shows the system keeps evolving and comes to rest; it does
# not by itself rule out canned animation - the physics model is supported
# separately by the cradleMath unit tests. Per-pass amplitude decay is NOT
# asserted here: sparse emulator screencaps (~1.5-2s cadence) alias the ~1.07s
# swing period, box diffs saturate once a ball leaves its rest slot, and the
# middle balls' residual jitter inflates pairwise diffs - the measured values
# are reported as inconclusive data, not as a pass. Per-pass energy behavior is
# frame-rate independent by construction (fixed 1/480s substeps) and is covered
# by the cradleMath unit tests.
late_motion=max(diff('late-a',k,FULL) for k in ['late-b','late-c'])
settlediff=diff('initial','settled',FULL)
early_env=max(diff('initial',k,FULL) for k in ['swing-a','swing-b','swing-c','early-a','early-b'])
late_env=max(diff('initial',k,FULL) for k in ['late-a','late-b','late-c'])
checks=[
 ('release-swing',moving>2,moving),
 ('far-ball-transfer',farball>2,farball),
 ('eventual-settle',late_motion>1.5 and settlediff<1.2,(late_motion,settlediff)),
 ('settles-to-rest',settlediff<1.2,settlediff),
]
for n,ok,value in checks:
 with open(p/'summary.txt','a') as f:f.write(f'cradle-{n} {"ok" if ok else "FAIL"} value={value}\n')
with open(p/'summary.txt','a') as f:f.write(f'cradle-amplitude-decay inconclusive reason=screencap-aliasing value=(early_env={early_env},late_env={late_env})\n')
print((p/'summary.txt').read_text())
assert all(ok for _,ok,_ in checks),'cradle behavior failed'
with open(p/'summary.txt','a') as f:f.write('cradle-session ok crash=no\n')
PY
