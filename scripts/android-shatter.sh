#!/usr/bin/env bash
# Glass Shatter behavior evidence: a tap on the pane breaks it, the shards fall
# out of the frame, and a fresh launch shows an intact pane again. Claims are
# screenshot comparisons, a crash check and the system frame statistics
# (gfxinfo) taken while the shards fall. Emulator frame pacing is not a phone.
set -u
OUT=smoke-out/shatter; mkdir -p "$OUT"
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


SIZE=$(adb shell wm size | grep -o '[0-9]*x[0-9]*' | tail -1); W=${SIZE%x*}; H=${SIZE#*x}
CX=$((W / 2)); CY=$((H / 2 - H / 20))
python3 -m pip install -q pillow >/dev/null 2>&1 || true
# Fraction of sampled pixels in the middle of the screen (where the pane sits)
# that differ clearly between two screenshots. The picture behind the glass
# stays when the shards are gone; only the glass lights, rim and shards move.
pdiff() { python3 - "$OUT/$1.png" "$OUT/$2.png" <<'PY'
import sys
from PIL import Image
a=Image.open(sys.argv[1]).convert("RGB");b=Image.open(sys.argv[2]).convert("RGB");w,h=a.size
n=m=0
for y in range(int(h*0.30),int(h*0.55),6):
    for x in range(int(w*0.25),int(w*0.75),6):
        p=a.getpixel((x,y));q=b.getpixel((x,y));n+=1
        if max(abs(p[i]-q[i]) for i in range(3))>22: m+=1
print(f"{m/max(1,n):.2f}")
PY
}
# Share of those pixels that are page background (picture missing).
bgshare() { python3 - "$OUT/$1.png" <<'PY'
import sys
from PIL import Image
im=Image.open(sys.argv[1]).convert("RGB");w,h=im.size
bg=im.getpixel((int(w*0.04),int(h*0.5)))
n=m=0
for y in range(int(h*0.30),int(h*0.55),6):
    for x in range(int(w*0.25),int(w*0.75),6):
        p=im.getpixel((x,y));n+=1
        if max(abs(p[i]-bg[i]) for i in range(3))<=14: m+=1
print(f"{m/max(1,n):.2f}")
PY
}
open shatter; sleep 6; shot shatter-intact
adb logcat -d | grep -h "SHATTER_BENCH" | head -3 | sed "s/.*SHATTER_BENCH/shatter-bench/" | tee -a "$OUT/summary.txt"
sleep 2; shot shatter-intact2
report shatter-static-until-touched shatter-intact shatter-intact2
I=$(bgshare shatter-intact)
adb shell dumpsys gfxinfo "$PKG" reset >/dev/null 2>&1
adb shell "screenrecord --time-limit 7 --size 540x1170 /sdcard/shatter.mp4" >/dev/null 2>&1 &
RECPID=$!
sleep 0.8
adb shell input tap $CX $CY
sleep 0.35; shot shatter-mid
shot shatter-burst-1; shot shatter-burst-2; shot shatter-burst-3
sleep 0.6; shot shatter-fall
adb shell dumpsys gfxinfo "$PKG" > "$OUT/shatter-gfxinfo.txt" 2>&1
sleep 3.5; shot shatter-gone
report shatter-tap-breaks shatter-intact shatter-mid
report shatter-shards-fall shatter-mid shatter-gone
G=$(bgshare shatter-gone)
# The emulator renders slowly and the hit can land a moment after the tap, so
# take the strongest difference over the whole falling sequence.
D1=0; for f in shatter-mid shatter-burst-1 shatter-burst-2 shatter-burst-3 shatter-fall; do
  d=$(pdiff shatter-intact $f); D1=$(python3 -c "print(max($D1,$d))")
done
PEAK=shatter-fall
D2=$(pdiff shatter-fall shatter-gone)
D3=$(pdiff shatter-intact shatter-gone)
echo "shatter-change intact->peak=$D1 fall->gone=$D2 intact->gone=$D3 bg_share_intact=$I bg_share_gone=$G" | tee -a "$OUT/summary.txt"
# Some frame must show the broken pane (clearly different from the whole one),
# the final state must differ from that frame, the pane must end clear of
# shards, and the picture must still be there (not blank page background).
if python3 -c "import sys;sys.exit(0 if float('$D1')>=0.15 and float('$D2')>=0.10 and float('$D3')<=0.10 and float('$I')<=0.35 and float('$G')<=0.35 else 1)"; then
  echo "shatter-breaks-and-clears ok" | tee -a "$OUT/summary.txt"
else
  echo "shatter-breaks-and-clears NOT-ok" | tee -a "$OUT/summary.txt"; SHATTER_FAIL=1
fi
# Frame statistics for the first ~1.5 s after the hit, when most shards are live.
grep -E "Total frames rendered|Janky frames|50th percentile|90th percentile|95th percentile|99th percentile" "$OUT/shatter-gfxinfo.txt" | head -6 | sed 's/^/shatter-gfxinfo: /' | tee -a "$OUT/summary.txt"
timeout 30 tail --pid=$RECPID -f /dev/null 2>/dev/null; kill $RECPID 2>/dev/null; timeout 60 adb pull /sdcard/shatter.mp4 "$OUT/shatter-fall.mp4" >/dev/null 2>&1 || true
# Interactive Reset: the Reset glass button must put a whole pane back, and the
# new pane must break again when tapped.
# Find the dark "Reset glass" button in the screenshot (first dark navy blob
# below the pane), so no uiautomator dump is needed on an animating screen.
RC=$(python3 - "$OUT/shatter-gone.png" <<'PY'
import sys
from PIL import Image
im=Image.open(sys.argv[1]).convert("RGB");w,h=im.size
xs=[];ys=[]
for y in range(int(h*0.66),int(h*0.82),4):
    for x in range(0,int(w*0.4),4):
        r,g,b=im.getpixel((x,y))
        if abs(r-31)<14 and abs(g-58)<14 and abs(b-95)<14: xs.append(x);ys.append(y)
if len(xs)>40: print((min(xs)+max(xs))//2,(min(ys)+max(ys))//2)
PY
)
echo "reset button at: ${RC:-not found}"
if [ -n "$RC" ]; then
  adb shell input tap $RC; sleep 1.5; shot shatter-reset
  RD=$(pdiff shatter-intact shatter-reset)
  adb shell input tap $CX $CY; sleep 0.4; shot shatter-reset-mid
  RB=$(pdiff shatter-reset shatter-reset-mid)
  sleep 3.5; shot shatter-reset-gone
  if python3 -c "import sys;sys.exit(0 if float('$RD')<=0.05 and float('$RB')>=0.15 else 1)"; then echo "shatter-interactive-reset reset_vs_intact=$RD breaks_again=$RB ok" | tee -a "$OUT/summary.txt"
  else echo "shatter-interactive-reset reset_vs_intact=$RD breaks_again=$RB NOT-ok" | tee -a "$OUT/summary.txt"; SHATTER_FAIL=1; fi
else echo "shatter-interactive-reset NO-RESET-BUTTON-FOUND" | tee -a "$OUT/summary.txt"; SHATTER_FAIL=1; fi
adb logcat -d > "$OUT/shatter-session1.logcat.txt"
# Relaunch: the pane is whole again (same as the first screenshot).
open shatter; shot shatter-relaunch
R=$(pdiff shatter-intact shatter-relaunch)
if python3 -c "import sys;sys.exit(0 if float('$R')<=0.05 else 1)"; then echo "shatter-relaunch-intact diff=$R" | tee -a "$OUT/summary.txt"
else echo "shatter-relaunch-intact diff=$R NOT-intact" | tee -a "$OUT/summary.txt"; SHATTER_FAIL=1; fi
adb logcat -d > "$OUT/shatter-session.logcat.txt"
CR=no; cat "$OUT/shatter-session1.logcat.txt" "$OUT/shatter-session.logcat.txt" | grep -E "Process: $PKG|Process $PKG .*has died|ANR in $PKG" | grep -q . && CR=yes
echo "shatter-session crash=$CR" | tee -a "$OUT/summary.txt"
[ "$CR" = no ] || SHATTER_FAIL=1
[ -z "${SHATTER_FAIL:-}" ] || { echo "glass shatter behavior check failed"; exit 1; }
