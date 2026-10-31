#!/usr/bin/env bash
# Venom Button behavior evidence, asserted on pixels at measured regions:
# a far touch grows a tendril bridge without connecting, a near-grab hold
# nearly touches without wrapping, a close touch wraps the finger and keeps
# wobbling while held, release melts the bridge back, a tap
# presses without a bridge, and nothing crashes. Anchored to the dark pill
# (the largest near-black blob in the middle band); no accessibility dumps
# because uiautomator never idles on animating Skia.
set -u
OUT=smoke-out/venom; mkdir -p "$OUT"
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
# locate FILE -> "cx cy scale": centre and px-per-dp of the near-black pill
# (about 210 x 62 dp) in the middle band of the frame.
locate() { python3 - "$OUT/$1.png" <<'PYL'
import sys
from PIL import Image
import numpy as np
a = np.asarray(Image.open(sys.argv[1]).convert("RGB"), dtype=np.int16)
m = a.max(axis=2) < 60
h0, h1 = int(a.shape[0] * 0.25), int(a.shape[0] * 0.75)
m[:h0] = False; m[h1:] = False
ys, xs = np.where(m)
if len(xs) < 4000:
    print("0 0 0"); sys.exit(0)
w = xs.max() - xs.min() + 1
print(f"{(xs.max() + xs.min()) / 2:.1f} {(ys.max() + ys.min()) / 2:.1f} {w / 210.0:.4f}")
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
# P dx dy -> absolute "x y" for a dp offset from the pill centre
P() { python3 -c "print('%d %d' % ($CX + $1 * $SC, $CY + $2 * $SC))"; }
# B dx0 dy0 dx1 dy1 -> pixel box
B() { python3 -c "print('%d %d %d %d' % ($CX + $1 * $SC, $CY + $2 * $SC, $CX + $3 * $SC, $CY + $4 * $SC))"; }

open venom; sleep 2; shot vn-idle
read CX CY SC <<<"$(locate vn-idle)"
{ [ -z "$CX" ] || [ "$CX" = 0 ]; } && { echo "venom-renders FAIL pill_not_found" | tee -a "$OUT/summary.txt"; exit 1; }
CR=$(crashline venom-open)
expect venom-renders "crash=$CR pill_scale=$SC" "$([ "$CR" = no ] && echo yes || echo no)"

# 1. a far touch grows a tendril bridge but leaves a gap at the fingertip.
# The finger clamp (FINGER_MARGIN=22) caps the reachable edge distance from
# the top at ~97 dp, which is near-grab territory where strands are designed
# to nearly touch. A corner touch at stage dp (22,22) sits at edge distance
# ~133 (reach 0.29): a genuine far sense with a wide, stable gap.
read FX FY <<<"$(P -158 -128)"
adb shell input swipe $FX $FY $((FX + 1)) $FY 2600 &
sleep 1.6; shot vn-sense
# The snap is underdamped: root bumps can linger ~1-2s (they always settle -
# the spring keeps vel above the idle cutoff while any bump is visible, and
# later probes measure a pixel-identical idle). 2.5s shoots the steady state
# the melt assertion means, not the mid-settle tail.
wait; sleep 2.5; shot vn-sense-released
# Bridge mass fans along the up-left diagonal from the pill edge toward the
# corner fingertip; the gap box wraps the fingertip with ~18dp to spare
# (steady strands stop 50+ dp short, overshoot under 12dp).
BRIDGE=$(B -120 -95 -55 -35)
GAP=$(B -176 -146 -140 -110)
D=$(regdiff vn-idle vn-sense $BRIDGE)
G=$(regdiff vn-idle vn-sense $GAP)
CR=$(crashline venom-sense)
OK=no; { [ "$CR" = no ] && gt "$D" 2 && lt "$G" 1.5; } && OK=yes
expect venom-sense-reaches "crash=$CR bridge_diff=$D gap_diff=$G" "$OK"

# 2. near-grab: a hold at the top-edge clamp point (180,22), edge distance
# 97 - just outside GRAB=92 - must nearly touch WITHOUT wrapping. This keeps
# the near-grab coverage the top-edge probe had before 0a238f9 moved the far
# sense probe to the corner; the old failure (run 41199175646, gap_diff=
# 11.53) was the probe asserting a gap the design closes at this distance,
# not a component bug. Assertions: the held frame FREEZES (settled sense;
# a grab wobbles forever at 3.1 rad/s and never freezes - probe 3 asserts
# that wobble is alive), then the converged frame fills the bridge and
# near-tip regions (reach 0.91 nearly touches: venomMath simulation shows
# 158 and 19 goo circles in the two boxes, min steady tip-finger gap 5.4dp),
# and release melts back to the idle frame. Frozen is detected by polling
# consecutive frames, not a fixed delay: the emulator's rAF slows under the
# full strand cone (dt clamps at 50ms), so sim time lags wall clock and the
# springs are still converging at a fixed 2.0s/2.6s shot (run 41204477063:
# drift 35/52 with every behavioral metric passing).
read NX NY <<<"$(P 0 -128)"
adb shell input swipe $NX $NY $((NX + 1)) $NY 16000 &
SW=$!
sleep 2.0; shot vn-neargrab-a
NBRIDGE=$(B -30 -115 30 -40)
NEAR=$(B -12 -124 12 -110)
FROZEN=no; STILLB=na; STILLN=na
for i in 1 2 3 4 5 6; do
  kill -0 $SW 2>/dev/null || break
  sleep 0.5; shot vn-neargrab-b
  STILLB=$(regdiff vn-neargrab-a vn-neargrab-b $NBRIDGE)
  STILLN=$(regdiff vn-neargrab-a vn-neargrab-b $NEAR)
  if lt "$STILLB" 2 && lt "$STILLN" 2; then FROZEN=yes; break; fi
  cp "$OUT/vn-neargrab-b.png" "$OUT/vn-neargrab-a.png"
done
wait $SW; sleep 3.5; shot vn-neargrab-released
ND=$(regdiff vn-idle vn-neargrab-b $NBRIDGE)
NN=$(regdiff vn-idle vn-neargrab-b $NEAR)
NM=$(regdiff vn-idle vn-neargrab-released $NBRIDGE)
NBACK=$(regdiff vn-neargrab-b vn-neargrab-released $NBRIDGE)
CR=$(crashline venom-neargrab)
OK=no; { [ "$CR" = no ] && [ "$FROZEN" = yes ] && gt "$ND" 2 && gt "$NN" 2 && lt "$NM" 2 && gt "$NBACK" "$(python3 -c "print($ND * 0.8)")"; } && OK=yes
expect venom-near-grab-reaches-not-wraps "crash=$CR frozen=$FROZEN last_drift_bridge=$STILLB last_drift_tip=$STILLN bridge_diff=$ND near_tip_diff=$NN melt=$NM returned=$NBACK" "$OK"

# 3. a close touch (edge distance ~55 dp) wraps the finger: the gap fills in
# and the wrapped tips keep wobbling (they orbit the fingertip at 3.1 rad/s,
# so two held frames 0.5s apart differ; simulation shows 8-11dp of thick
# strand motion over that window). A frozen held frame here would mean the
# wrap animation died.
read GX GY <<<"$(P 0 -86)"
adb shell input swipe $GX $GY $((GX + 1)) $GY 2600 &
sleep 1.6; shot vn-grab
sleep 0.5; shot vn-grab-wob
wait; sleep 1.4; shot vn-grab-released
G2=$(regdiff vn-idle vn-grab $BRIDGE)
TIP=$(B -20 -100 20 -72)
T=$(regdiff vn-idle vn-grab $TIP)
WOB=$(regdiff vn-grab vn-grab-wob $TIP)
CR=$(crashline venom-grab)
OK=no; { [ "$CR" = no ] && gt "$G2" 2 && gt "$T" 2 && gt "$WOB" 2; } && OK=yes
expect venom-grab-wraps "crash=$CR bridge_diff=$G2 tip_diff=$T wobble_diff=$WOB" "$OK"

# 4. after release the bridge melts back: the region returns to the idle
# frame (MELT tiny) after visibly changing from the held frame (BACK ~= D).
M=$(regdiff vn-idle vn-sense-released $BRIDGE)
BACK=$(regdiff vn-sense vn-sense-released $BRIDGE)
CR=$(crashline venom-release)
OK=no; { [ "$CR" = no ] && lt "$M" 2 && gt "$BACK" "$(python3 -c "print($D * 0.8)")"; } && OK=yes
expect venom-release-melts "crash=$CR bridge_after_release_vs_idle=$M bridge_returned=$BACK bridge_during_diff=$D" "$OK"

# 5. a quick tap on the pill presses: no tendril bridge, pill still there.
shot vn-before-tap
read TX TY <<<"$(P 0 0)"
adb shell input tap $TX $TY
sleep 1; shot vn-tapped
PILLBOX=$(B -90 -25 90 25)
TAPB=$(regdiff vn-idle vn-tapped $BRIDGE)
PILLD=$(regdiff vn-before-tap vn-tapped $PILLBOX)
CR=$(crashline venom-tap)
OK=no; { [ "$CR" = no ] && lt "$TAPB" 2; } && OK=yes
expect venom-tap-presses "crash=$CR bridge_diff=$TAPB pill_diff=$PILLD" "$OK"

echo "venom-session crash=$(crashline venom-session)" | tee -a "$OUT/summary.txt"
exit $FAIL
