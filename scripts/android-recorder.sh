#!/usr/bin/env bash
# Voice Recorder behavior evidence: hold to record (recording label appears,
# timer ADVANCES, waveform region changes), hold-release sends a playable
# pill, slide-left cancels (placeholder returns, no pill), tap locks (real
# Send/Discard buttons), locked send adds a pill. Assertions read the
# accessibility tree and region pixel diffs, not just whole-screen md5.
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
dumpui() { # uiautomator dump is flaky on animating screens; retry
  for i in 1 2 3; do
    adb shell uiautomator dump /sdcard/rec.xml >/dev/null 2>&1
    adb shell cat /sdcard/rec.xml > "$OUT/$1.xml" 2>/dev/null
    grep -q "hierarchy" "$OUT/$1.xml" 2>/dev/null && return 0
    sleep 1
  done
  return 1
}
# clock seconds from the bar's recording label: "Recording voice message, 0:01. ..."
reclock() { grep -o "Recording voice message, [0-9]*:[0-9][0-9]" "$OUT/$1.xml" 2>/dev/null | head -1 | sed 's/.*, //' | awk -F: '{print $1*60+$2}'; }
pills() { grep -o "Play voice message" "$OUT/$1.xml" 2>/dev/null | wc -l | tr -d ' '; }
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
wavediff() { python3 - "$OUT/$1.png" "$OUT/$2.png" <<'PY'
import sys
from PIL import Image
A = Image.open(sys.argv[1]).crop((380, 1345, 800, 1470))
B = Image.open(sys.argv[2]).crop((380, 1345, 800, 1470))
pa, pb = A.convert("L").tobytes(), B.convert("L").tobytes()
print(sum(abs(x - y) for x, y in zip(pa, pb)) / len(pa))
PY
}

# Bar + mic land here on the Pixel-6-class AVD (verified via screenshots).
MICX=870; MICY=1450

open recorder; sleep 2; shot rec-idle; dumpui ui-idle

# Hold the mic: a 4 s swipe with a small drift is a real long-press (a
# zero-length swipe collapses to a tap on the emulator).
adb shell input swipe $MICX $MICY $((MICX - 3)) $((MICY + 1)) 4000 &
sleep 2.2; shot rec-hold-a; dumpui ui-hold-a
sleep 1.4; shot rec-hold-b; dumpui ui-hold-b
wait
CR=$(crashline recorder-hold)
REC_LABEL=no; grep -q "Recording voice message" "$OUT/ui-hold-a.xml" && REC_LABEL=yes
DIFF_A=$(wavediff rec-idle rec-hold-a)
DIFF_B=$(wavediff rec-hold-a rec-hold-b)
T1=$(reclock ui-hold-a); T2=$(reclock ui-hold-b)
T1=${T1:-0}; T2=${T2:-0}
# Timer must visibly advance during the hold. Event delivery can lag on a
# loaded emulator, so accept one late sample: re-dump once if not yet ahead.
ADV=no
if [ "$T2" -gt "$T1" ]; then ADV=yes; else
  sleep 1.2; dumpui ui-hold-c; T3=$(reclock ui-hold-c); T3=${T3:-0}
  [ "$T3" -gt "$T1" ] && ADV=yes && T2=$T3
fi
WAVE=no; python3 -c "import sys;sys.exit(0 if float('$DIFF_A')>1.0 or float('$DIFF_B')>1.0 else 1)" && WAVE=yes
expect recorder-records "crash=$CR label=$REC_LABEL t1=${T1}s" "$([ "$CR" = no ] && [ "$REC_LABEL" = yes ] && echo yes || echo no)"
expect recorder-timer-advances "t1=${T1}s t2=${T2}s" "$ADV"
expect recorder-waveform-moves "diff_idle_a=$DIFF_A diff_a_b=$DIFF_B" "$WAVE"

# Release at the same spot: the take sends and a playable pill lands.
sleep 1.5; shot rec-sent; dumpui ui-sent
P1=$(pills ui-sent); P1=${P1:-0}
CR=$(crashline recorder-send)
expect recorder-send-pill "crash=$CR pills=$P1" "$([ "$CR" = no ] && [ "$P1" -ge 1 ] && echo yes || echo no)"

# Hold and slide left past the cancel distance in one gesture: the take
# flushes, the placeholder returns, no new pill.
adb shell input swipe $MICX $MICY 300 $MICY 3500
sleep 1.5; shot rec-cancelled; dumpui ui-cancelled
P2=$(pills ui-cancelled); P2=${P2:-0}
IDLE_BACK=no; grep -q "text=\"Message\"" "$OUT/ui-cancelled.xml" && IDLE_BACK=yes
CR=$(crashline recorder-cancel)
expect recorder-cancel-returns "crash=$CR idle=$IDLE_BACK pills=$P2->$P2(was $P1)" "$([ "$CR" = no ] && [ "$IDLE_BACK" = yes ] && [ "$P2" = "$P1" ] && echo yes || echo no)"

# Tap (short press) starts a locked recording with real Send/Discard buttons.
adb shell input tap $MICX $MICY
sleep 1.6; shot rec-locked; dumpui ui-locked
SEND=no; DISCARD=no
grep -q "Send voice message" "$OUT/ui-locked.xml" && SEND=yes
grep -q "Discard recording" "$OUT/ui-locked.xml" && DISCARD=yes
CR=$(crashline recorder-tap-lock)
expect recorder-tap-locks "crash=$CR send=$SEND discard=$DISCARD" "$([ "$CR" = no ] && [ "$SEND" = yes ] && [ "$DISCARD" = yes ] && echo yes || echo no)"

# Send from locked mode: buttons clear and another pill lands.
adb shell input tap $MICX $MICY
sleep 1.5; shot rec-lock-sent; dumpui ui-lock-sent
P3=$(pills ui-lock-sent); P3=${P3:-0}
SEND_GONE=no; grep -q "Send voice message" "$OUT/ui-lock-sent.xml" || SEND_GONE=yes
CR=$(crashline recorder-locked-send)
expect recorder-locked-send "crash=$CR pills=$P2->$P3 send_gone=$SEND_GONE" "$([ "$CR" = no ] && [ "$P3" -gt "$P2" ] && [ "$SEND_GONE" = yes ] && echo yes || echo no)"

adb logcat -d > "$OUT/recorder-session.logcat.txt"
CR=no; grep -E "Process: $PKG|Process $PKG .*has died|ANR in $PKG" "$OUT/recorder-session.logcat.txt" | grep -q . && CR=yes
echo "recorder-session crash=$CR" | tee -a "$OUT/summary.txt"
[ "$CR" = yes ] && FAIL=1
exit $FAIL
