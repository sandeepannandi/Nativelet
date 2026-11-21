#!/usr/bin/env bash
# Native Skia evidence for Domino Run: panel renders with standing dominoes,
# a real touch on "Push the first" topples the cascade, "Stand them up"
# restores the scene, no crash.
set -eu
python3 -m pip install -q pillow numpy
OUT=smoke-out/domino; rm -rf "$OUT"; mkdir -p "$OUT"
PKG=com.anonymous.nativeletshowcase
trap 'adb logcat -d > "$OUT/logcat.txt" 2>&1 || true' EXIT
adb shell am force-stop "$PKG"; adb logcat -c
adb shell am start -W -a android.intent.action.VIEW -d 'nativelet-showcase:///domino-run' "$PKG" > "$OUT/start.txt"
sleep 10
bash scripts/android-system-ready.sh
sleep 2
adb exec-out screencap -p > "$OUT/initial.png"
python3 - "$OUT/initial.png" "$OUT/geom.json" <<'PY'
import sys,json,numpy as np
from PIL import Image
im=np.array(Image.open(sys.argv[1]).convert('RGB')).astype(int)
h,w,_=im.shape
bg=np.array([0xec,0xe7,0xde])
m=(np.abs(im-bg).max(axis=2)<=5)
ys,xs=np.where(m)
assert len(xs)>20000,'Domino panel not rendered'
x0,x1,y0,y1=int(xs.min()),int(xs.max()),int(ys.min()),int(ys.max())
panel=im[y0:y1+1,x0:x1+1]
pip=np.array([0x45,0x3c,0x34])
pips=int((np.abs(panel-pip).max(axis=2)<=25).sum())
assert pips>300,'standing dominoes not rendered (pip pixels=%d)'%pips
# Control labels sit below the panel in #31513b; cluster them left to right:
# Push the first, Stand them up, Slow motion.
lab=np.array([0x31,0x51,0x3b])
strip=im[y1+2:min(y1+150,h),:]
lm=(np.abs(strip-lab).max(axis=2)<=25)
rows,cols=np.where(lm)
assert len(cols)>100,'control labels not found'
order=np.sort(cols); gaps=np.where(np.diff(order)>15)[0]
starts=np.concatenate([[0],gaps+1]); ends=np.concatenate([gaps,[len(order)-1]])
clus=[(int(order[s]),int(order[e])) for s,e in zip(starts,ends) if order[e]-order[s]>10]
clus.sort()
assert len(clus)>=3,'expected 3 control buttons, found %d'%len(clus)
cy=int(np.median(rows))+y1+2
push_x=(clus[0][0]+clus[0][1])//2
stand_x=(clus[1][0]+clus[1][1])//2
json.dump(dict(x0=x0,x1=x1,y0=y0,y1=y1,pips=pips,push_x=push_x,stand_x=stand_x,cy=cy),open(sys.argv[2],'w'))
print(json.dumps(dict(pips=pips,push_x=push_x,stand_x=stand_x,cy=cy)))
PY
read -r PUSHX PUSHY STX STY < <(python3 -c "import json;g=json.load(open('$OUT/geom.json'));print(g['push_x'],g['cy'],g['stand_x'],g['cy'])")
echo "tap push=($PUSHX,$PUSHY) stand=($STX,$STY)"
adb shell input tap "$PUSHX" "$PUSHY"
sleep 6
adb exec-out screencap -p > "$OUT/fallen.png"
adb shell input tap "$STX" "$STY"
sleep 3
adb exec-out screencap -p > "$OUT/reset.png"
python3 - "$OUT" <<'PY'
import sys,json,numpy as np
from PIL import Image
out=sys.argv[1]
g=json.load(open(out+'/geom.json'))
x0,x1,y0,y1=g['x0'],g['x1'],g['y0'],g['y1']
def panel(p):
    im=np.array(Image.open(p).convert('RGB')).astype(int)
    return im[y0:y1+1,x0:x1+1]
a,b,c=panel(out+'/initial.png'),panel(out+'/fallen.png'),panel(out+'/reset.png')
d01=float((np.abs(a-b).max(axis=2)>20).mean())
d02=float((np.abs(a-c).max(axis=2)>20).mean())
pip=np.array([0x45,0x3c,0x34])
pips_fallen=int((np.abs(b-pip).max(axis=2)<=25).sum())
toppled=d01>0.08
restored=d02<d01*0.6
assert pips_fallen>150,'scene blank after cascade (pip pixels=%d)'%pips_fallen
print(json.dumps(dict(cascade_diff=round(d01,4),reset_diff=round(d02,4),toppled=toppled,restored=restored,pips_fallen=pips_fallen)))
assert toppled,'cascade did not change the scene (diff=%.4f)'%d01
assert restored,'stand-up did not restore the scene (reset diff=%.4f vs cascade %.4f)'%(d02,d01)
json.dump(dict(toppled=toppled,restored=restored,cascade_diff=d01,reset_diff=d02),open(out+'/verdict.json','w'))
PY
adb logcat -d > "$OUT/logcat.txt" 2>&1 || true
CRASH=no
grep -E "Process: $PKG|Process $PKG .*has died|ANR in $PKG" "$OUT/logcat.txt" | grep -q . && CRASH=yes
JSERR=$(grep -cE 'ReactNativeJS.*(Error|error)' "$OUT/logcat.txt" || true)
ALIVE=$(adb shell pidof "$PKG" | tr -d '\r')
[ "$CRASH" = no ] || { echo "domino crash detected"; exit 1; }
[ "$JSERR" = 0 ] || { echo "domino JS errors: $JSERR"; exit 1; }
[ -n "$ALIVE" ] || { echo "domino app not alive"; exit 1; }
echo "domino crash=$CRASH jserr=$JSERR alive=yes render=yes toppled=yes reset=yes" | tee "$OUT/summary.txt" | tee -a smoke-out/summary.txt
