#!/usr/bin/env bash
set -euo pipefail
OUT=smoke-out/native-pacing;mkdir -p "$OUT"
PKG=com.anonymous.nativeletshowcase
adb shell am force-stop "$PKG";adb logcat -c
adb shell am start -W -a android.intent.action.VIEW -d 'nativelet-showcase:///shatter' "$PKG"
sleep 12;bash scripts/android-system-ready.sh
adb exec-out screencap -p > "$OUT/initial.png"
python3 scripts/shatter-trace-match.py target "$OUT/initial.png" > "$OUT/target.json"
read HX HY RX RY < <(python3 -c 'import json,sys;j=json.load(open(sys.argv[1]));print(*j["hit"],*j["reset"])' "$OUT/target.json")
adb shell dumpsys gfxinfo "$PKG" reset >/dev/null
adb shell input tap "$HX" "$HY";sleep 15
adb shell dumpsys gfxinfo "$PKG" > "$OUT/first-gfxinfo.txt"
adb exec-out screencap -p > "$OUT/first.png"
adb shell input tap "$RX" "$RY";sleep 2
adb exec-out screencap -p > "$OUT/reset.png"
adb shell input tap "$HX" "$HY";sleep 15
adb exec-out screencap -p > "$OUT/second.png"
adb logcat -d > "$OUT/logcat.txt"
python3 - "$OUT" <<'PY'
import pathlib,re,sys,json
p=pathlib.Path(sys.argv[1]);s=(p/'logcat.txt').read_text();r=re.findall(r'SHATTER_UI frames=(\d+) physics_avg=([\d.]+).*?interval_avg=([\d.]+)',s);cpu=re.findall(r'cpu_total_avg=([\d.]+)',s);out={'cpu_total_avg':cpu,'cycles':r,'unrecorded_unsampled':True,'budget_ms':16.67,'pass':len(cpu)==2 and all(float(x)<=16.67 for x in cpu) and len(r)==2 and all(float(x[1])<=16.67 and float(x[2])<=20 for x in r)};(p/'timing.json').write_text(json.dumps(out,indent=2));print(json.dumps(out));assert 'SHATTER_PROFILE'not in s and 'Glass Shatter stopped:'not in s
# Don't suppress original full suite if pacing fails. Final checker incorporates result below.
PY
