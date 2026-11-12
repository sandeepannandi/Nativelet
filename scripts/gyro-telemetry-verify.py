#!/usr/bin/env python3
"""Fail-closed verifier for Gyroscope test telemetry ('[gyro-test]' logcat lines).

Independently re-implements the documented gyroMath/gyroControl model in
Python and checks every emitted snapshot against it. Expected impulse/torque/
reset/slow values are derived from the scripted inputs and the documented
model here, never from emitted verdicts. Any FAIL or any missing required
evidence exits nonzero (fail-closed).

Legs: the diagnostics script emits a 'LEG-RM-BEGIN' logcat line, then
relaunches the showcase with ?telemetry=1&reducedMotion=1. Lines before the
marker are the normal leg (flick + drag + slow + reset scripted), lines after
are the reduced-motion freeze leg.

Usage: gyro-telemetry-verify.py <logcat-file>
"""
import json, math, sys

# --- Independent port of the documented model (gyroMath.ts/gyroControl.ts) ---
MASS, R, H = .15, .045, .008
P = dict(outerJ=3.2e-5, innerTransverseJ=1.8e-5, innerAxialJ=3.6e-5,
         rotorTransverseJ=MASS * (R * R / 4 + H * H / 12 + .0015 * .0015),
         rotorAxialJ=MASS * R * R / 2,
         gravityMoment=MASS * 9.81 * .0015,
         yawDrag=2e-6, tiltDrag=3e-6, spinDrag=2e-6, fixedDt=1 / 960)

def deriv(v, tq):
    c, s = math.cos(v[1]), math.sin(v[1])
    B = P['innerTransverseJ'] + P['rotorTransverseJ']
    D = P['outerJ'] + B * s * s + P['innerAxialJ'] * c * c
    a = (v[3] - c * v[5]) / D
    b = v[4] / B
    g = v[5] / P['rotorAxialJ'] - c * a
    def grip(pos, rate, target):
        if target is None:
            return 0.0
        return max(-.008, min(.008, .003 * (target - pos) - .00045 * rate))
    return [a, b, g,
            tq['yaw'] + grip(v[0], a, tq.get('targetYaw')) - P['yawDrag'] * a,
            a * a * (B - P['innerAxialJ']) * s * c - a * v[5] * s + P['gravityMoment'] * s
                + tq['tilt'] + grip(v[1], b, tq.get('targetTilt')) - P['tiltDrag'] * b,
            tq['spin'] - P['spinDrag'] * g]

def substep(st, tq, dt):
    v = st['v']
    k1 = deriv(v, tq)
    k2 = deriv([v[i] + dt * .5 * k1[i] for i in range(6)], tq)
    k3 = deriv([v[i] + dt * .5 * k2[i] for i in range(6)], tq)
    k4 = deriv([v[i] + dt * k3[i] for i in range(6)], tq)
    for i in range(6):
        v[i] += dt / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])
    st['t'] += dt

def step(st, seconds, tq):
    accepted = min(max(0.0, seconds), .1)
    st['dropped'] += max(0.0, seconds - accepted)
    st['acc'] += accepted
    steps = 0
    B = P['innerTransverseJ'] + P['rotorTransverseJ']
    while st['acc'] > 1e-12 and steps < 4096:
        h = min(P['fixedDt'], .12 * B / max(abs(st['v'][5]), 1e-8))
        if st['acc'] < h - 1e-12:
            break
        substep(st, tq, h)
        st['acc'] -= h
        steps += 1
    if steps == 4096:
        st['dropped'] += st['acc']
        st['acc'] = 0.0

def drive(st, inp, seconds, last_impulse):
    if inp['impulseId'] != last_impulse:
        st['v'][3] += inp['spinImpulse'] * math.cos(st['v'][1])
        st['v'][5] += inp['spinImpulse']
    tq = {'yaw': 0.0, 'tilt': 0.0, 'spin': 0.0}
    if inp['active']:
        tq['targetYaw'] = inp['targetYaw']
        tq['targetTilt'] = inp['targetTilt']
    step(st, seconds, tq)
    return inp['impulseId']

def create_gyro(spin):
    return {'v': [.25, .95, 0.0, P['rotorAxialJ'] * spin * math.cos(.95), 0.0,
                  P['rotorAxialJ'] * spin],
            'acc': 0.0, 't': 0.0, 'dropped': 0.0}

def from_snap(snap):
    return {'v': [float(x) for x in snap['v']], 'acc': float(snap['acc']),
            't': float(snap['simT']), 'dropped': float(snap['dropped'])}

REL_TOL, ABS_TOL = 1e-7, 1e-12
def state_err(st, snap):
    worst = 0.0
    for a, b in zip(st['v'], snap['v']):
        worst = max(worst, abs(a - b) / max(abs(a), 1e-9))
    return worst, max(abs(st['t'] - snap['simT']), abs(st['dropped'] - snap['dropped']),
                      abs(st['acc'] - snap['acc']))

def main():
    path = sys.argv[1]
    try:
        lines = open(path, encoding='utf-8', errors='replace').read().splitlines()
    except OSError as e:
        print('VERIFY FAIL: cannot read logcat file: %s' % e)
        return 1
    marker = next((i for i, ln in enumerate(lines) if 'LEG-RM-BEGIN' in ln), len(lines))
    def events(chunk):
        out = []
        for ln in chunk:
            if '[gyro-test]' not in ln or '{' not in ln:
                continue
            try:
                out.append(json.loads(ln[ln.index('{'):ln.rindex('}') + 1]))
            except (ValueError, json.JSONDecodeError):
                pass
        return out
    normal, rm = events(lines[:marker]), events(lines[marker:])
    snaps = [e for e in normal if e.get('kind') == 'snap']
    grabs = [e for e in normal if e.get('kind') == 'grab']
    spins = [e for e in normal if e.get('kind') == 'spin']
    resets = [e for e in normal if e.get('kind') == 'reset']
    results = []
    def check(name, ok, evidence):
        results.append((name, bool(ok), evidence))
        print('ASSERT %s %s %s' % (name, 'PASS' if ok else 'FAIL', evidence))

    check('bridge', any(e.get('kind') == 'bridge' for e in normal),
          'bridge_events=%d' % sum(1 for e in normal if e.get('kind') == 'bridge'))
    check('snap-count', len(snaps) >= 8, 'normal_snaps=%d (need >=8)' % len(snaps))
    check('event-sequence',
          len(spins) >= 1 and len(grabs) >= 2 and len(resets) >= 1
          and resets[0].get('wallT', 0) > spins[0].get('wallT', 0)
          and any(g.get('mode') == 'spin' for g in grabs)
          and any(g.get('mode') == 'frame' for g in grabs),
          'grabs=%d spins=%d resets=%d' % (len(grabs), len(spins), len(resets)))
    if spins:
        js = [float(e.get('j', 0)) for e in spins]
        check('spin-impulse-sign',
              all(-0.009 <= j < 0 for j in js),
              'j=%s (sign/bound from scripted leftward swipe only; magnitude-vs-gesture is NOT provable from scripted input)'
              % ','.join('%g' % j for j in js))
        missing = [e.get('impulseId') for e in spins
                   if not any(s.get('seenImpulse', 0) >= e.get('impulseId', -1)
                              and abs(float(s['input']['spinImpulse']) - float(e.get('j', 0))) < 1e-12
                              for s in snaps)]
        check('impulse-applied',
              not missing,
              'spin_events=%d unapplied=%s (recorded j must appear in a snapshot)'
              % (len(spins), missing))
    else:
        check('spin-impulse-sign', False, 'no spin event')
        check('impulse-applied', False, 'no spin event')

    # Replay only PROVABLY contiguous frame pairs (post.frame == pre.frame+1):
    # with bounded-cadence snapshots, intervening frames and input changes are
    # not recorded, so replay across a gap is impossible and is skipped, never
    # assumed. Too few contiguous pairs fails closed.
    worst_v, worst_t, pairs, epoch_skips, sparse_skips = 0.0, 0.0, 0, 0, 0
    for pre, post in zip(snaps, snaps[1:]):
        if pre.get('seenReset') != post.get('seenReset'):
            epoch_skips += 1
            continue
        if post.get('frame') != pre.get('frame', 0) + 1:
            sparse_skips += 1
            continue
        st = from_snap(pre)
        drive(st, post['input'], float(post['dtReq']), pre['seenImpulse'])
        ev, et = state_err(st, post)
        worst_v, worst_t = max(worst_v, ev), max(worst_t, et)
        pairs += 1
    check('step-consistency',
          pairs >= 6 and worst_v <= REL_TOL and worst_t <= 1e-9,
          'contiguous_pairs=%d epoch_skips=%d sparse_skips=%d max_rel_v=%.3g max_abs_t=%.3g (independent model port; non-contiguous pairs skipped, never assumed)'
          % (pairs, epoch_skips, sparse_skips, worst_v, worst_t))

    slow_ok, slow_n = True, 0
    for pre, post in zip(snaps, snaps[1:]):
        if pre.get('seenReset') != post.get('seenReset') or pre.get('slow') != post.get('slow'):
            continue
        if post.get('frame') != pre.get('frame', 0) + 1:
            continue
        gap = (post['wallT'] - pre['wallT']) / 1000.0
        if gap <= 0.05:
            continue
        ratio = float(post['dtReq']) / gap
        want = .25 if post['slow'] else 1.0
        slow_n += 1
        if abs(ratio - want) > (.0625 if post['slow'] else .15):
            slow_ok = False
    check('slow-ratio',
          slow_n >= 4 and slow_ok and any(s.get('slow') for s in snaps),
          'checked_contiguous_pairs=%d ok=%s (dtReq/wall-gap vs documented x0.25; robust to saturated-fps clamp)'
          % (slow_n, slow_ok))

    post_reset = [s for s in snaps if s.get('seenReset', 0) > 0]
    if resets and post_reset:
        s = post_reset[0]
        st = create_gyro(0 if s.get('reduce') else 45)
        drive(st, s['input'], float(s['dtReq']), 0)
        ev, et = state_err(st, s)
        check('reset-state',
              ev <= REL_TOL and et <= 1e-9 and not s['input']['active'],
              'max_rel_v=%.3g max_abs_t=%.3g (expected = documented createGyro initial + one frame)'
              % (ev, et))
    else:
        check('reset-state', False, 'resets=%d post_reset_snaps=%d' % (len(resets), len(post_reset)))

    stepped = [float(s.get('stepMs', -1)) for s in snaps if not s.get('reduce')]
    check('stepms-present',
          stepped and all(x >= 0 for x in stepped),
          'median_stepMs=%.3g n=%d (sim-step compute only; NOT a render-smoothness gate)'
          % (sorted(stepped)[len(stepped) // 2] if stepped else -1, len(stepped)))

    rm_snaps = [e for e in rm if e.get('kind') == 'snap']
    if marker < len(lines) and rm_snaps:
        ts = [float(s['simT']) for s in rm_snaps]
        frozen = max(ts) - min(ts) == 0.0
        v0 = json.dumps(rm_snaps[0]['v'])
        check('rm-leg',
              len(rm_snaps) >= 2 and all(s.get('reduce') for s in rm_snaps)
              and frozen and all(json.dumps(s['v']) == v0 for s in rm_snaps)
              and all(float(s.get('stepMs', -1)) == 0.0 for s in rm_snaps)
              and all(not s['input']['active'] for s in rm_snaps),
              'rm_snaps=%d frozen=%s t=%.6g (reduced motion must freeze the sim exactly)'
              % (len(rm_snaps), frozen, ts[0]))
    else:
        check('rm-leg', False, 'marker=%s rm_snaps=%d' % (marker < len(lines), len(rm_snaps)))

    failed = [n for n, ok, _ in results if not ok]
    print('VERIFY %s (%d/%d checks passed%s)'
          % ('FAIL' if failed else 'PASS', len(results) - len(failed), len(results),
             '; failed: ' + ', '.join(failed) if failed else ''))
    return 1 if failed else 0

if __name__ == '__main__':
    sys.exit(main())
