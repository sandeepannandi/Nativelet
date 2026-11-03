#!/usr/bin/env bash
# Focused native pixel evidence. Runs before unrelated full-suite tests.
set -eu
python3 -m pip install -q pillow
OUT=smoke-out/pin-art; mkdir -p "$OUT"
PKG=com.anonymous.nativeletshowcase
adb shell am force-stop "$PKG"; adb logcat -c
adb shell am start -W -a android.intent.action.VIEW -d 'nativelet-showcase:///pin-art' "$PKG" > "$OUT/start.txt"
sleep 9
bash scripts/android-system-ready.sh
sleep 2
shot(){ adb exec-out screencap -p > "$OUT/$1.png"; }
shot initial
# Find board bounds in pixels from its large dark background, not guessed dp.
python3 - "$OUT/initial.png" > "$OUT/coords.txt" <<'PY'
from PIL import Image
import sys
im=Image.open(sys.argv[1]).convert('RGB'); w,h=im.size
rows=[]
for y in range(int(h*.1),int(h*.85)):
 n=sum(1 for x in range(w//10,w*9//10) if max(im.getpixel((x,y)))<55)
 if n>w*.6: rows.append(y)
assert len(rows)>200,'Board absent / crash / blank canvas'
y0,y1=min(rows),max(rows);mid=(y0+y1)//2
xs=[x for x in range(w) if max(im.getpixel((x,mid)))<55];x0,x1=min(xs),max(xs)
sx=(x1-x0)/340;sy=(y1-y0)/414
print(int(x0+65*sx),int(y0+190*sy),int(x0+270*sx),int(y0+225*sy),int(x0+170*sx),int(y1+38*sy),x0,y0,x1,y1)
PY
read X Y EX EY WX WY BX BY RX RY < "$OUT/coords.txt"
adb shell input swipe "$X" "$Y" "$EX" "$EY" 1800
sleep 2;shot sculpted
sleep 4;shot held
adb shell input tap "$WX" "$WY"
sleep 6;shot flat
adb logcat -d > "$OUT/logcat.txt"
if grep -E "Process: $PKG|Process $PKG .*has died|ANR in $PKG|ReactNativeJS.*(Error|Exception)" "$OUT/logcat.txt";then echo 'pin-session FAIL crash_or_js_error' | tee "$OUT/summary.txt";exit 1;fi
python3 - "$OUT" "$BX" "$BY" "$RX" "$RY" <<'PY'
from PIL import Image,ImageChops,ImageStat
import sys
from pathlib import Path
p=Path(sys.argv[1]);bx,by,rx,ry=map(int,sys.argv[2:]);box=(bx+int((rx-bx)*.13),by+int((ry-by)*.32),bx+int((rx-bx)*.87),by+int((ry-by)*.66));imgs={k:Image.open(p/f'{k}.png').convert('RGB').crop(box) for k in ['initial','sculpted','held','flat']}
def diff(a,b):return sum(ImageStat.Stat(ImageChops.difference(imgs[a],imgs[b])).mean)/3
checks=[('sculpt',diff('initial','sculpted')>2,diff('initial','sculpted')),('retains',diff('sculpted','held')<1,diff('sculpted','held')),('wipe',diff('held','flat')>2,diff('held','flat'))]
# A wipe must also remove the seeded ring over the whole board interior.
full={k:Image.open(p/f'{k}.png').convert('RGB') for k in ['initial','flat']}
sx=(rx-bx)/340;sy=(ry-by)/414
interior=(int(bx+45*sx),int(by+60*sy),int(bx+300*sx),int(by+365*sy))
a=full['flat'].crop(interior)
b=full['flat'].crop((interior[0]+round(10*sx),interior[1],interior[2]+round(10*sx),interior[3]))
repeat=sum(ImageStat.Stat(ImageChops.difference(a,b)).mean)/3
whole=sum(ImageStat.Stat(ImageChops.difference(full['initial'].crop((bx,by,rx,ry)),full['flat'].crop((bx,by,rx,ry)))).mean)/3
checks.extend([('flat-grid',repeat<10,repeat),('not-seeded',whole>2,whole)])
for n,ok,value in checks:
 with open(p/'summary.txt','a') as f:f.write(f'pin-{n} {"ok" if ok else "FAIL"} pixel_diff={value:.3f}\n')
print((p/'summary.txt').read_text())
assert all(ok for _,ok,_ in checks),'Pin art behavior failed'
with open(p/'summary.txt','a') as f:f.write('pin-session ok crash=no\n')
PY
