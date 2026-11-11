#!/usr/bin/env bash
# Runtime qualification only. Does not install the app or claim component pass.
set -euo pipefail
OUT=runtime-qualification
mkdir -p "$OUT"
finish(){
  status=$?
  adb logcat -d > "$OUT/logcat-onexit.txt" 2>/dev/null || true
  if [ "$status" -ne 0 ] && [ ! -s "$OUT/summary.txt" ]; then
    printf '%s\n' 'FAIL incomplete runtime preflight; see captures and logcat-onexit' > "$OUT/summary.txt"
  fi
}
trap finish EXIT
adb wait-for-device
adb shell getprop > "$OUT/getprop.txt"
adb shell pm list packages > "$OUT/packages.txt"
adb shell wm size > "$OUT/wm.txt"
# Default/AOSP image must not accidentally be replaced by Google APIs/Play.
if grep -q 'package:com.google.android.gms' "$OUT/packages.txt"; then
  echo 'FAIL unexpected Google Play Services image' | tee "$OUT/summary.txt"
  exit 1
fi
for sample in 1 2 3; do
  adb exec-out screencap -p > "$OUT/screen-$sample.png"
  adb shell dumpsys activity activities > "$OUT/activity-$sample.txt"
  adb shell dumpsys window > "$OUT/window-$sample.txt"
  # PSI is optional diagnostic telemetry. Some stock AOSP images deny shell
  # access; preserve the denial instead of aborting before mandatory UI checks.
  if ! adb shell 'cat /proc/pressure/cpu /proc/pressure/memory /proc/pressure/io' > "$OUT/pressure-$sample.txt" 2>&1; then
    printf '%s\n' 'UNAVAILABLE: ADB shell cannot read PSI; no pressure clearance inferred.' >> "$OUT/pressure-$sample.txt"
  fi
  adb shell dumpsys cpuinfo > "$OUT/cpu-$sample.txt"
  adb shell uiautomator dump /sdcard/runtime-root.xml > "$OUT/dump-$sample.txt" 2>&1
  adb pull /sdcard/runtime-root.xml "$OUT/root-$sample.xml" > "$OUT/pull-$sample.txt" 2>&1
  python3 - "$OUT" "$sample" <<'PY'
import struct,sys,xml.etree.ElementTree as ET
from pathlib import Path
p=Path(sys.argv[1]); n=sys.argv[2]
b=(p/f'screen-{n}.png').read_bytes()
assert b[:8]==b'\x89PNG\r\n\x1a\n','invalid screenshot'
w,h=struct.unpack('>II',b[16:24]);assert w>0 and h>0,'empty screenshot'
r=ET.parse(p/f'root-{n}.xml').getroot()
assert r.tag=='hierarchy' and list(r.iter('node')),'no accessible UI hierarchy'
PY
  sleep 10
done
adb logcat -d > "$OUT/logcat.txt"
if grep -E 'ANR in |FATAL EXCEPTION:' "$OUT/logcat.txt" > "$OUT/runtime-errors.txt"; then
  echo 'FAIL recorded runtime ANR or fatal exception' | tee "$OUT/summary.txt"
  exit 1
fi
echo 'PRELIMINARY runtime preflight PASS. Screenshots still require visual inspection. No app installed, no component assertions or performance clearance.' | tee "$OUT/summary.txt"
