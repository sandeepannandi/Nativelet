#!/usr/bin/env bash
# Plasma Globe behavior evidence, asserted on filament-colored pixels: the
# globe renders with live filaments, the picture keeps changing while
# untouched, a held touch gathers the filaments at the fingertip (white-hot
# pixel mass near the finger climbs), a drag moves that mass with the
# finger, release scatters it away again, and nothing crashes. No
# accessibility dumps because uiautomator never idles on animating Skia.
set -u
OUT=smoke-out/plasma; mkdir -p "$OUT"
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
crashline() {
  CR=no; adb logcat -d | grep -E "Process: $PKG|Process $PKG .*has died|ANR in $PKG" | grep -q . && CR=yes
  [ "$CR" = yes ] && adb logcat -d > "$OUT/$1.crash.logcat.txt"
  echo "$CR"
}
FAIL=0
expect() {
  if [ "$3" = yes ]; then echo "$1 ok $2" | tee -a "$OUT/summary.txt";
  else echo "$1 FAIL $2" | tee -a "$OUT/summary.txt"; FAIL=1; fi
}
python3 -m pip install -q pillow numpy >/dev/null 2>&1 || true

# glow FILE -> "count cx cy": violet/pink filament pixels (halo, body, core)
# and their centroid. The globe disc is dark, so these are the filaments.
glow() { python3 - "$OUT/$1.png" <<'PYS'
import sys
from PIL import Image
import numpy as np
a = np.asarray(Image.open(sys.argv[1]).convert("RGB"), dtype=np.int16)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
m = (r > 170) & (b > 190) & (g < 235) & (r + b > 420)
n = int(m.sum())
if n < 30:
    print(f"{n} 0 0"); sys.exit(0)
ys, xs = np.where(m)
print(f"{n} {int(xs.mean())} {int(ys.mean())}")
PYS
}
# hot FILE X Y R -> count of white-hot pixels within R px of (X, Y).
hot() { python3 - "$OUT/$1.png" "$2" "$3" "$4" <<'PYH'
import sys
from PIL import Image
import numpy as np
a = np.asarray(Image.open(sys.argv[1]).convert("RGB"), dtype=np.int16)
x0, y0, rad = int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
h, w, _ = a.shape
yy, xx = np.mgrid[0:h, 0:w]
near = (xx - x0) ** 2 + (yy - y0) ** 2 <= rad * rad
r, g, b = a[..., 0], a[..., 1], a[..., 2]
m = (r > 225) & (g > 190) & (b > 225) & near
print(int(m.sum()))
PYH
}
banddiff() { python3 - "$OUT/$1.png" "$OUT/$2.png" <<'PYD'
import sys
from PIL import Image, ImageChops
A = Image.open(sys.argv[1]).convert("RGB")
B = Image.open(sys.argv[2]).convert("RGB")
w, h = A.size
box = (int(w * 0.08), int(h * 0.15), int(w * 0.92), int(h * 0.7))
hst = ImageChops.difference(A.crop(box), B.crop(box)).convert("L").histogram()
print(sum(i * v for i, v in enumerate(hst)) / ((box[2]-box[0]) * (box[3]-box[1])))
PYD
}
gt() { python3 -c "import sys; sys.exit(0 if float('$1') > float('$2') else 1)"; }
lt() { python3 -c "import sys; sys.exit(0 if float('$1') < float('$2') else 1)"; }

DENS=$(adb shell wm density 2>/dev/null | grep -o '[0-9]\+' | tail -1); DENS=${DENS:-420}
SC=$(python3 -c "print($DENS / 160)")

open plasma-globe; sleep 3; shot pg-early
read N0 CX CY <<<"$(glow pg-early)"
CR=$(crashline plasma-open)
OK=no; { [ "$CR" = no ] && gt "$N0" 1500 && gt "$CX" 0; } && OK=yes
expect plasma-renders "crash=$CR filament_px=$N0 centroid=$CX,$CY" "$OK"

# 1. untouched, the filaments keep moving.
sleep 1; shot pg-a; sleep 1; shot pg-b
D=$(banddiff pg-a pg-b)
OK=no; gt "$D" 0.5 && OK=yes
expect plasma-animates "band_diff=$D" "$OK"

# 2. a held touch gathers the filaments at the fingertip. Touch off-centre
# so a gathered mass cannot be mistaken for the electrode.
TX=$(python3 -c "print(int($CX + 64 * $SC))"); TY=$(python3 -c "print(int($CY - 30 * $SC))")
RAD=$(python3 -c "print(int(26 * $SC))")
H0=$(hot pg-b $TX $TY $RAD)
adb shell input swipe $TX $TY $TX $TY 6000 &
SW=$!
sleep 2; shot pg-held
H1=$(hot pg-held $TX $TY $RAD)
CR=$(crashline plasma-hold)
OK=no; { [ "$CR" = no ] && gt "$H1" "$(python3 -c "print($H0 * 2 + 60)")"; } && OK=yes
expect plasma-touch-gathers "crash=$CR hot_before=$H0 hot_held=$H1" "$OK"
wait $SW 2>/dev/null
sleep 1

# 3. release scatters them away from that point.
sleep 2; shot pg-released
H2=$(hot pg-released $TX $TY $RAD)
CR=$(crashline plasma-release)
OK=no; { [ "$CR" = no ] && lt "$H2" "$(python3 -c "print($H1 * 0.6)")"; } && OK=yes
expect plasma-release-scatters "crash=$CR hot_held=$H1 hot_after=$H2" "$OK"

# 4. a drag leads the filaments: swipe across and the hot mass is at the end.
EX=$(python3 -c "print(int($CX - 70 * $SC))"); EY=$(python3 -c "print(int($CY + 40 * $SC))")
adb shell input swipe $TX $TY $EX $EY 1500 &
SW=$!
sleep 1.9
# the swipe is still in flight or just ended; the filaments chase its end
shot pg-dragged
H3=$(hot pg-dragged $EX $EY $RAD)
H4=$(hot pg-dragged $TX $TY $RAD)
wait $SW 2>/dev/null
CR=$(crashline plasma-drag)
OK=no; { [ "$CR" = no ] && gt "$H3" "$H4"; } && OK=yes
expect plasma-drag-follows "crash=$CR hot_at_end=$H3 hot_at_start=$H4" "$OK"

echo "plasma-session crash=$(crashline plasma-session)" | tee -a "$OUT/summary.txt"
exit $FAIL
