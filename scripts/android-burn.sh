#!/usr/bin/env bash
set -euo pipefail
OUT=burn-out; rm -rf "$OUT"; mkdir -p "$OUT"
dump_diag() {
  adb logcat -b all -d > "$OUT/exit-logcat.txt" 2>&1 || true
  echo "=== app lifecycle diagnostics ==="
  grep -E "am_proc_died|am_proc_start|am_kill|am_crash|am_anr|wm_proc_died|wm_destroy_activity|wm_finish_activity|wm_pause_activity|Fatal signal|FATAL EXCEPTION|F DEBUG|tombstone|Process .*nativeletshowcase|ReactNativeJS|ReactNative:|Skia|RNSkia|SkSL|AndroidRuntime: Shutting down VM|lowmemorykiller|lmkd.*(kill|Kill)|has died|Force finishing|nativeletshowcase.*(crash|died|killed)" "$OUT/exit-logcat.txt" | grep -vE "uiautomator|dvm_lock_sample|chatty" | head -120 || true
  echo "=== burn logs (non-heartbeat) ==="
  grep -F "[burn]" "$OUT/exit-logcat.txt" | grep -vF "[burn] hb" | head -40 | cut -c1-220 || true
  echo "=== burn heartbeats (last 12) ==="
  grep -F "[burn] hb" "$OUT/exit-logcat.txt" | tail -12 | cut -c1-220 || true
  echo "=== end burn logs ==="
  echo "--- app pid now: $(adb shell pidof com.anonymous.nativeletshowcase 2>&1 | head -1)"
  echo "--- last 40 lines mentioning the app package:"
  grep -F "com.anonymous.nativeletshowcase" "$OUT/exit-logcat.txt" | grep -v dvm_lock_sample | tail -40 | cut -c1-260 || true
  echo "=== end lifecycle ==="
  echo "=== foreground activity ==="
  adb shell dumpsys activity activities 2>/dev/null | grep -E "mResumedActivity|topResumedActivity" | head -3 || true
  echo "=== end diagnostics ==="
}
trap dump_diag EXIT
PKG=com.anonymous.nativeletshowcase
adb install -r "$1"
adb logcat -c
adb shell am start -W -a android.intent.action.VIEW -d 'nativelet-showcase:///burn-dismiss' "$PKG"
# The card mounts only after the JS bundle and the Geist typeface decode, which
# can take a while on a cold emulator. Poll the UI tree until it appears.
FOUND=""
for i in $(seq 1 24); do
  sleep 5
  adb shell rm -f /sdcard/burn.xml
  # uiautomator sometimes returns a null root node while the app is busy; retry on the next poll.
  adb shell uiautomator dump /sdcard/burn.xml >/dev/null 2>&1 || continue
  adb pull /sdcard/burn.xml "$OUT/ui.xml" >/dev/null 2>&1 || continue
  if grep -q "A postcard you can burn away" "$OUT/ui.xml"; then FOUND=1; break; fi
done
if [ -z "$FOUND" ]; then
  echo "Burn card never mounted. Visible content-desc values:"
  grep -o 'content-desc="[^"]*"' "$OUT/ui.xml" | sort -u | head -20 || true
  echo "Visible text values:"
  grep -o 'text="[^"]*"' "$OUT/ui.xml" | sort -u | head -20 || true
  adb exec-out screencap -p > "$OUT/stuck.png"
fi
adb exec-out screencap -p > "$OUT/initial.png"
python3 -m pip install -q pillow numpy
python3 - <<'PY'
import xml.etree.ElementTree as E,re,json
nodes=list(E.parse('burn-out/ui.xml').iter('node'))
n=next((n for n in nodes if n.get('content-desc','').startswith('A postcard you can burn away')),None)
assert n is not None,'Burn Dismiss card missing, renderer may have failed'
a=list(map(int,re.findall(r'\d+',n.get('bounds'))));assert len(a)==4
json.dump(a,open('burn-out/geometry.json','w'))
r=next((n for n in nodes if n.get('text')=='Restore'),None)
assert r is not None,'Restore control missing'
b=list(map(int,re.findall(r'\d+',r.get('bounds'))));assert len(b)==4
json.dump(b,open('burn-out/restore.json','w'))
PY
read -r X Y < <(python3 - <<'PY'
import json
x,y,r,b=json.load(open('burn-out/geometry.json'));w=r-x;h=b-y
print(int(x+w*.5),int(y+h*.55))
PY
)
read -r RX RY < <(python3 - <<'PY'
import json
x,y,r,b=json.load(open('burn-out/restore.json'))
print((x+r)//2,(y+b)//2)
PY
)
# Touch and hold to ignite, keep feeding the fire for 4s.
# A real finger drifts a few pixels while held; a zero-length swipe may be dropped.
adb shell input swipe "$X" "$Y" "$((X + 6))" "$((Y + 6))" 8000 &
SWP=$!
for t in 1 2 3 4 5 6 7; do
  sleep 1
  adb exec-out screencap -p > "$OUT/burning_t$t.png"
done
wait $SWP
sleep 0.5
adb exec-out screencap -p > "$OUT/burning.png"
# Diagnostics: coarse luminance grid of the card over time (rows top to bottom).
python3 - <<'PY'
from PIL import Image
import numpy as np,json
x,y,r,b=json.load(open('burn-out/geometry.json'))
for n in ['initial','burning_t2','burning_t4','burning_t7','burning']:
    try: im=np.array(Image.open('burn-out/'+n+'.png').convert('L'))[y:b,x:r].astype(float)
    except Exception as e: print(n,'missing',e); continue
    h,w=im.shape;gh,gw=16,10
    print('== grid',n,'card',w,'x',h,'mean',round(im.mean(),1))
    for i in range(gh):
        print(' '.join('%3d'%int(im[i*h//gh:(i+1)*h//gh,j*w//gw:(j+1)*w//gw].mean()) for j in range(gw)))
PY
# Restore and let the front rewind fully.
adb shell input tap "$RX" "$RY"
# The restore rewinds the whole burn at wall-clock pace; on the ~1 fps emulator an 8s burn needs about 7s to rewind.
sleep 14
adb exec-out screencap -p > "$OUT/restored.png"
adb logcat -d > "$OUT/logcat.txt"
python3 - <<'PY'
from PIL import Image
import numpy as np,json,re
x,y,r,b=json.load(open('burn-out/geometry.json'));w=r-x;h=b-y
def load(n):return np.array(Image.open('burn-out/'+n+'.png').convert('RGB'))[y:b,x:r].astype(float)
a,c,d=map(load,['initial','burning','restored'])
# Touch window around the ignition point (0.5, 0.55 of the card).
cx,cy=int(w*.5),int(h*.55);rad=int(min(w,h)*.18)
sl=np.s_[cy-rad:cy+rad,cx-rad:cx+rad]
# Paper ignited: the window went from light paper/photo to charred dark.
assert a[sl].mean()>120,'Touch window was not light paper before ignition'
assert c[sl].mean()<a[sl].mean()*.6,'Paper did not char dark at the touch point'
# Glowing edge somewhere on the card: hot orange-white pixels.
glow=(c[:,:,0]>200)&(c[:,:,1]>110)&(c[:,:,2]<130)&(c[:,:,0]>c[:,:,1]+40)
print('glow pixels',int(glow.sum()))
assert glow.sum()>40,'No glowing burn edge rendered'
# The burn visibly changed the scene.
print('mean abs change',np.abs(a-c).mean())
assert np.abs(a-c).mean()>6,'No rendered scene change from burning'
# Restore rewinds the burn to the original card.
rd=np.abs(a-d).mean();print('restored diff',rd)
assert rd<8,'Restore did not bring the card back'
log=open('burn-out/logcat.txt').read();assert log.strip(),'Missing native logs'
assert not re.search(r'Process: com\.anonymous\.nativeletshowcase[^\n]*|ANR in com\.anonymous\.nativeletshowcase|Cmdline: com\.anonymous\.nativeletshowcase|>>> com\.anonymous\.nativeletshowcase <<<|Shader compilation failed|Burn renderer unavailable',log),'Native crash or shader failure'
open('burn-out/summary.txt','w').write('PASS native burn render, touch-hold ignition with char and glowing edge, exact restore, no detected crash on tested path\n')
PY
