#!/usr/bin/env bash
# Pottery Wheel buttons on a real emulator: New clay resets the shaped pot, Slow motion toggles its selected state.
# Runs after android-pottery.sh, on the same still-running app with the pot already shaped.
set -eu
python3 -m pip install -q pillow numpy
OUT=smoke-out/pottery; PKG=com.anonymous.nativeletshowcase
trap 'adb logcat -d > "$OUT/logcat-controls.txt" 2>&1 || true' EXIT
adb logcat -c
dump(){ timeout 20 adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb pull /sdcard/ui.xml "$OUT/ui-$1.xml" >/dev/null 2>&1; }
node_info(){ python3 - "$OUT/ui-$1.xml" "$2" <<'PY'
import sys,re,xml.etree.ElementTree as E
for n in E.parse(sys.argv[1]).getroot().iter('node'):
    t=(n.get('text') or '')+' '+(n.get('content-desc') or '')
    if sys.argv[2] in t:
        b=list(map(int,re.findall(r'\d+',n.get('bounds'))));print((b[0]+b[2])//2,(b[1]+b[3])//2,n.get('selected'));break
else: raise SystemExit('button not found: '+sys.argv[2])
PY
}
dump a
read -r SX SY SSEL < <(node_info a 'Slow motion')
read -r NX NY _ < <(node_info a 'New clay')
echo "slow=($SX,$SY) selected=$SSEL new=($NX,$NY)"
[ "$SSEL" = false ] || { echo 'pottery-slow FAIL initial_selected' >> "$OUT/summary.txt"; exit 1; }
adb exec-out screencap -p > "$OUT/before-new.png"
adb shell input tap "$NX" "$NY"; sleep 2
adb exec-out screencap -p > "$OUT/after-new.png"
adb shell input tap "$SX" "$SY"; sleep 1
dump b; read -r _ _ SEL_ON < <(node_info b 'Slow motion')
for i in 1 2 3; do adb exec-out screencap -p > "$OUT/slow-$i.png"; sleep 0.2; done
adb shell input tap "$SX" "$SY"; sleep 1
dump c; read -r _ _ SEL_OFF < <(node_info c 'Slow motion')
for i in 1 2 3; do adb exec-out screencap -p > "$OUT/norm-$i.png"; sleep 0.2; done
python3 - "$OUT" "$SEL_ON" "$SEL_OFF" <<'PY'
import sys,json,numpy as np
from PIL import Image
out,on,off=sys.argv[1:4];g=json.load(open(out+'/geom.json'));bg=np.array([0xec,0xe7,0xde])
def arr(n):return np.array(Image.open(f'{out}/{n}.png').convert('RGB')).astype(int)
# Waist row: re-derive from the initial image the same way the drag script did (middle of clay column).
im0=arr('initial');s=g['s'];cx=int(g['x0']+180*s);base=int(g['y0']+372*s)
col=np.abs(im0[g['y0']:g['y1'],cx]-bg).max(axis=1)>12;top=int(np.where(col)[0].min()+g['y0']);y=(top+base)//2
def w(n):
    r=np.abs(arr(n)[y-4:y+5,g['x0']:g['x1']+1]-bg).max(axis=2)>12;return float(r.sum(axis=1).mean())
wi,wb,wa=w('initial'),w('before-new'),w('after-new')
def motion(p):
    a=[arr(f'{p}-{i}') for i in (1,2,3)];box=(slice(g['y0'],g['y1']),slice(g['x0'],g['x1']+1))
    return float(np.mean([np.abs(a[i][box]-a[i+1][box]).mean() for i in (0,1)]))
ms,mn=motion('slow'),motion('norm')
lines=[]
reset=abs(wa-wi)<wi*0.12 and abs(wb-wi)>wi*0.12
lines.append(f'pottery-newclay {"ok" if reset else "FAIL"} initial_width={wi:.1f} shaped_width={wb:.1f} after_tap_width={wa:.1f}')
tog=(on=='true' and off=='false')
lines.append(f'pottery-slow-toggle {"ok" if tog else "FAIL"} selected_on={on} selected_after_second_tap={off}')
lines.append(f'pottery-slow-motion-pixels info slow_frame_delta={ms:.3f} normal_frame_delta={mn:.3f} (informational, not gated)')
open(out+'/summary.txt','a').write('\n'.join(lines)+'\n');print('\n'.join(lines))
assert reset and tog,'Pottery controls failed'
PY
if grep -E "Process: $PKG|ANR in $PKG|ReactNativeJS.*(Error|Exception)" <(adb logcat -d); then echo 'pottery-controls FAIL crash_or_js_error' >> "$OUT/summary.txt"; exit 1; fi
echo 'pottery-controls ok crash=no' >> "$OUT/summary.txt"
