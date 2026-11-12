# Gyroscope

A rotor in two moving gimbals. Flick to add or reverse rotor spin. Switch to Drag frame to apply hand torque to the gimbals. Slow motion advances the same simulation at one quarter speed. Reset restores the initial state. Reduced motion holds the scene still.

Copy the component, math, controller, shader, example and LICENSE together. Requires React Native, Skia and Reanimated. Web preview uses the same simulation and analytic ray geometry through WebGL.

## Model

Coordinates are outer yaw a, inner tilt b and relative rotor spin g. Their rotations are Rz(a), Rx(b), Rz(g). The finite-inertia rings and rotor are coupled through a Lagrangian mass matrix, integrated in generalized momenta by RK4 at a nominal1/960s, refined automatically when angular-momentum coupling becomes faster. Up to100ms of each elapsed frame is accepted; longer pauses are explicitly recorded as discarded time rather than sent through a giant unstable step. A4096-substep safety bound also records any discarded remainder. No animation prescribes precession or wobble.

The 150g rotor has45mm radius,8mm thickness and a named1.5mm axial center-of-mass offset. Transverse inertia includes its parallel-axis contribution. The small offset supplies gravity torque. A balanced no-torque gyro keeps its axis fixed. Bearings have linear drag; a hand drag is a bounded spring/damper torque. Flick is an external angular impulse with the appropriate projections into both cyclic momenta, not a speed assignment.

The two gimbals have effective finite moments. The axle and thin bearing bridges are treated as massless, the bodies are perfectly rigid, and the bearings are ideal intersecting-axis constraints. This is not a measured instrument, flexible bearing/contact simulation or air-flow model. No physical-device claims are made.

## Rendering

Perspective rays intersect finite annular cylinders for the rings, rotor, axle, bearing bridges and base. The rotor is separated from its support bars. Environment lighting, radial brushing, bevel bands and one-sample hard light visibility are approximations, not full global illumination. Engraved radial marks rotate with the actual spin coordinate; fast rotation can alias. Fixed studio camera.

## Verification

Run `node gyroMath.test.mjs`, `node gyroControl.test.mjs` and `node gyroGeometry.test.mjs` (Node22.23 or newer) for energy, cyclic momenta, analytic steady precession, balanced/no-torque behavior, force-free world angular momentum, step refinement, dissipative energy and frame-partition checks. These validate this idealized model and its numerics, not physical hardware. Skia shader compilation, Android gestures, crash history and native performance still need native evidence. Web checks do not replace those gates. No native-device verification flag is set.

`node gyroWorklets.test.cjs` (with showcase dependencies installed) checks the actual Expo transform, default constructor and a10-second isolated generated-closure replay. Keep helper worklets before their callers: generated factories capture functions at module initialization. Resolve captured parameter defaults in the body, after closure binding. `node gyroHarness.test.cjs` guards the Android recovery path against BACKing out of a foreground showcase activity before relaunch. These regression checks do not replace Android execution.


## Android evidence checkpoint (2026-11-11, run 269)

Not ready for native clearance. Exact source 57076138caaa78dc18a8b08b1edbd8830446dffb:
https://github.com/sandeepannandi/Nativelet/actions/runs/43024804824

The Android release build passed. The emulator failed in system readiness,
before the gyro controls, gesture, screenshot, video or frame-stat assertions
ran. All hierarchy dumps returned `null root node`. The corrected recovery
cold-launched MainActivity (`LaunchState: COLD`, `TotalTime: 1668`), unlike
the prior dying-instance relaunch, but readiness still failed. A successful
launch is not a usable native rendering or foreground proof.

Logcat records an ANR in `com.google.android.gms.persistent` while executing
Nearby Discovery service. The recorded window has CPU pressure avg10=76.56%,
memory pressure avg10=50.24%, graphics composer CPU=58%, SurfaceFlinger=22%.
These establish system contention; they do not establish a gyro-specific
crash as the cause or clear gyro crash/performance gates. Android denied
access to the listed ANR trace. No screenshots or native gesture measurements
were captured before failure.

Results artifact:
https://github.com/sandeepannandi/Nativelet/actions/runs/43024804824/artifacts/13859180144

Local checks additionally passed with the locked showcase dependencies:
`gyroWorklets.test.cjs` (Expo transform, default construction, 10s isolated
closure replay with zero state difference), the scoped TypeScript check
`npx tsc --noEmit -p tsconfig.gyro.json`, plus the math, controller, geometry
and recovery-source regressions named above. These are not native clearance.

Do not rerun unchanged on the unsuitable emulator or relax readiness gates.
Next evidence must come from a usable native runtime at verified exact source,
then exercise controls/gestures, reduced motion, crash history, actual visual
finish and native performance. No native-device verification flag is set.


### Runtime-only AOSP qualification attempt (2026-11-11, run270)

Run: https://github.com/sandeepannandi/Nativelet/actions/runs/43028097762
Artifact: https://github.com/sandeepannandi/Nativelet/actions/runs/43028097762/artifacts/13860740150

Both component jobs were skipped, and no app was installed. API34 default
x86_64 image booted without com.google.android.gms. The first screenshot
was visually inspected: a full rendered launcher, status/navigation bars
and icons, with no error dialog in that frame. This is not app evidence.

The preflight then failed because ADB shell cannot read /proc/pressure/*;
set -e aborted before any mandatory UI hierarchy sampling. This is a
preflight portability error, not proof the AOSP runtime is unsuitable.
There are no three UI roots and no runtime, performance or component
clearance. No ANR/FATAL EXCEPTION marker was observed in the short
on-exit capture; that does not establish health under app load.

The pressure capture now records an explicit UNAVAILABLE marker and the
denial, then continues to mandatory screenshot/UI root checks. Those
checks remain fail-closed, as does the ANR/fatal gate. This correction
is unvalidated on Android until the separately bounded corrected qualification settles. No automatic component dispatch follows qualification.


### Corrected runtime-only AOSP qualification (2026-11-11, run271)

Run: https://github.com/sandeepannandi/Nativelet/actions/runs/43029255367
Artifact: https://github.com/sandeepannandi/Nativelet/actions/runs/43029255367/artifacts/13859282823
Source: 5fc8ec1bc6a4dc4af44bf4d0e751fdb48601e419

SUCCESS for the short unloaded launcher/root preflight only. Both component
jobs skipped and no app installed. The three 719x1598 screenshots were
inspected as actual pixels: launcher, status/navigation bars, icons and
search widget rendered normally, no visible error dialog. Initial boot
layout settles by sample 2. All three UIAutomator XMLs contain 26 nodes
with launcher/search packages. No ANR in / FATAL EXCEPTION marker observed
in captured logs. GMS absent. PSI remains explicitly UNAVAILABLE with the
permission denials preserved, so no pressure clearance is inferred.

This is a candidate runtime baseline, not Gyroscope native clearance. It
does not test app startup, controls, gestures, rendering cost or crashes
under app load. No component run dispatched automatically. Run270 remains
a preflight portability failure, not a runtime rejection.


### Exact-source gyro AOSP attempt (2026-11-11, run272)

Run: https://github.com/sandeepannandi/Nativelet/actions/runs/43030250539
Artifact: https://github.com/sandeepannandi/Nativelet/actions/runs/43030250539/artifacts/13860714495
Source: 36f4913db819802355d3e694465b53155e707b12

FAILURE before app installation. Same-run exact-source release APK build
passed. App source and original gyro assertion script are unchanged from
5707613; only workflow, preflight and these notes changed. Full unrelated
emulator suite skipped.

Mandatory same-session runtime preflight failed on first UI root:
UiTestAutomationBridge returned null and /sdcard/runtime-root.xml did not
exist. mCurrentFocus=null although sys.boot_completed=1 and launcher
activity was resumed. Actual screenshot pixels were inspected: wallpaper
only, no launcher icons or status/navigation controls at capture.
Later logcat records launcher Displayed, so boot-complete alone was not a
usable-UI gate. This does not establish whether waiting would recover it.
No ANR/FATAL EXCEPTION marker observed in short captured logs. PSI remains
UNAVAILABLE with permission denials, not pressure clearance.

No app installed, no component controls/gestures/screens/video/frame
evidence, and no Gyroscope native clearance. Run271 remains a successful
unloaded sample, not proof of repeatable startup. No automatic rerun or
component dispatch after this new failure. A grounded usable-launcher
readiness gate, rather than a fixed sleep or skipped root check, is the
next investigation if work resumes. No proof transfers to Mechanical Watch.


### Offline settled-home readiness proposal (not Android-validated)

Prepared after run272. No further dispatch on November 11. This is source
for the next bounded investigation, not native pass evidence.

Diagnosis: preflight only waited for ADB connectivity, then captured
properties/packages and the first PNG/UI root immediately. Its 10-second
sleeps followed successful samples, so no initial settled-home readiness
wait existed. Run272 had boot_completed=1 but null focused window and null
UI root; captured pixels showed wallpaper only.

Next route: save the following helper as scripts/android-home-readiness.sh,
and add the single integration line below before the existing three-sample
loop in scripts/android-runtime-preflight.sh. Review current source first.
Use a bounded exact-source runtime-only qualification, inspect full artifact
and actual pixels, and do not automatically dispatch a component run. Do
not retry unchanged failures. No new credentials, accounts, spend or
reduced rendering. App validation remains separate from runtime baseline.

Integration line, before `for sample in 1 2 3; do`:

```bash
bash scripts/android-home-readiness.sh "$OUT/home-readiness"
```

The original three PNG/root samples, ANR/fatal gate and explicit unavailable
PSI evidence remain unchanged. Do not substitute zeros or a fixed sleep.

Mock evidence (not Android execution): bash syntax passed. Immediate-focus
case passed attempt1; null-focus first then recovery passed attempt2 and
retained the first attempt's AssertionError. ANR case failed immediately.
A test-only1s-deadline copy with blocked ADB exited1 with explicit timeout;
production proposal remains90s. These mocks test control flow only, not
Android UI recovery, physical accuracy or native performance.

Helper proposal:

```bash
#!/usr/bin/env bash
# Offline proposal only. Not Android-validated or dispatched.
# Wait for observed usable launcher rather than treating boot_completed as UI-ready.
set -euo pipefail
OUT=${1:-runtime-qualification/home-readiness}
mkdir -p "$OUT"
deadline=$((SECONDS+90))
attempt=0
while (( SECONDS < deadline )); do
  attempt=$((attempt+1))
  dir="$OUT/attempt-$attempt"; mkdir -p "$dir"
  remaining=$((deadline-SECONDS))
  # One bounded sequence preserves each failed attempt, including a null root.
  # The outer timeout prevents an unresponsive ADB command exceeding the deadline.
  if timeout "$remaining" bash -s -- "$dir" > "$dir/check.stdout" 2> "$dir/check.stderr" <<'SH'
set -eu
d=$1
adb shell getprop sys.boot_completed > "$d/boot.txt"
adb shell dumpsys window > "$d/window.txt"
adb exec-out screencap -p > "$d/screen.png"
adb logcat -d > "$d/logcat.txt"
if grep -E 'ANR in |FATAL EXCEPTION:' "$d/logcat.txt" > "$d/runtime-errors.txt"; then
  exit 2
fi
adb shell rm -f /sdcard/readiness-root.xml
adb shell uiautomator dump /sdcard/readiness-root.xml > "$d/dump.txt" 2>&1
adb pull /sdcard/readiness-root.xml "$d/root.xml" > "$d/pull.txt" 2>&1
python3 - "$d" <<'PY'
from pathlib import Path
import re,struct,sys,xml.etree.ElementTree as ET
p=Path(sys.argv[1])
assert (p/'boot.txt').read_text().strip()=='1','boot flag absent'
w=(p/'window.txt').read_text()
f=re.search(r'mCurrentFocus=Window\{[^\n]*\bu0 ([^\s/]+)/',w)
assert f and f.group(1)=='com.android.launcher3','launcher lacks focused window'
n=list(ET.parse(p/'root.xml').getroot().iter('node'))
assert any(x.get('package')=='com.android.launcher3' and x.get('visible-to-user','true')!='false' for x in n),'launcher root absent'
b=(p/'screen.png').read_bytes()
assert b[:8]==b'\x89PNG\r\n\x1a\n' and all(struct.unpack('>II',b[16:24])),'invalid screenshot'
PY
SH
  then
    printf '%s\n' "PRELIMINARY launcher/root ready on attempt $attempt; mandatory three-sample and ANR gates still required; pixels need inspection." > "$OUT/summary.txt"
    exit 0
  else
    status=$?
    printf '%s\n' "attempt=$attempt exit=$status" > "$dir/result.txt"
    if [ -s "$dir/runtime-errors.txt" ]; then
      echo 'FAIL runtime ANR/fatal during home readiness' > "$OUT/summary.txt"
      exit 1
    fi
  fi
  remaining=$((deadline-SECONDS))
  (( remaining > 0 )) || break
  delay=5; (( remaining >= delay )) || delay=$remaining
  sleep "$delay"
done
echo 'FAIL no focused launcher with accessible root before 90s deadline; no app install' > "$OUT/summary.txt"
exit 1
```

### Settled-home readiness integration (2026-11-12)

The unvalidated proposal above was extracted unchanged into
scripts/android-home-readiness.sh (body byte-identical; header updated to
reflect integration) and wired into scripts/android-runtime-preflight.sh
before the three-sample loop. Re-validated offline before dispatch: bash
syntax passed; the python gate passed real run271 window/root/PNG captures
and rejected run272's mCurrentFocus=null capture; mocked control-flow cases
passed (immediate pass attempt1, null-focus then recovery attempt2 with
attempt1 AssertionError retained, immediate ANR failure, and a test-only 1s
deadline copy timing out with exit124 while the production script remains
90s). Still not Android-validated; next step is one bounded runtime-only
qualification with artifact and pixel inspection. No component run is
dispatched automatically.
