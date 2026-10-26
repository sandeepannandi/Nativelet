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
sleep 1.5; shot crumple-ball
report crumple-corner-drag crumple-flat crumple-ball
report crumple-drag-progress crumple-mid crumple-ball
# Flick the ball to the right: it must move.
adb shell input swipe $CX $CY $((CX + W / 4)) $((CY - H / 25)) 90
sleep 0.25; shot crumple-toss-1
sleep 2.5; shot crumple-toss-2
report crumple-flick-moves crumple-ball crumple-toss-2
# Double tap the ball: it smooths back to a sheet.
# Two taps launched together: each `input tap` spawns a JVM, so back-to-back
# calls can land far apart and would not be a double tap at all.
adb shell "input tap $((CX + W / 5)) $((CY - H / 30)) & sleep 0.08; input tap $((CX + W / 5)) $((CY - H / 30)); wait"
sleep 3; shot crumple-smooth
report crumple-double-tap-opens crumple-toss-2 crumple-smooth
# The opened sheet must match the untouched flat sheet frame exactly.
if [ "$(md5sum < "$OUT/crumple-smooth.png" | cut -c1-8)" = "$(md5sum < "$OUT/crumple-flat.png" | cut -c1-8)" ]; then
  echo "crumple-double-tap-restores-flat-sheet match=yes" | tee -a "$OUT/summary.txt"
else
  echo "crumple-double-tap-restores-flat-sheet match=no" | tee -a "$OUT/summary.txt"; CRUMPLE_FAIL=1
fi
adb logcat -d > "$OUT/crumple-session.logcat.txt"
CR=no; grep -E "Process: $PKG|Process $PKG .*has died|ANR in $PKG" "$OUT/crumple-session.logcat.txt" | grep -q . && CR=yes
echo "crumple-session crash=$CR" | tee -a "$OUT/summary.txt"
[ -z "${CRUMPLE_FAIL:-}" ] || { echo "double tap did not restore the sheet"; exit 1; }
