#!/usr/bin/env bash
# Voice Recorder behavior evidence, asserted on pixels at measured regions:
# hold to record (red dot appears, timer digits ADVANCE, waveform churns),
# hold-release sends a playable pill (pill region changes), slide-left cancels
# (bar returns to idle, no new pill), tap locks (trash + running timer),
# locked Send adds a pill, locked Discard returns to idle. No accessibility
# dumps: uiautomator's wait-for-idle never settles on this animating Skia
# screen and returned empty trees, so assertions read regions of screenshots.
set -u
OUT=smoke-out/recorder; mkdir -p "$OUT"
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

python3 -m pip install -q pillow >/dev/null 2>&1 || true
# px FILE X Y -> "R G B"
px() { python3 - "$OUT/$1.png" "$2" "$3" <<'PY'
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert("RGB")
r, g, b = im.getpixel((int(sys.argv[2]), int(sys.argv[3])))
print(r, g, b)
PY
}
# regdiff A B x0 y0 x1 y1 -> mean abs grayscale diff
regdiff() { python3 - "$OUT/$1.png" "$OUT/$2.png" "$3" "$4" "$5" "$6" <<'PY'
import sys
from PIL import Image, ImageChops
box = tuple(int(v) for v in sys.argv[3:7])
A = Image.open(sys.argv[1]).convert("L").crop(box)
B = Image.open(sys.argv[2]).convert("L").crop(box)
d = ImageChops.difference(A, B)
h = d.histogram()
print(sum(i * v for i, v in enumerate(h)) / (A.size[0] * A.size[1]))
PY
}
gt() { python3 -c "import sys; sys.exit(0 if float('$1') > float('$2') else 1)"; }
lt() { python3 -c "import sys; sys.exit(0 if float('$1') < float('$2') else 1)"; }
reddot() { # FILE -> yes if the recording dot pixel is red
  read R G B <<<"$(px "$1" 157 1363)"
  [ "$R" -gt 190 ] && [ "$G" -lt 170 ] && echo yes || echo no
}
trash() { # FILE -> yes if the locked-mode discard glyph pixel is pink/red
  read R G B <<<"$(px "$1" 175 1355)"
  [ "$R" -gt 225 ] && [ $((R - G)) -gt 10 ] && echo yes || echo no
}

# Measured regions on the Pixel-6-class AVD (1080x2400), from artifact frames:
# mic center (913,1363); red dot (157,1363); trash glyph (175,1355);
# timer digits (200,1335)-(290,1380); waveform (330,1290)-(820,1420);
# bar (89,1275)-(991,1433); sent-pill area (400,800)-(1000,1040).
MICX=913; MICY=1363; DISX=175; DISY=1360

open recorder; sleep 2; shot rec-idle

# Hold the mic: a 5 s swipe with a small drift is a real long-press (a
# zero-length swipe collapses to a tap on the emulator).
adb shell input swipe $MICX $MICY $((MICX - 3)) $((MICY + 1)) 5000 &
sleep 2; shot rec-hold-a
sleep 1.8; shot rec-hold-b
wait
CR=$(crashline recorder-hold)
DOT=$(reddot rec-hold-a)
T_A=$(regdiff rec-idle rec-hold-a 200 1335 290 1380)
T_B=$(regdiff rec-hold-a rec-hold-b 200 1335 290 1380)
WAVE_D=$(regdiff rec-hold-a rec-hold-b 330 1290 820 1420)
REC_OK=no; { [ "$CR" = no ] && [ "$DOT" = yes ] && gt "$T_A" 3; } && REC_OK=yes
ADV=no; gt "$T_B" 3 && ADV=yes
WAVE=no; gt "$WAVE_D" 1 && WAVE=yes
expect recorder-records "crash=$CR red_dot=$DOT timer_vs_idle=$T_A" "$REC_OK"
expect recorder-timer-advances "timer_a_vs_b=$T_B" "$ADV"
expect recorder-waveform-moves "wave_a_vs_b=$WAVE_D" "$WAVE"

# Release at the same spot: the take sends and a playable pill lands.
sleep 1.5; shot rec-sent
PILL=$(regdiff rec-idle rec-sent 400 800 1000 1040)
CR=$(crashline recorder-send)
SENT=no; { [ "$CR" = no ] && gt "$PILL" 5; } && SENT=yes
expect recorder-send-pill "crash=$CR pill_diff=$PILL" "$SENT"

# Hold and slide left past the cancel distance in one gesture: the take
# flushes, the placeholder returns, no new pill.
adb shell input swipe $MICX $MICY 300 $MICY 3500
sleep 2; shot rec-cancelled
PILL2=$(regdiff rec-sent rec-cancelled 400 800 1000 1040)
BAR_BACK=$(regdiff rec-idle rec-cancelled 89 1275 991 1433)
DOT2=$(reddot rec-cancelled)
CR=$(crashline recorder-cancel)
CXL=no; { [ "$CR" = no ] && [ "$DOT2" = no ] && lt "$PILL2" 2 && lt "$BAR_BACK" 2; } && CXL=yes
expect recorder-cancel-returns "crash=$CR bar_vs_idle=$BAR_BACK new_pill_diff=$PILL2 dot=$DOT2" "$CXL"

# Tap (short press) starts a locked recording: trash glyph + running timer.
adb shell input tap $MICX $MICY
sleep 1.8; shot rec-locked
TR=$(trash rec-locked)
T_L=$(regdiff rec-idle rec-locked 200 1335 290 1380)
CR=$(crashline recorder-tap-lock)
LOCK=no; { [ "$CR" = no ] && [ "$TR" = yes ] && gt "$T_L" 3; } && LOCK=yes
expect recorder-tap-locks "crash=$CR trash=$TR timer_vs_idle=$T_L" "$LOCK"

# Send from locked mode (mic becomes the Send button): another pill lands,
# the bar returns to idle.
adb shell input tap $MICX $MICY
sleep 1.5; shot rec-lock-sent
PILL3=$(regdiff rec-cancelled rec-lock-sent 400 800 1000 1040)
BAR_IDLE2=$(regdiff rec-idle rec-lock-sent 89 1275 991 1433)
CR=$(crashline recorder-locked-send)
LS=no; { [ "$CR" = no ] && gt "$PILL3" 5 && lt "$BAR_IDLE2" 2; } && LS=yes
expect recorder-locked-send "crash=$CR new_pill_diff=$PILL3 bar_vs_idle=$BAR_IDLE2" "$LS"

# Lock again, then Discard: no new pill, bar returns to idle.
adb shell input tap $MICX $MICY
sleep 1.4
adb shell input tap $DISX $DISY
sleep 1.5; shot rec-discarded
PILL4=$(regdiff rec-lock-sent rec-discarded 400 800 1000 1040)
BAR_IDLE3=$(regdiff rec-idle rec-discarded 89 1275 991 1433)
CR=$(crashline recorder-discard)
DIS=no; { [ "$CR" = no ] && lt "$PILL4" 2 && lt "$BAR_IDLE3" 2; } && DIS=yes
expect recorder-discard-returns "crash=$CR new_pill_diff=$PILL4 bar_vs_idle=$BAR_IDLE3" "$DIS"

echo "recorder-session crash=$(crashline recorder-session)" | tee -a "$OUT/summary.txt"
exit $FAIL
