#!/usr/bin/env bash
# Cymatics behavior evidence, asserted on sand-colored pixels: the plate
# renders with scattered sand, the grains settle onto the nodal lines
# (sand pixel count falls as grains stack on the figure), a sideways drag
# retunes the drive and the figure reorganizes, a tap scatters the sand
# off the lines and it re-settles, and nothing crashes. No accessibility
# dumps because uiautomator never idles on animating Skia.
set -u
OUT=smoke-out/cymatics; mkdir -p "$OUT"
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
expect() { # name condition-detail pass?
  if [ "$3" = yes ]; then echo "$1 ok $2" | tee -a "$OUT/summary.txt";
  else echo "$1 FAIL $2" | tee -a "$OUT/summary.txt"; FAIL=1; fi
}

python3 -m pip install -q pillow numpy >/dev/null 2>&1 || true
# sand FILE -> "count cx cy": warm gold grain pixels and their centroid.
sand() { python3 - "$OUT/$1.png" <<'PYS'
import sys
from PIL import Image
import numpy as np
a = np.asarray(Image.open(sys.argv[1]).convert("RGB"), dtype=np.int16)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
m = (r > 150) & (g > 115) & (b < 200) & (r > b + 30) & (g > b + 10)
n = int(m.sum())
if n < 50:
    print(f"{n} 0 0"); sys.exit(0)
ys, xs = np.where(m)
print(f"{n} {int(xs.mean())} {int(ys.mean())}")
PYS
}
# diff FILE1 FILE2 -> mean abs pixel difference over the middle band.
banddiff() { python3 - "$OUT/$1.png" "$OUT/$2.png" <<'PYD'
import sys
from PIL import Image, ImageChops
A = Image.open(sys.argv[1]).convert("RGB")
B = Image.open(sys.argv[2]).convert("RGB")
w, h = A.size
box = (int(w * 0.08), int(h * 0.2), int(w * 0.92), int(h * 0.75))
hst = ImageChops.difference(A.crop(box), B.crop(box)).convert("L").histogram()
print(sum(i * v for i, v in enumerate(hst)) / ((box[2]-box[0]) * (box[3]-box[1])))
PYD
}
gt() { python3 -c "import sys; sys.exit(0 if float('$1') > float('$2') else 1)"; }
lt() { python3 -c "import sys; sys.exit(0 if float('$1') < float('$2') else 1)"; }

open cymatics; sleep 3; shot cy-early
read N0 CX CY <<<"$(sand cy-early)"
CR=$(crashline cymatics-open)
OK=no; { [ "$CR" = no ] && gt "$N0" 8000 && gt "$CX" 0; } && OK=yes
expect cymatics-renders "crash=$CR sand_px=$N0 centroid=$CX,$CY" "$OK"

# 1. the scattered sand settles onto the nodal lines. The open-time shot
# is not an honest scattered baseline (the figure may already be forming
# by the time the activity is up), so scatter the sand with a tap first
# and measure the settle from that known scattered state. Sand pixel
# count falls as grains stack on the figure; settle is detected by
# polling two shots 8s apart until the count stabilizes (max ~64s), not
# a fixed wait, because the emulator's rAF slows under load.
W=$(python3 -c "from PIL import Image; print(Image.open('$OUT/cy-early.png').size[0])")
H=$(python3 -c "from PIL import Image; print(Image.open('$OUT/cy-early.png').size[1])")
adb shell input tap $((W / 2)) $((H / 2))
sleep 2; shot cy-scattered
read N0 _ _ <<<"$(sand cy-scattered)"
PREV=$N0; SETTLED=no; T0=$SECONDS
for i in 1 2 3 4 5 6 7 8; do
  sleep 8; shot cy-settle-$i
  read NC _ _ <<<"$(sand cy-settle-$i)"
  CHANGE=$(python3 -c "print(abs($NC - $PREV) / max($PREV, 1))")
  if lt "$CHANGE" 0.04; then SETTLED=yes; break; fi
  PREV=$NC
done
CR=$(crashline cymatics-settle)
OK=no; { [ "$CR" = no ] && [ "$SETTLED" = yes ] && gt "$N0" "$(python3 -c "print($NC * 1.12)")"; } && OK=yes
expect cymatics-settles "crash=$CR settled=$SETTLED wait=$((SECONDS - T0))s early_px=$N0 settled_px=$NC" "$OK"
cp "$OUT/cy-settle-$i.png" "$OUT/cy-settled.png" 2>/dev/null || true
SET=$NC

# 2. a sideways drag retunes the drive: the figure visibly reorganizes.
X0=$((W * 30 / 100)); X1=$((W * 70 / 100)); YC=$((H / 2))
adb shell input swipe $X0 $YC $X1 $YC 1400
sleep 3; shot cy-retuned
D=$(banddiff cy-settled cy-retuned)
CR=$(crashline cymatics-retune)
OK=no; { [ "$CR" = no ] && gt "$D" 1.5; } && OK=yes
expect cymatics-retune-reorganizes "crash=$CR band_diff=$D" "$OK"

# 3. let the new figure settle, then a tap scatters the sand off the
# lines (sand pixel count climbs back), then it re-settles.
sleep 10; shot cy-resettled
read NS _ _ <<<"$(sand cy-resettled)"
XC=$((W / 2))
adb shell input tap $XC $YC
sleep 2; shot cy-tapped
read NT _ _ <<<"$(sand cy-tapped)"
CR=$(crashline cymatics-tap)
OK=no; { [ "$CR" = no ] && gt "$NT" "$(python3 -c "print($NS * 1.08)")"; } && OK=yes
expect cymatics-tap-scatters "crash=$CR settled_px=$NS tapped_px=$NT" "$OK"

# 4. the figure reforms after the tap.
sleep 14; shot cy-reformed
read NR _ _ <<<"$(sand cy-reformed)"
CR=$(crashline cymatics-reform)
OK=no; { [ "$CR" = no ] && lt "$NR" "$(python3 -c "print($NT * 0.97)")"; } && OK=yes
expect cymatics-reforms "crash=$CR tapped_px=$NT reformed_px=$NR" "$OK"

echo "cymatics-session crash=$(crashline cymatics-session)" | tee -a "$OUT/summary.txt"
exit $FAIL
