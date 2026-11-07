#!/usr/bin/env bash
# Focused native pixel evidence for the Mechanical Watch: the 3D steel case
# and movement render (not a crash/blank), and the movement visibly runs
# (escapement, gear train, idle turntable change pixels over 3s).
set -eu
python3 -m pip install -q pillow
OUT=smoke-out/watch; mkdir -p "$OUT"
PKG=com.anonymous.nativeletshowcase
adb shell am force-stop "$PKG"; adb logcat -c
adb shell am start -W -a android.intent.action.VIEW -d 'nativelet-showcase:///watch' "$PKG" > "$OUT/start.txt"
sleep 9
bash scripts/android-system-ready.sh
sleep 2
shot(){ adb exec-out screencap -p > "$OUT/$1.png"; }
shot initial
adb logcat -d > "$OUT/logcat-early.txt" || true
trap 'adb logcat -d > "$OUT/logcat-onexit.txt" 2>/dev/null || true' EXIT
sleep 3
shot later
python3 - "$OUT" <<'PY'
from PIL import Image, ImageChops
import sys, os
p=sys.argv[1]
def steel(name):
    im=Image.open(os.path.join(p,name+'.png')).convert('RGB'); w,h=im.size
    x0,x1=int(w*.2),int(w*.8); y0,y1=int(h*.25),int(h*.75)
    n=0
    for y in range(y0,y1,2):
        for x in range(x0,x1,2):
            r,g,b=im.getpixel((x,y))
            if 80<r<215 and max(r,g,b)-min(r,g,b)<22: n+=1
    return n,(x0,y0,x1,y1)
a=Image.open(os.path.join(p,'initial.png')).convert('RGB')
b=Image.open(os.path.join(p,'later.png')).convert('RGB')
d=ImageChops.difference(a,b); w,h=d.size
x0,x1=int(w*.2),int(w*.8); y0,y1=int(h*.25),int(h*.75)
moved=0
for y in range(y0,y1,2):
    for x in range(x0,x1,2):
        r,g,bl=d.getpixel((x,y))
        if max(r,g,bl)>14: moved+=1
steel0,box=steel('initial')
checks=[
 ('watch-renders',steel0>2000,steel0),
 ('watch-moves',moved>1500,moved),
]
with open(os.path.join(p,'summary.txt'),'a') as f:
    for n,ok,value in checks: f.write(f'{n} {"ok" if ok else "FAIL"} value={value}\n')
print(open(os.path.join(p,'summary.txt')).read())
assert all(ok for _,ok,_ in checks),'watch behavior failed'
with open(os.path.join(p,'summary.txt'),'a') as f: f.write('watch-session ok crash=no\n')
PY

# Fail-closed packaging (same shape as android-smoke.sh per-route evidence).
# Flat files are the ACTUAL tested frames and full-session records above:
# watch-1.png/watch-2.png are the initial/later frames the movement check
# compared, the logcat is the full session since `adb logcat -c`, start.txt
# is the actual launch record. No re-shot or substituted frames.
cp "$OUT/initial.png" smoke-out/watch-1.png
cp "$OUT/later.png" smoke-out/watch-2.png
adb logcat -d > smoke-out/watch.logcat.txt || true
cp "$OUT/start.txt" smoke-out/watch.start.txt
CRASH=no
grep -E "Process: $PKG|Process $PKG .*has died|ANR in $PKG" smoke-out/watch.logcat.txt | grep -q . && CRASH=yes
JSERR=$(grep -c 'ReactNativeJS.*\(Error\|error\)' smoke-out/watch.logcat.txt || true)
ALIVE=$(adb shell pidof "$PKG" | tr -d '\r' || true)
H1=$(md5sum < smoke-out/watch-1.png | cut -c1-8); H2=$(md5sum < smoke-out/watch-2.png | cut -c1-8)
echo "watch crash=$CRASH jserr=$JSERR alive=${ALIVE:+yes} changed_after_interaction=$([ "$H1" != "$H2" ] && echo yes || echo no)" | tee -a "$OUT/summary.txt"


# Fail-closed packaging (same shape as android-smoke.sh per-route evidence):
# flat artifacts + route line for scripts/check-android-results.py.
adb shell input swipe 540 1500 540 700 400
sleep 1
adb shell input swipe 540 700 540 1500 400
sleep 1
adb exec-out screencap -p > smoke-out/watch-2.png
cp "$OUT/initial.png" smoke-out/watch-1.png
adb logcat -d > smoke-out/watch.logcat.txt || true
cp "$OUT/start.txt" smoke-out/watch.start.txt
CRASH=no
grep -E "Process: $PKG|Process $PKG .*has died|ANR in $PKG" smoke-out/watch.logcat.txt | grep -q . && CRASH=yes
JSERR=$(grep -c 'ReactNativeJS.*\(Error\|error\)' smoke-out/watch.logcat.txt || true)
ALIVE=$(adb shell pidof "$PKG" | tr -d '\r' || true)
H1=$(md5sum < smoke-out/watch-1.png | cut -c1-8); H2=$(md5sum < smoke-out/watch-2.png | cut -c1-8)
echo "watch crash=$CRASH jserr=$JSERR alive=${ALIVE:+yes} changed_after_interaction=$([ "$H1" != "$H2" ] && echo yes || echo no)" | tee -a "$OUT/summary.txt"


# Focused measurement extension. All smoke assertions and packaging above are
# unchanged. Explicit launch URLs opt in; normal component quality stays SS1.
python3 - <<'WATCH_DIAGNOSTICS_PY' || printf '%s\n' 'watch-native-diagnostic failure=yes harness-error' >> smoke-out/watch/summary.txt
#!/usr/bin/env python3
"""Optional native watch measurement. Existing smoke gates run before this.
No performance or memory acceptance threshold is invented here.
"""
import json
import math
import re
import shlex
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

PKG = 'com.anonymous.nativeletshowcase'
OUT = Path('smoke-out/watch/diagnostic')


def adb(*args):
    return subprocess.check_output(['adb', *args], timeout=30)


def records(raw, marker):
    result = []
    for line in raw.splitlines():
        if marker not in line:
            continue
        body = line.split(marker, 1)[1]
        start = body.find('{')
        if start < 0:
            continue
        try:
            value, _ = json.JSONDecoder().raw_decode(body[start:])
            result.append(value)
        except (ValueError, TypeError):
            continue
    return result


def bounds(xml, sample):
    nodes = [n for n in ET.fromstring(xml).iter('node')
             if n.get('content-desc') == 'Mechanical watch']
    if len(nodes) != 1:
        raise RuntimeError('Need exactly one measured Mechanical watch view')
    b = [int(n) for n in re.findall(r'\d+', nodes[0].get('bounds', ''))]
    if len(b) != 4:
        raise RuntimeError('Missing measured view bounds')
    x0, y0, x1, y1 = b
    expected = sample['size'] * sample['pixelRatio']
    if min(x1-x0, y1-y0) <= 0 or max(abs(x1-x0-expected), abs(y1-y0-expected)) > 4:
        raise RuntimeError('UI bounds differ from logged canvas dimensions, inspect screenshot')
    return b


def point(b, sample, x, y):
    if not all(math.isfinite(v) for v in [x, y, sample['size']]):
        raise RuntimeError('Non-finite projected coordinates')
    if not (0 <= x < sample['size'] and 0 <= y < sample['size']):
        raise RuntimeError('Projected target lies outside watch view')
    x0, y0, x1, y1 = b
    return (round(x0 + x/sample['size']*(x1-x0)),
            round(y0 + y/sample['size']*(y1-y0)))


def capture(name):
    raw = adb('logcat', '-d').decode(errors='replace')
    (OUT / (name+'.logcat.txt')).write_text(raw)
    (OUT / (name+'.png')).write_bytes(adb('exec-out', 'screencap', '-p'))
    (OUT / (name+'.meminfo.txt')).write_bytes(adb('shell', 'dumpsys', 'meminfo', PKG))
    samples = records(raw, 'WATCH_DIAGNOSTIC')
    if not samples:
        raise RuntimeError('Diagnostic APK did not produce measurement samples')
    latest = samples[-1]
    return latest


def fresh_sample(ss):
    # A request event asks the next rendered frame to publish its own projection.
    # It is matched by nonce; never accept a periodic log from an earlier pose.
    nonce = 'sample'+str(time.monotonic_ns())
    adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d',
        shlex.quote('nativelet-showcase:///watch?watchDiagnostic='+str(ss)+'&watchDiagnosticSample='+nonce), PKG)
    deadline = time.monotonic() + 8
    while time.monotonic() < deadline:
        samples = records(adb('logcat', '-d').decode(errors='replace'), 'WATCH_DIAGNOSTIC')
        matching = [s for s in samples if s.get('requestId') == nonce]
        if matching:
            device_now = float(adb('shell', 'date', '+%s').decode().strip()) * 1000
            if -1000 <= device_now-matching[-1]['renderedAt'] <= 2000:
                return matching[-1]
        time.sleep(.25)
    raise RuntimeError('No fresh requested projection, no gesture attempted')


def measured_bounds(sample):
    adb('shell', 'uiautomator', 'dump', '/sdcard/watch-diagnostic.xml')
    xml = adb('shell', 'cat', '/sdcard/watch-diagnostic.xml').decode(errors='replace')
    (OUT / 'view.xml').write_text(xml)
    return bounds(xml, sample)


def gesture(name, b, sample, start, end, expected_mode):
    before = len(records(adb('logcat', '-d').decode(errors='replace'), 'WATCH_GESTURE'))
    a = point(b, sample, *start)
    z = point(b, sample, *end)
    if a == z:
        adb('shell', 'input', 'tap', str(a[0]), str(a[1]))
    else:
        adb('shell', 'input', 'swipe', str(a[0]), str(a[1]), str(z[0]), str(z[1]), '600')
    time.sleep(15)
    sample = capture(name)
    events = records((OUT / (name+'.logcat.txt')).read_text(), 'WATCH_GESTURE')[before:]
    if not any(e.get('phase') == 'grant' and e.get('gestureMode') == expected_mode for e in events):
        raise RuntimeError(name+': intended responder did not receive grant')
    if not any(e.get('phase') == 'release' and e.get('gestureMode') == expected_mode for e in events):
        raise RuntimeError(name+': intended responder did not release')
    return sample, events


def run(ss):
    global OUT
    OUT = Path('smoke-out/watch/diagnostic') / ('ss'+str(ss))
    OUT.mkdir(parents=True, exist_ok=True)
    adb('shell', 'am', 'force-stop', PKG)
    adb('logcat', '-c')
    (OUT / 'start.txt').write_bytes(adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'nativelet-showcase:///watch?watchDiagnostic='+str(ss), PKG))
    time.sleep(20)
    first = capture('idle-start')
    for n in range(1, 5):
        time.sleep(15)
        sample = capture('idle-'+str(n))
    b = measured_bounds(sample)
    sample = fresh_sample(ss)
    size = sample['size']
    orbit, events = gesture('orbit', b, sample, (.5*size, .5*size), (.65*size, .55*size), 'orbit')
    grants = [e for e in events if e.get('phase') == 'grant']
    releases = [e for e in events if e.get('phase') == 'release']
    if not grants or not releases or abs((releases[-1]['yaw'] - grants[-1]['yaw']) - .15*size/140) > .03:
        raise RuntimeError('Orbit responder released but yaw did not change')
    orbit = fresh_sample(ss)
    c = orbit['crownScreen']
    # Current projection only. Stop, never guess, if crown/end is clipped.
    wind, events = gesture('crown', b, orbit, (c['x'], c['y']), (c['x'], c['y']+size*.12), 'wind')
    if wind['crown'] == orbit['crown'] or wind['wind'] == orbit['wind']:
        raise RuntimeError('Crown gesture did not change both crown angle and winding state')
    slow, events = gesture('slowmo', b, wind, (.5*size, .5*size), (.5*size, .5*size), 'orbit')
    if not any(e.get('slowmo') == .12 for e in events if e.get('phase') == 'release'):
        raise RuntimeError('Slow-motion tap did not set .12 mode')
    normal, events = gesture('normal', b, slow, (.5*size, .5*size), (.5*size, .5*size), 'orbit')
    if not any(e.get('slowmo') == 1 for e in events if e.get('phase') == 'release'):
        raise RuntimeError('Normal-speed tap did not restore 1 mode')
    (OUT / 'observations.json').write_text(json.dumps({
        'idleStart': first, 'idleEnd': sample, 'orbit': orbit, 'crown': wind,
        'slowmo': slow, 'normal': normal,
        'caveats': ['JS publish timing is enqueue cost, not UI display latency',
                    'RAF intervals are not measured UI frame rate',
                    'Memory snapshots require interpretation, not a leak pass',
                    'Emulator evidence is not physical-device validation']}, indent=2))


if __name__ == '__main__':
    outcomes = {}
    for ss in (1,):
        try:
            run(ss)
            outcomes['ss'+str(ss)] = {'status': 'completed'}
        except Exception as error:
            outcomes['ss'+str(ss)] = {'status': 'incomplete', 'error': str(error)}
            print('WATCH_DIAGNOSTIC_INCOMPLETE ss='+str(ss)+': '+str(error), flush=True)
    # Never abort the pre-existing later Plasma check. Diagnostic status is
    # separate, explicit evidence and is not converted into a pass.
    Path('smoke-out/watch/diagnostic/status.json').write_text(json.dumps(outcomes, indent=2))
    if any(o['status'] != 'completed' for o in outcomes.values()):
        with Path('smoke-out/watch/summary.txt').open('a') as summary:
            summary.write('watch-native-diagnostic failure=yes incomplete; see diagnostic/status.json\n')

WATCH_DIAGNOSTICS_PY
