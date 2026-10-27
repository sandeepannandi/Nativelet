#!/usr/bin/env bash
set -euo pipefail
OUT=smoke-out/inline; mkdir -p "$OUT"
PKG=com.anonymous.nativeletshowcase
adb shell am force-stop "$PKG"; adb logcat -c
adb shell am start -W -a android.intent.action.VIEW -d 'nativelet-showcase:///shatter' "$PKG"
sleep 12; bash scripts/android-system-ready.sh
adb exec-out screencap -p > "$OUT/initial.png"
python3 scripts/shatter-trace-match.py target "$OUT/initial.png" > "$OUT/target.json"
python3 scripts/shatter-trace-match.py intact "$OUT/initial.png" > "$OUT/intact.json"
read HX HY RX RY < <(python3 -c 'import json,sys;j=json.load(open(sys.argv[1]));print(*j["hit"],*j["reset"])' "$OUT/target.json")
adb shell input tap "$HX" "$HY"; sleep 15
adb exec-out screencap -p > "$OUT/first-clear.png"
adb shell input tap "$RX" "$RY"; sleep 2
adb exec-out screencap -p > "$OUT/reset.png"
adb shell input tap "$HX" "$HY"; sleep 15
adb exec-out screencap -p > "$OUT/second-clear.png"
adb logcat -d > "$OUT/unrecorded-logcat.txt"
# A separate video is behavior evidence only, never the timing source.
adb shell input tap "$RX" "$RY"; sleep 2
set +e
bash scripts/android-shatter-video-observe.sh "$OUT/video"
V=$?
bash scripts/android-prism.sh
P=$?
adb logcat -d > "$OUT/post-prism-logcat.txt"
set -e
printf 'video_exit=%s\nprism_script_exit=%s\n' "$V" "$P" > "$OUT/status.txt"
python3 - "$OUT" <<'PY'
import pathlib,re,sys,json
p=pathlib.Path(sys.argv[1]);s=(p/'unrecorded-logcat.txt').read_text();rows=re.findall(r'SHATTER_UI frames=(\d+) physics_avg=([\d.]+).*?interval_avg=([\d.]+)',s)
result={'timing_source':'unrecorded, unsampled live component callback','cycles':rows,'budget_ms':16.67,'pass':len(rows)==2 and all(float(r[1])<=16.67 and float(r[2])<=20 for r in rows),'behavior':'manual video inspection still required','prism':'separate crash/behavior inspection required'}
(p/'timing.json').write_text(json.dumps(result,indent=2));print(json.dumps(result));sys.exit(0 if result['pass'] else 1)
PY
[ "$V" = 0 ] && [ "$P" = 0 ]
