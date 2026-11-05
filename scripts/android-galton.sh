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
export CX CY S
at(){ python3 -c "print(int($CX+$1*$S))"; }
aty(){ python3 -c "print(int($CY+$1*$S))"; }
# Tap three beads into the lattice, then hold the board to pour the hopper.
adb shell input tap "$(at 288)" "$(aty 300)"
sleep 0.8
adb shell input tap "$(at 288)" "$(aty 300)"
sleep 0.8
adb shell input tap "$(at 288)" "$(aty 300)"
sleep 14
shot dropped
adb shell input swipe "$(at 288)" "$(aty 300)" "$(at 288)" "$(aty 300)" 24000
sleep 45
shot piled
# Fast horizontal fling sweeps the bins clean. The gate evaluates the FIRST
# attempt with the original 130ms fling, exactly once - retries never count
# toward it. Run 42021783288 showed a no-op fling while the identical
# gesture cleared in 42016966367; whether that was input coalescing or
# component gesture handling is UNPROVEN. Each fling is traced with getevent
# so a no-op can be attributed (ABS_MT_POSITION_X samples ~ delivered move
# events). Diagnostic retries at 250ms (slower delivery) run only after a
# failed first attempt and are reported as separate non-gating lines.
count_beads(){ python3 - "$OUT/$1.png" <<'PY2'
from PIL import Image
import sys,os
cx,cy,s=float(os.environ['CX']),float(os.environ['CY']),float(os.environ['S'])
im=Image.open(sys.argv[1]).convert('RGB').crop((int(cx+34*s),int(cy+504*s),int(cx+542*s),int(cy+718*s)))
print(sum(1 for r,g,b in im.getdata() if 170<r<235 and 100<g<165 and 30<b<90))
PY2
}
fling(){ # $1 duration-ms  $2 label
  adb shell getevent -lt > "$OUT/getevent-$2.txt" 2>&1 &
  local GEPID=$!
  sleep 0.5
  adb shell input swipe "$(at 120)" "$(aty 300)" "$(at 480)" "$(aty 300)" "$1"
  sleep 0.5
  kill $GEPID 2>/dev/null || true
  wait $GEPID 2>/dev/null || true
}
move_events(){
  if [ -f "$OUT/getevent-$1.txt" ]; then grep -c 'ABS_MT_POSITION_X' "$OUT/getevent-$1.txt" || true; else echo 0; fi
}
: > "$OUT/clear-attempts.txt"
PILED_COUNT=$(count_beads piled)
fling 130 cleared
sleep 2
shot cleared
C1=$(count_beads cleared)
M1=$(move_events cleared)
echo "1 130 $C1 $M1" >> "$OUT/clear-attempts.txt"
if ! python3 -c "import sys; sys.exit(0 if $C1 < $PILED_COUNT*0.15 else 1)"; then
  for n in 2 3; do
    fling 250 cleared$n
    sleep 2
    shot cleared$n
    C=$(count_beads cleared$n)
    M=$(move_events cleared$n)
    echo "$n 250 $C $M" >> "$OUT/clear-attempts.txt"
  done
fi
# Mid-drag tilt proof: a slow sideways drag eases the board to its tiltMax
# (0.12 rad); screenshot while the finger is still down, then measure the
# frame top-edge slope. Evidence for drag-tilt on native, not a physics gate.
adb shell input swipe "$(at 200)" "$(aty 300)" "$(at 560)" "$(aty 300)" 4000 &
DRAGPID=$!
sleep 2
shot tilted
wait $DRAGPID
sleep 1
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
BINS=(34,504,542,718)
def beads(name,box):
 x0,y0,x1,y1=box
 im=Image.open(p/f'{name}.png').convert('RGB').crop((int(cx+x0*s),int(cy+y0*s),int(cx+x1*s),int(cy+y1*s)))
 n=0
 for px in im.getdata():
  r,g,b=px
  if 170<r<235 and 100<g<165 and 30<b<90: n+=1
 return n
base=beads('initial',BINS)
def topslope(name):
    im=Image.open(p/f'{name}.png').convert('RGB')
    def edge(xx):
        X=int(cx+xx*s); run=0
        for y in range(int(cy-80*s), int(cy+720*s)):
            r,g,b=im.getpixel((X,y))
            if 85<r<140 and 60<g<105 and 35<b<75:
                run+=1
                if run>=3: return y-2
            else: run=0
        return None
    x1=int(cx+120*s); x2=int(cx+456*s)
    y1=edge(120); y2=edge(456)
    assert y1 is not None and y2 is not None,'frame edge missing in '+name
    return (y2-y1)/(x2-x1)
slope=topslope('tilted')
dropped=beads('dropped',BINS)
piled=beads('piled',BINS)
cleared=beads('cleared',BINS)
checks=[
 ('drop-lands',dropped>base+250,(dropped,base)),
 ('pour-piles',piled>15000,piled),
 ('swipe-clears',cleared<piled*0.15,(piled,cleared)),
 ('tilt-rotates',abs(slope)>0.05,round(slope,4)),
]
with open(p/'summary.txt','a') as f:
 for n,ok,value in checks:f.write(f'galton-{n} {"ok" if ok else "FAIL"} value={value}\n')
 # non-gating diagnostics: per-attempt bead count + delivered move events
 try:
  for line in (p/'clear-attempts.txt').read_text().splitlines():
   n,dur,cnt,mv=line.split()
   f.write(f'galton-swipe-attempt{n} info duration_ms={dur} beads={cnt} move_events={mv}\n')
 except FileNotFoundError: pass
print((p/'summary.txt').read_text())
assert all(ok for _,ok,_ in checks),'galton behavior failed'
with open(p/'summary.txt','a') as f:f.write('galton-session ok crash=no\n')
PY
