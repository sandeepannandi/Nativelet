#!/usr/bin/env bash
# Flow Field behavior evidence: the current animates on its own, a stir
# injects visible energy, and the flow keeps moving after release.
set -u
OUT=smoke-out/flowfield; mkdir -p "$OUT"
PKG=$(adb shell pm list packages | grep -i nativelet | sed 's/package://' | head -1 | tr -d '\r')
open() { adb shell am force-stop "$PKG"; adb logcat -c; adb shell am start -W -a android.intent.action.VIEW -d "nativelet-showcase:///$1" "$PKG" >/dev/null 2>&1; sleep 8; }
shot() { adb exec-out screencap -p > "$OUT/$1.png"; }
report() {
  A=$(md5sum < "$OUT/$2.png" | cut -c1-8); B=$(md5sum < "$OUT/$3.png" | cut -c1-8)
  CR=no; adb logcat -d | grep -E "Process: $PKG|Process $PKG .*has died|ANR in $PKG" | grep -q . && CR=yes
  [ "$CR" = yes ] && adb logcat -d > "$OUT/$1.crash.logcat.txt"
  echo "$1 crash=$CR changed=$([ "$A" != "$B" ] && echo yes || echo no)" | tee -a "$OUT/summary.txt"
}

open flowfield; sleep 2; shot flow-a
# The ambient current should be visibly moving on its own.
sleep 4; shot flow-b
report flowfield-animates flow-a flow-b
# Drag across the card: the paddle stirs swirls and comets.
adb shell input swipe 60 700 480 760 1400 &
sleep 0.7; shot flow-stir-1
sleep 0.8; shot flow-stir-2
wait
report flowfield-stir flow-stir-1 flow-stir-2
report flowfield-stirred flow-a flow-stir-2
# Release: the flow heals back toward ambient but never freezes.
sleep 6; shot flow-healed
report flowfield-heals flow-stir-2 flow-healed
adb logcat -d > "$OUT/flowfield-session.logcat.txt"
CR=no; grep -E "Process: $PKG|Process $PKG .*has died|ANR in $PKG" "$OUT/flowfield-session.logcat.txt" | grep -q . && CR=yes
echo "flowfield-session crash=$CR" | tee -a "$OUT/summary.txt"
