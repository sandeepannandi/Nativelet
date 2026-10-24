#!/usr/bin/env bash
set -euo pipefail
OUT=smoke-out/timeline; mkdir -p "$OUT"
PKG=$(adb shell pm list packages | grep -i nativelet | sed 's/package://' | head -1 | tr -d '\r')
[ -n "$PKG" ]
trap 'adb logcat -d > "$OUT/session.logcat.txt" 2>/dev/null || true' EXIT
adb shell am force-stop "$PKG"
adb logcat -c
adb shell am start -W -a android.intent.action.VIEW -d nativelet-showcase:///timeline "$PKG" > "$OUT/launch.txt"
sleep 10
# Pixel Launcher can show its own ANR dialog during emulator boot. Dismiss only
# that system-app dialog, never a Nativelet error, before locating test controls.
adb shell uiautomator dump /sdcard/boot-ui.xml >/dev/null 2>&1
adb shell cat /sdcard/boot-ui.xml > "$OUT/boot-ui.xml"
if grep -q "Pixel Launcher isn't responding" "$OUT/boot-ui.xml"; then
 adb shell input keyevent KEYCODE_BACK
 adb shell am force-stop com.google.android.apps.nexuslauncher
 adb shell am start -W -a android.intent.action.VIEW -d nativelet-showcase:///timeline "$PKG" >/dev/null
 sleep 3
fi
adb exec-out screencap -p > "$OUT/rest.png"
adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
adb shell cat /sdcard/ui.xml > "$OUT/ui.xml"
grep -q 'Timeline trim' "$OUT/ui.xml"
center() {
 python3 - "$OUT/ui.xml" "$1" <<'PY'
import sys,re,xml.etree.ElementTree as E
for n in E.parse(sys.argv[1]).iter('node'):
 if n.get('text')==sys.argv[2] or n.get('content-desc')==sys.argv[2]:
  x,y,a,b=map(int,re.findall(r'\d+',n.get('bounds')));print((x+a)//2,(y+b)//2);break
else: raise SystemExit('Missing control: '+sys.argv[2])
PY
}
XY=$(center 'Zoom in'); adb shell input tap $XY
sleep .2; adb exec-out screencap -p > "$OUT/zoom-moving.png"
sleep 2; adb exec-out screencap -p > "$OUT/zoomed.png"
XY=$(center 'Start +'); adb shell input tap $XY
sleep 1; adb exec-out screencap -p > "$OUT/adjusted.png"
adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
adb shell cat /sdcard/ui.xml > "$OUT/adjusted.xml"
grep -q '00:25' "$OUT/adjusted.xml"
# Locate the actual interaction bounds, not emulator-specific constants.
read X1 Y1 X2 Y2 < <(python3 - "$OUT/ui.xml" <<'PY'
import sys,re,xml.etree.ElementTree as E
for n in E.parse(sys.argv[1]).iter('node'):
 if n.get('content-desc','').startswith('Timeline trim.'):
  print(*re.findall(r'\d+',n.get('bounds')));break
else: raise SystemExit('Missing timeline interaction bounds')
PY
)
SX=$((X1+(X2-X1)*7/10)); EX=$((X1+(X2-X1)*4/10)); Y=$((Y1+(Y2-Y1)*255/300))
adb shell input swipe "$SX" "$Y" "$EX" "$Y" 450
sleep 2; adb exec-out screencap -p > "$OUT/panned.png"
# Reset and exercise native trim/playhead gestures against known source geometry.
XY=$(center 'Reset'); adb shell input tap $XY; sleep 1
A=$((X1+(X2-X1)*80/340)); B=$((X1+(X2-X1)*115/340)); TY=$((Y1+(Y2-Y1)*175/300))
adb shell input swipe "$A" "$TY" "$B" "$TY" 700
sleep 2; adb exec-out screencap -p > "$OUT/trimmed.png"
adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
adb shell cat /sdcard/ui.xml > "$OUT/trimmed.xml"
python3 - "$OUT/trimmed.xml" <<'PYTEST'
import sys,re,xml.etree.ElementTree as E
values=[n.get('text','') for n in E.parse(sys.argv[1]).iter('node') if '→' in n.get('text','')]
assert values, 'Missing source selection output'
numbers=re.findall(r'(\d+):(\d+\.\d+)',values[0]);start=int(numbers[0][0])*60+float(numbers[0][1]);end=int(numbers[1][0])*60+float(numbers[1][1]);assert 35<start<45 and end==84,values
PYTEST
A=$((X1+(X2-X1)*140/340)); B=$((X1+(X2-X1)*180/340)); PY=$((Y1+(Y2-Y1)*100/300))
adb shell input swipe "$A" "$PY" "$B" "$PY" 700
sleep 2; adb exec-out screencap -p > "$OUT/playhead.png"
adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
adb shell cat /sdcard/ui.xml > "$OUT/playhead.xml"
python3 - "$OUT/playhead.xml" <<'PYTEST'
import sys,re,xml.etree.ElementTree as E
values=[n.get('text','') for n in E.parse(sys.argv[1]).iter('node')]
assert any(re.fullmatch(r'01:0[0-9]\.\d+',v) for v in values),values
assert any('01:24.00' in v and '→' in v for v in values),values
PYTEST
adb shell getevent -lp > "$OUT/input-devices.txt"
XY=$(center 'Reset'); adb shell input tap $XY; sleep 1
adb shell uiautomator dump /sdcard/pinch-before.xml >/dev/null 2>&1
adb shell cat /sdcard/pinch-before.xml > "$OUT/pinch-before.xml"
adb exec-out screencap -p > "$OUT/pinch-before.png"
# Separate supported AndroidX instrumentation APK, never framework/JUnit3 shims.
# The dedicated Timeline workflow builds these ahead of time; the smoke
# workflow has no such job, so build them here when the outputs are absent.
if [ ! -f scripts/pinch-instrumentation/app/build/outputs/apk/debug/app-debug.apk ]; then
  (cd scripts/pinch-instrumentation && gradle :app:assembleDebug :app:assembleDebugAndroidTest --no-daemon)
fi
adb install -r scripts/pinch-instrumentation/app/build/outputs/apk/debug/app-debug.apk
adb install -r scripts/pinch-instrumentation/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb shell am instrument -w -r dev.nativelet.pinch.test/androidx.test.runner.AndroidJUnitRunner > "$OUT/pinch-test.txt"
grep -q 'OK (1 test)' "$OUT/pinch-test.txt"
if grep -Eq 'FAILURES|INSTRUMENTATION_FAILED|Process crashed' "$OUT/pinch-test.txt"; then cat "$OUT/pinch-test.txt"; exit 1; fi
sleep 2; adb exec-out screencap -p > "$OUT/pinched.png"
adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
adb shell cat /sdcard/ui.xml > "$OUT/pinched.xml"
# Require an actual zoom-level change away from fit after the two-pointer gesture.
python3 scripts/assert-timeline-pinch.py "$OUT/pinch-before.xml" "$OUT/pinched.xml"

adb logcat -d > "$OUT/session.logcat.txt"
if grep -Eq "Process: $PKG|Process $PKG .*has died|ANR in $PKG|FATAL EXCEPTION|Fatal signal|JavascriptException" "$OUT/session.logcat.txt"; then
 echo 'timeline-session crash=yes' | tee "$OUT/summary.txt"; exit 1
fi
cmp -s "$OUT/rest.png" "$OUT/zoomed.png" && { echo 'zoom unchanged'; exit 1; }
cmp -s "$OUT/zoomed.png" "$OUT/panned.png" && { echo 'pan unchanged'; exit 1; }
echo 'timeline-session crash=no zoom=changed range=25s pan=changed trim=source-changed playhead=source-changed pinch=two-pointer haptics=untested' | tee "$OUT/summary.txt"
