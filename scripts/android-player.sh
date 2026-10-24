#!/usr/bin/env bash
set -euo pipefail
OUT=smoke-out/player; mkdir -p "$OUT"
PKG=$(adb shell pm list packages | grep -i nativelet | sed 's/package://' | head -1 | tr -d '\r')
[ -n "$PKG" ]
trap 'adb logcat -d > "$OUT/session.logcat.txt" 2>/dev/null || true' EXIT

# uiautomator dump only succeeds when the UI is idle; while simulated playback
# ticks (every 250ms) the tree never idles and dumps time out. Evidence plan:
#  1. expand while paused: the Seek clock must read 0:00 (initial state)
#  2. pick a track, let playback tick, pause via the bar hit area
#  3. expand: the Seek clock must have advanced past 0:00 (ticking proof)
#  4. dump again ~2s later: the clock must be unchanged (paused stability)
# Every dump uses a fresh remote path and must contain the expected marker.
dump_until() { # <remote-name> <local-file> <expected-regex> [extra-regex]
  local remote="/sdcard/$1" local_file="$2" expect="$3" extra="${4:-}" i
  for i in 1 2 3 4 5 6; do
    adb shell rm -f "$remote" 2>/dev/null || true
    if adb shell uiautomator dump "$remote" 2>/dev/null | grep -q 'dumped'; then
      if adb shell cat "$remote" > "$local_file" 2>/dev/null \
         && grep -Eq "$expect" "$local_file" \
         && { [ -z "$extra" ] || grep -Eq "$extra" "$local_file"; }; then
        return 0
      fi
    fi
    sleep 1
  done
  echo "player-evidence missing: $expect" >&2
  return 1
}

center() {
 python3 - "$1" "$2" <<'PY'
import sys,re,xml.etree.ElementTree as E
for n in E.parse(sys.argv[1]).iter('node'):
 if n.get('text')==sys.argv[2] or n.get('content-desc')==sys.argv[2]:
  x,y,a,b=map(int,re.findall(r'\d+',n.get('bounds')));print((x+a)//2,(y+b)//2);break
else: raise SystemExit('Missing control: '+sys.argv[2])
PY
}

bar_bounds() { # <xml> -> BX1 BY1 BX2 BY2 of the mini player surface
 python3 - "$1" <<'PY'
import sys,re,xml.etree.ElementTree as E
for n in E.parse(sys.argv[1]).iter('node'):
 if 'Mini player' in n.get('content-desc',''):
  print(*re.findall(r'\d+',n.get('bounds')));break
else: raise SystemExit('Missing player surface bounds')
PY
}

seek_clock() { # <xml> -> the Seek clock text, e.g. 0:04
 grep -o 'Seek\. [0-9]*:[0-9][0-9] of' "$1" | head -1 | sed 's/Seek\. //; s/ of//'
}

adb shell am force-stop "$PKG"
adb logcat -c
adb shell am start -W -a android.intent.action.VIEW -d nativelet-showcase:///player "$PKG" > "$OUT/launch.txt"
sleep 10
adb shell uiautomator dump /sdcard/player-boot.xml >/dev/null 2>&1 || true
adb shell cat /sdcard/player-boot.xml > "$OUT/boot-ui.xml" 2>/dev/null || true
if grep -q "Pixel Launcher isn't responding" "$OUT/boot-ui.xml"; then
 adb shell input keyevent KEYCODE_BACK
 adb shell am force-stop com.google.android.apps.nexuslauncher
 adb shell am start -W -a android.intent.action.VIEW -d nativelet-showcase:///player "$PKG" >/dev/null
 sleep 3
fi
adb exec-out screencap -p > "$OUT/playlist.png"
dump_until player-ui.xml "$OUT/ui.xml" 'Play Night Bus by Low Orbit'
read BX1 BY1 BX2 BY2 < <(bar_bounds "$OUT/ui.xml")
X=$(( (BX1+BX2)/2 )); BARY=$(( (BY1+BY2)/2 ))

# 1. Expand while paused: the Seek clock must start at 0:00 (Monsoon Drift).
adb shell input swipe "$X" "$((BY1+10))" "$X" 220 600
sleep 2
dump_until player-zero.xml "$OUT/zero.xml" 'Collapse player' 'Seek\. 0:00 of 3:34'
# Back to collapsed for the pick.
adb shell input swipe "$X" 400 "$X" 1500 600
sleep 2
dump_until player-recollapsed.xml "$OUT/recollapsed.xml" 'Expand player'

# 2. Tap a track: simulated playback starts. Let it tick, then pause via the
# play/pause hit area at the right of the bar (no live dump needed).
XY=$(center "$OUT/recollapsed.xml" 'Play Night Bus by Low Orbit'); adb shell input tap $XY
sleep 4
adb shell input tap $((BX2-80)) "$BARY"
sleep 1
adb exec-out screencap -p > "$OUT/bar.png"
dump_until player-bar.xml "$OUT/bar.xml" 'Night Bus by Low Orbit. Mini player' 'Expand player'
grep -q 'content-desc="Play"' "$OUT/bar.xml"

# 3. Expand: the Seek clock must have advanced past 0:00 (playback ticked).
adb shell input swipe "$X" "$((BY1+10))" "$X" 220 600
sleep 2
adb exec-out screencap -p > "$OUT/expanded.png"
dump_until player-expanded.xml "$OUT/expanded.xml" 'Collapse player' 'Next track'
grep -q 'Seek\.' "$OUT/expanded.xml"
CLOCK1=$(seek_clock "$OUT/expanded.xml")
[ -n "$CLOCK1" ] && [ "$CLOCK1" != "0:00" ] || { echo "playback not ticking (clock=$CLOCK1)"; exit 1; }

# 4. Paused stability: a second dump ~2s later must show the same clock.
sleep 2
dump_until player-expanded2.xml "$OUT/expanded2.xml" 'Collapse player' 'Seek\.'
CLOCK2=$(seek_clock "$OUT/expanded2.xml")
[ "$CLOCK1" = "$CLOCK2" ] || { echo "clock moved while paused ($CLOCK1 -> $CLOCK2)"; exit 1; }
echo "clock evidence: start=0:00 after-playback=$CLOCK1 paused-recheck=$CLOCK2"

# Next track changes the track on the player surface.
NEXT=$(center "$OUT/expanded2.xml" 'Next track'); adb shell input tap $NEXT
sleep 1
dump_until player-next.xml "$OUT/next.xml" 'Saffron Line by Mina Rao. Mini player'

# Drag down to collapse.
adb shell input swipe "$X" 400 "$X" 1500 600
sleep 2
adb exec-out screencap -p > "$OUT/collapsed.png"
dump_until player-collapsed.xml "$OUT/collapsed.xml" 'Expand player'

adb logcat -d > "$OUT/session.logcat.txt"
if grep -Eq "Process: $PKG|Process $PKG .*has died|ANR in $PKG|FATAL EXCEPTION|Fatal signal|JavascriptException" "$OUT/session.logcat.txt"; then
 echo 'player-session crash=yes' | tee "$OUT/summary.txt"; exit 1
fi
cmp -s "$OUT/playlist.png" "$OUT/bar.png" && { echo 'bar did not appear'; exit 1; }
cmp -s "$OUT/bar.png" "$OUT/expanded.png" && { echo 'expand unchanged'; exit 1; }
cmp -s "$OUT/expanded.png" "$OUT/collapsed.png" && { echo 'collapse unchanged'; exit 1; }
echo "player-session crash=no clock=0:00>$CLOCK1=$CLOCK2 bar=appears playback=ticks expand=drag next=changes-track collapse=drag haptics=untested" | tee "$OUT/summary.txt"
