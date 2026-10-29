#!/usr/bin/env bash
# Voice Recorder behavior evidence: hold to record (waveform appears and
# moves), slide-left cancels, hold-release sends a pill into the thread.
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
report() {
  A=$(md5sum < "$OUT/$2.png" | cut -c1-8); B=$(md5sum < "$OUT/$3.png" | cut -c1-8)
  CR=no; adb logcat -d | grep -E "Process: $PKG|Process $PKG .*has died|ANR in $PKG" | grep -q . && CR=yes
  [ "$CR" = yes ] && adb logcat -d > "$OUT/$1.crash.logcat.txt"
  echo "$1 crash=$CR changed=$([ "$A" != "$B" ] && echo yes || echo no)" | tee -a "$OUT/summary.txt"
}

# Example centers the card; the mic sits near the lower-right of the bar.
# Pixel 6 AVD is 1080x2400; the bar lands around y=1450, mic around x=870.
MICX=870; MICY=1450

open recorder; sleep 2; shot rec-idle

# Hold the mic in place: recording starts after the press delay, the
# waveform grows and moves. A 4 s swipe with a 3 px drift is a press-and-hold
# (a zero-length swipe collapses to a tap on the emulator).
adb shell input swipe $MICX $MICY $((MICX - 3)) $((MICY + 1)) 4000 &
sleep 2.2; shot rec-hold-a
sleep 1.2; shot rec-hold-b
wait
report recorder-records rec-idle rec-hold-a
report recorder-waveform-moves rec-hold-a rec-hold-b
# Released at the same spot: the take is sent, a pill appears in the thread.
sleep 1.2; shot rec-sent
report recorder-send-pill rec-idle rec-sent

# Hold and slide left past the cancel distance: the take flushes, no pill.
adb shell input swipe $MICX $MICY 300 $MICY 3500
sleep 1.2; shot rec-cancelled
report recorder-cancel-returns rec-cancelled rec-sent

# Tap (short press) starts a locked recording; the bar shows send/discard.
adb shell input tap $MICX $MICY
sleep 1.6; shot rec-locked
report recorder-tap-locks rec-idle rec-locked
# Send from locked mode: pill appears.
adb shell input tap $MICX $MICY
sleep 1.2; shot rec-lock-sent
report recorder-locked-send rec-locked rec-lock-sent

adb logcat -d > "$OUT/recorder-session.logcat.txt"
CR=no; grep -E "Process: $PKG|Process $PKG .*has died|ANR in $PKG" "$OUT/recorder-session.logcat.txt" | grep -q . && CR=yes
echo "recorder-session crash=$CR" | tee -a "$OUT/summary.txt"
