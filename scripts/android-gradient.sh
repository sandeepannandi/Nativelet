#!/usr/bin/env bash
# Gradient Studio behavior evidence, asserted on pixels at measured regions:
# dragging a stop recolors the preview, a long hold on the color square lifts
# the loupe, a hue-ring drag recolors the preview, tapping the track adds a
# stop, pulling a stop away removes it, a preset chip swaps the palette, and
# nothing crashes. Anchored to the saturated hue ring (224 dp across); no
# accessibility dumps because uiautomator never idles on animating Skia.
set -u
OUT=smoke-out/gradient; mkdir -p "$OUT"
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
# locate FILE -> "cx cy scale": centre and px-per-dp of the fully saturated
# hue ring (outer diameter 224 dp) in the lower part of the frame.
locate() { python3 - "$OUT/$1.png" <<'PYL'
import sys
from PIL import Image
import numpy as np
a = np.asarray(Image.open(sys.argv[1]).convert("RGB"), dtype=np.int16)
c = a.max(axis=2) - a.min(axis=2)
m = (c >= 235) & (a.max(axis=2) >= 235)
m[: int(a.shape[0] * 0.40)] = False
ys, xs = np.where(m)
if len(xs) < 3000:
    print("0 0 0"); sys.exit(0)
w = xs.max() - xs.min() + 1
h = ys.max() - ys.min() + 1
print(f"{(xs.max() + xs.min()) / 2:.1f} {(ys.max() + ys.min()) / 2:.1f} {((w + h) / 2) / 224.0:.4f}")
PYL
}
regdiff() { python3 - "$OUT/$1.png" "$OUT/$2.png" "$3" "$4" "$5" "$6" <<'PYR'
import sys
from PIL import Image, ImageChops
box = tuple(int(v) for v in sys.argv[3:7])
A = Image.open(sys.argv[1]).convert("RGB").crop(box)
B = Image.open(sys.argv[2]).convert("RGB").crop(box)
h = ImageChops.difference(A, B).convert("L").histogram()
print(sum(i * v for i, v in enumerate(h)) / (A.size[0] * A.size[1]))
PYR
}
gt() { python3 -c "import sys; sys.exit(0 if float('$1') > float('$2') else 1)"; }
lt() { python3 -c "import sys; sys.exit(0 if float('$1') < float('$2') else 1)"; }
# P dx dy -> absolute "x y" for a dp offset from the ring centre
P() { python3 -c "print('%d %d' % ($CX + $1 * $SC, $CY + $2 * $SC))"; }
# B dx0 dy0 dx1 dy1 -> pixel box
B() { python3 -c "print('%d %d %d %d' % ($CX + $1 * $SC, $CY + $2 * $SC, $CX + $3 * $SC, $CY + $4 * $SC))"; }

open gradient; sleep 2; shot gs-idle
read CX CY SC <<<"$(locate gs-idle)"
{ [ -z "$CX" ] || [ "$CX" = 0 ]; } && { echo "gradient-renders FAIL hue_ring_not_found" | tee -a "$OUT/summary.txt"; exit 1; }
CR=$(crashline gradient-open)
expect gradient-renders "crash=$CR ring_scale=$SC" "$([ "$CR" = no ] && echo yes || echo no)"

PREV=$(B -150 -300 150 -200)
TRACKY=-146

# 1. drag the selected (middle) stop to the right along the track.
read X0 Y0 <<<"$(P 0 $TRACKY)"; read X1 Y1 <<<"$(P 90 $TRACKY)"
adb shell input swipe $X0 $Y0 $X1 $Y1 600
sleep 1.2; shot gs-stop-drag
D=$(regdiff gs-idle gs-stop-drag $PREV)
CR=$(crashline gradient-stop)
OK=no; { [ "$CR" = no ] && gt "$D" 2; } && OK=yes
expect gradient-stop-drag-recolors "crash=$CR preview_diff=$D" "$OK"

# 2. long hold on the colour square shows the loupe above the finger.
read HX HY <<<"$(P -20 0)"
adb shell input swipe $HX $HY $((HX + 1)) $HY 3500 &
sleep 2; shot gs-loupe
wait
sleep 1; shot gs-loupe-released
LB=$(B -60 -135 60 -50)
LD=$(regdiff gs-stop-drag gs-loupe $LB)
LR=$(regdiff gs-stop-drag gs-loupe-released $LB)
CR=$(crashline gradient-loupe)
OK=no; { [ "$CR" = no ] && gt "$LD" 6 && lt "$LR" "$LD"; } && OK=yes
expect gradient-loupe-follows-hold "crash=$CR loupe_diff=$LD after_release_diff=$LR" "$OK"

# 3. drag around the hue ring recolors the preview.
read RX0 RY0 <<<"$(P 100 0)"; read RX1 RY1 <<<"$(P 0 100)"
adb shell input swipe $RX0 $RY0 $RX1 $RY1 700
sleep 1.2; shot gs-hue
D=$(regdiff gs-loupe-released gs-hue $PREV)
CR=$(crashline gradient-hue)
OK=no; { [ "$CR" = no ] && gt "$D" 2; } && OK=yes
expect gradient-hue-drag-recolors "crash=$CR preview_diff=$D" "$OK"

# 4. tap the track away from every stop adds one; 5. pull it away removes it.
read TX TY <<<"$(P -82 $TRACKY)"
TRK=$(B -100 -165 -64 -127)
shot gs-before-add
adb shell input tap $TX $TY
sleep 1.2; shot gs-added
D=$(regdiff gs-before-add gs-added $TRK)
CR=$(crashline gradient-add)
OK=no; { [ "$CR" = no ] && gt "$D" 3; } && OK=yes
expect gradient-tap-adds-stop "crash=$CR track_diff=$D" "$OK"

read RMX RMY <<<"$(P -82 $((TRACKY + 95)))"
adb shell input swipe $TX $TY $RMX $RMY 700
sleep 1.4; shot gs-removed
D=$(regdiff gs-added gs-removed $TRK)
BACK=$(regdiff gs-before-add gs-removed $TRK)
CR=$(crashline gradient-remove)
OK=no; { [ "$CR" = no ] && gt "$D" 3 && lt "$BACK" "$D"; } && OK=yes
expect gradient-pull-away-removes-stop "crash=$CR track_diff_vs_added=$D track_diff_vs_before=$BACK" "$OK"

# 6. a preset chip swaps the palette (Lagoon, second chip below the canvas).
read CHX CHY <<<"$(P -42 186)"
adb shell input tap $CHX $CHY
sleep 1.8; shot gs-preset
D=$(regdiff gs-removed gs-preset $PREV)
CR=$(crashline gradient-preset)
OK=no; { [ "$CR" = no ] && gt "$D" 8; } && OK=yes
expect gradient-preset-swaps-palette "crash=$CR preview_diff=$D" "$OK"

echo "gradient-session crash=$(crashline gradient-session)" | tee -a "$OUT/summary.txt"
exit $FAIL
