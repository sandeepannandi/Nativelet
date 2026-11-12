#!/usr/bin/env bash
# Environment probe for the Intel-macOS GitHub runner. NOT a validation run.
# Records actual VM/graphics acceleration and app pipeline/context behavior.
# It does not presume host-GPU works: it requests a GPU mode, records what the
# emulator actually engaged, and compares host vs swiftshader boots. No
# component assertions, gates or criteria are touched by this script.
set -u
GPU_MODE="${GPU_MODE:?set GPU_MODE to host or swiftshader}"
OUT="${OUT:?set OUT to an output directory}"
APK="${APK:?set APK to the release apk path}"
mkdir -p "$OUT"
PKG=com.anonymous.nativeletshowcase
EMU="${ANDROID_HOME:?}/emulator/emulator"
SUM="$OUT/probe-summary-$GPU_MODE.txt"
: > "$SUM"
say(){ printf '%s\n' "$*" | tee -a "$SUM"; }

say "gpu_mode_requested=$GPU_MODE"
say "macos=$(sw_vers -productVersion 2>/dev/null)"
say "cpu=$(sysctl -n machdep.cpu.brand_string 2>/dev/null)"
say "kern_hv_support=$(sysctl -n kern.hv_support 2>/dev/null)"
system_profiler SPDisplaysDataType > "$OUT/host-gpu.txt" 2>&1 || true
say "host_gpu=$(grep -m1 'Chipset Model' "$OUT/host-gpu.txt" | sed 's/^ *//')"
"$EMU" -version > "$OUT/emulator-version.txt" 2>&1 || true
say "emulator_version=$(head -1 "$OUT/emulator-version.txt")"
"$EMU" -accel-check > "$OUT/accel-check.txt" 2>&1 || true
say "accel_check=$(tr '\n' ' ' < "$OUT/accel-check.txt" | tr -s ' ')"

AVD=probe-$GPU_MODE
"$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager" delete avd -n "$AVD" > /dev/null 2>&1 || true
echo no | "$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager" create avd -n "$AVD" -k 'system-images;android-34;default;x86_64' --device pixel_6 --force > "$OUT/avd-create.txt" 2>&1
say "avd_create_rc=$?"

"$EMU" -avd "$AVD" -no-window -no-snapshot -no-boot-anim -noaudio -gpu "$GPU_MODE" > "$OUT/emulator-$GPU_MODE.log" 2>&1 &
EMU_PID=$!
booted=failed
for i in $(seq 1 60); do
  bc=$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')
  [ "$bc" = 1 ] && { booted=ok; break; }
  kill -0 "$EMU_PID" 2>/dev/null || break
  sleep 5
done
say "boot=$booted wait_s=$((i*5))"

if [ "$booted" = ok ]; then
  adb shell getprop > "$OUT/props-$GPU_MODE.txt" 2>&1 || true
  grep -iE 'gles|qemu|vulkan|gpu' "$OUT/props-$GPU_MODE.txt" | head -20 > "$OUT/props-gpu-$GPU_MODE.txt" || true
  adb shell dumpsys SurfaceFlinger > "$OUT/surfaceflinger-$GPU_MODE.txt" 2>&1 || true
  grep -m2 -iE 'GLES:|Vulkan' "$OUT/surfaceflinger-$GPU_MODE.txt" > "$OUT/renderer-$GPU_MODE.txt" || true
  say "surfaceflinger_renderer=$(tr '\n' '|' < "$OUT/renderer-$GPU_MODE.txt")"
  grep -iE 'gpu|angle|swiftshader|vulkan|moltenvk|opengl|renderer|virtio' "$OUT/emulator-$GPU_MODE.log" | head -30 > "$OUT/emulator-gpu-lines-$GPU_MODE.txt" || true

  adb install -r "$APK" > "$OUT/install.txt" 2>&1
  say "install=$(tail -1 "$OUT/install.txt")"
  adb shell am force-stop "$PKG"; adb logcat -c
  adb shell am start -W -a android.intent.action.VIEW -d 'nativelet-showcase:///gyroscope' "$PKG" > "$OUT/start.txt" 2>&1
  say "cold_start=$(grep -E 'Status:|TotalTime' "$OUT/start.txt" | tr '\n' ' ')"
  sleep 25
  adb exec-out screencap -p < /dev/null > "$OUT/screen-$GPU_MODE.png" 2> "$OUT/screen-$GPU_MODE.err" || true
  say "screencap_bytes=$(stat -f%z "$OUT/screen-$GPU_MODE.png" 2>/dev/null || echo 0)"
  adb logcat -d > "$OUT/logcat-$GPU_MODE.txt" 2>&1 || true
  say "skia_pipeline=$(grep -m2 -iE 'Pipeline=Skia|reactnativeskia|Skia' "$OUT/logcat-$GPU_MODE.txt" | tr '\n' '|')"
  egl_anomaly=$(grep -c 'EGLConsumer is not attached' "$OUT/logcat-$GPU_MODE.txt" 2>/dev/null || echo 0)
  say "egl_consumer_not_attached_count=$egl_anomaly"
  anr=$(grep -cE 'ANR in|FATAL EXCEPTION' "$OUT/logcat-$GPU_MODE.txt" 2>/dev/null || echo 0)
  say "anr_or_fatal_count=$anr"
  adb shell dumpsys gfxinfo "$PKG" < /dev/null > "$OUT/gfxinfo-$GPU_MODE.txt" 2>&1 || true
  say "gfxinfo=$(grep -E 'Total frames rendered:|Janky frames:' "$OUT/gfxinfo-$GPU_MODE.txt" | tr '\n' ' ')"
  adb shell dumpsys gfxinfo "$PKG" framestats < /dev/null > "$OUT/gfxinfo-framestats-$GPU_MODE.txt" 2>&1 || true
  adb shell dumpsys cpuinfo < /dev/null > "$OUT/cpuinfo-$GPU_MODE.txt" 2>&1 || true
fi
adb emu kill > /dev/null 2>&1 || true
wait "$EMU_PID" 2>/dev/null || true
say "probe_complete=1"
exit 0
