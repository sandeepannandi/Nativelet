#!/usr/bin/env bash
# Installs the APK on a running emulator and opens every showcase screen by deep link,
# swipes it, and records screenshots, logcat crash status and whether the UI changed.
set -u
APK="$1"
OUT=smoke-out
mkdir -p "$OUT"
adb install -r "$APK" > "$OUT/install.txt" 2>&1 || { cat "$OUT/install.txt"; exit 1; }
PKG=$(grep -o 'package name=.[a-z.]*' <<<"$(aapt dump badging "$APK" 2>/dev/null)" | head -1 | cut -d"'" -f2)
[ -z "$PKG" ] && PKG=com.anonymous.nativeletshowcase
adb shell pm list packages | grep -i nativelet > "$OUT/packages.txt"
PKG=$(sed 's/package://' "$OUT/packages.txt" | head -1 | tr -d '\r')
echo "package=$PKG" | tee "$OUT/summary.txt"
adb shell wm size > "$OUT/wm.txt"
ROUTES="index fold genie blossom capsule cards carousel chart curl glass gooey light lens morph orbit pinch ripple sort swipe toasts mosaic bubbles flap banner fog pendulum blackhole coin reveal prism hourglass strings range wheel timeline path player"
for r in $ROUTES; do
  adb shell am force-stop "$PKG"
  adb logcat -c
  if [ "$r" = index ]; then URL="nativelet-showcase://"; else URL="nativelet-showcase:///$r"; fi
  adb shell am start -W -a android.intent.action.VIEW -d "$URL" "$PKG" > "$OUT/$r.start.txt" 2>&1
  sleep 8
  adb exec-out screencap -p > "$OUT/$r-1.png"
  adb shell screenrecord --time-limit 6 /sdcard/$r.mp4 &
  RP=$!
  sleep 1
  adb shell input swipe 540 1500 540 700 400
  sleep 1
  adb shell input swipe 540 700 540 1500 400
  sleep 1
  adb shell input tap 540 1200
  wait $RP 2>/dev/null
  sleep 1
  adb exec-out screencap -p > "$OUT/$r-2.png"
  adb pull /sdcard/$r.mp4 "$OUT/$r.mp4" >/dev/null 2>&1
  adb logcat -d > "$OUT/$r.logcat.txt"
  CRASH=no
  grep -E "Process: $PKG|Process $PKG .*has died|ANR in $PKG" "$OUT/$r.logcat.txt" | grep -q . && CRASH=yes
  JSERR=$(grep -c 'ReactNativeJS.*\(Error\|error\)' "$OUT/$r.logcat.txt")
  ALIVE=$(adb shell pidof "$PKG" | tr -d '\r')
  H1=$(md5sum < "$OUT/$r-1.png" | cut -c1-8); H2=$(md5sum < "$OUT/$r-2.png" | cut -c1-8)
  echo "$r crash=$CRASH jserr=$JSERR alive=${ALIVE:+yes} changed_after_interaction=$([ "$H1" != "$H2" ] && echo yes || echo no)" | tee -a "$OUT/summary.txt"
done
# Mini Player gestures: bar appears, drag to expand, next track, drag to collapse.
# Asserts its own evidence and exits non-zero on failure, gating the emulator step.
bash scripts/android-player.sh
