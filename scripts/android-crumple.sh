#!/usr/bin/env bash
# Paper Crumple behavior evidence: a corner drag crumples the sheet, a flick
# moves the ball, and a double tap smooths it open. Every claim is a screenshot
# comparison plus a crash check; this does not measure frame rate.
set -u
OUT=smoke-out/crumple; mkdir -p "$OUT"
PKG=com.anonymous.nativeletshowcase
APK=$(ls apps/showcase/android/app/build/outputs/apk/*/app-*.apk 2>/dev/null | head -1)
if [ -n "$APK" ] && command -v aapt >/dev/null 2>&1; then
  DETECTED=$(grep -o "package name=.[a-zA-Z0-9._]*" <<<"$(aapt dump badging "$APK" 2>/dev/null)" | head -1 | cut -d"'" -f2)
  [ -n "$DETECTED" ] && PKG=$DETECTED
fi
open() {
  adb shell am force-stop "$PKG"; adb logcat -c
  adb shell am start -W -a android.intent.action.VIEW -d "nativelet-showcase:///$1" "$PKG" >/dev/null 2>&1
  sleep 6
  adb shell dumpsys window 2>/dev/null | grep -q "mCurrentFocus.*$PKG" || {
    adb shell am start -W -a android.intent.action.VIEW -d "nativelet-showcase:///$1" "$PKG" >/dev/null 2>&1
    sleep 4
  }
  sleep 2
}
shot() { adb exec-out screencap -p > "$OUT/$1.png"; }
report() {
  A=$(md5sum < "$OUT/$2.png" | cut -c1-8); B=$(md5sum < "$OUT/$3.png" | cut -c1-8)
  CR=no; adb logcat -d | grep -E "Process: $PKG|Process $PKG .*has died|ANR in $PKG" | grep -q . && CR=yes
  [ "$CR" = yes ] && adb logcat -d > "$OUT/$1.crash.logcat.txt"
  echo "$1 crash=$CR changed=$([ "$A" != "$B" ] && echo yes || echo no)" | tee -a "$OUT/summary.txt"
}

# Screen centre: the demo card is centred on screen, so its sheet centre sits
# near the middle of the display.
SIZE=$(adb shell wm size | grep -o '[0-9]*x[0-9]*' | tail -1); W=${SIZE%x*}; H=${SIZE#*x}
CX=$((W / 2)); CY=$((H / 2 - H / 20))
open crumple; sleep 1; shot crumple-flat
# The flat sheet is static until touched.
sleep 2; shot crumple-flat2
report crumple-static-until-touched crumple-flat crumple-flat2
# Drag a corner of the sheet toward the middle.
adb shell input swipe $((CX + W / 6)) $((CY + H / 9)) $CX $CY 900 &
sleep 0.5; shot crumple-mid
wait
sleep 1.5
# Emulator frame pacing varies, so make sure the sheet really ended as a ball:
# a second drag from the same corner area continues the crumple.
adb shell input swipe $((CX + W / 7)) $((CY + H / 12)) $CX $CY 700
sleep 1.5; shot crumple-ball
# Where did the ball end up? Locate it in the screenshot so the flick and the
# double tap start on the ball itself, wherever the drag left it.
ballpos() { python3 - "$OUT/$1.png" <<'PY'
import sys
from PIL import Image
im=Image.open(sys.argv[1]).convert("RGB");w,h=im.size
bg=im.getpixel((int(w*0.04),int(h*0.5)))
xs=[];ys=[]
for y in range(int(h*0.12),int(h*0.68),4):
    for x in range(0,w,4):
        p=im.getpixel((x,y))
        if max(abs(p[i]-bg[i]) for i in range(3))>40: xs.append(x);ys.append(y)
print((min(xs)+max(xs))//2,(min(ys)+max(ys))//2)
PY
}
read BX BY <<< "$(ballpos crumple-ball)"; echo "ball at $BX,$BY"
report crumple-corner-drag crumple-flat crumple-ball
report crumple-drag-progress crumple-mid crumple-ball
# Flick the ball to the right: it must move.
adb shell input swipe $BX $BY $((BX + W / 4)) $((BY - H / 25)) 90
sleep 0.25; shot crumple-toss-1
sleep 2.5; shot crumple-toss-2
report crumple-flick-moves crumple-ball crumple-toss-2
read BX BY <<< "$(ballpos crumple-toss-2)"; echo "ball now at $BX,$BY"
# Double tap the ball: it smooths back to a sheet.
# Two taps launched together: each `input tap` spawns a JVM, so back-to-back
# calls can land far apart and would not be a double tap at all.
adb shell "input tap $BX $BY & sleep 0.08; input tap $BX $BY; wait"
sleep 3; shot crumple-smooth
report crumple-double-tap-opens crumple-toss-2 crumple-smooth
# The reopened sheet must cover the corners of the original flat sheet again.
# Not a byte match: remembered creases are meant to stay faintly visible.
python3 -m pip install -q pillow >/dev/null 2>&1 || true
if python3 - "$OUT" <<'PY'
import sys
from PIL import Image
o=sys.argv[1]
def px(n): return Image.open(f"{o}/{n}.png").convert("RGB")
flat,ball,smooth=px("crumple-flat"),px("crumple-toss-2"),px("crumple-smooth")
w,h=flat.size
bg=flat.getpixel((int(w*0.04),int(h*0.5)))
d=lambda a,b:max(abs(a[i]-b[i]) for i in range(3))
# sheet bounding box: pixels clearly lighter than the background, mid screen
xs=[];ys=[]
for y in range(int(h*0.15),int(h*0.65),6):
    for x in range(0,w,6):
        if d(flat.getpixel((x,y)),bg)>10: xs.append(x);ys.append(y)
x0,x1,y0,y1=min(xs),max(xs),min(ys),max(ys)
ix,iy=int((x1-x0)*0.14),int((y1-y0)*0.10)
pts=[(x0+ix,y0+iy),(x1-ix,y0+iy),(x0+ix,y1-iy),(x1-ix,y1-iy)]
covered=lambda im:sum(d(im.getpixel(p),bg)>10 for p in pts)
print(f"sheet corners covered: ball={covered(ball)}/4 smooth={covered(smooth)}/4")
sys.exit(0 if covered(ball)<=1 and covered(smooth)>=3 else 1)
PY
then echo "crumple-double-tap-reopens-sheet corners=covered" | tee -a "$OUT/summary.txt"
else echo "crumple-double-tap-reopens-sheet corners=NOT-covered" | tee -a "$OUT/summary.txt"; CRUMPLE_FAIL=1; fi
adb logcat -d > "$OUT/crumple-session.logcat.txt"
CR=no; grep -E "Process: $PKG|Process $PKG .*has died|ANR in $PKG" "$OUT/crumple-session.logcat.txt" | grep -q . && CR=yes
echo "crumple-session crash=$CR" | tee -a "$OUT/summary.txt"
[ -z "${CRUMPLE_FAIL:-}" ] || { echo "double tap did not restore the sheet"; exit 1; }
