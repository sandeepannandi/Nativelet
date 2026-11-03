// Original pin-board model. Pins slide only on their own axes. Static friction
// holds each target after release; viscous damping settles the contact motion.
export const PA_W = 340, PA_H = 414, PA_COLS = 29, PA_ROWS = 35;
export const PA_N = PA_COLS * PA_ROWS, PA_PITCH = 9.6, PA_X = 35.6, PA_Y = 54;
export type PinState = { h: number[]; v: number[]; target: number[]; wipe: number; wiping: boolean };
export function pinBase(i: number) {
  'worklet';
  return { x: PA_X + (i % PA_COLS) * PA_PITCH, y: PA_Y + Math.floor(i / PA_COLS) * PA_PITCH };
}
export function createPins(initial = true): PinState {
  'worklet';
  const h: number[] = [];
  for (let i = 0; i < PA_N; i++) {
    const p = pinBase(i), d = Math.hypot((p.x - 170) / 1.03, p.y - 215);
    // A quiet annular impression makes the axial relief visible before touch.
    h.push(initial ? 25 * Math.exp(-Math.pow((d - 66) / 24, 2)) : 0);
  }
  return { h, v: Array(PA_N).fill(0), target: h.slice(), wipe: -1, wiping: false };
}
export function pressPins(s: PinState, x: number, y: number, erase = false) {
  'worklet';
  if (s.wiping) return;
  for (let i = 0; i < PA_N; i++) {
    const p = pinBase(i);
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < 41) {
      const relief = 32 * Math.pow(Math.cos(Math.min(1, d / 41) * Math.PI / 2), 1.5);
      s.target[i] = erase ? Math.min(s.target[i], 32 - relief) : Math.max(s.target[i], relief);
    }
  }
}
export function wipePins(s: PinState) { 'worklet'; s.wiping = true; s.wipe = -18; }
export function stepPins(s: PinState, elapsed: number, immediate = false) {
  'worklet';
  const dt = Math.max(0, Math.min(2, elapsed));
  if (s.wiping) {
    s.wipe += dt * 390;
    for (let i = 0; i < PA_N; i++) if (pinBase(i).x < s.wipe) s.target[i] = 0;
    if (s.wipe > PA_W + 10) { s.wiping = false; s.wipe = -1; }
  }
  // Closed-form critically damped response. Unlike a clipped fixed-step
  // integrator this preserves elapsed time when a software renderer stalls.
  const omega = 24, decay = Math.exp(-omega * dt);
  for (let i = 0; i < PA_N; i++) {
    if (immediate) { s.h[i] = s.target[i]; s.v[i] = 0; continue; }
    const delta = s.h[i] - s.target[i], c = s.v[i] + omega * delta;
    let h = s.target[i] + (delta + c * dt) * decay;
    let v = (s.v[i] - omega * c * dt) * decay;
    if (Math.abs(h - s.target[i]) < 0.005 && Math.abs(v) < 0.03) { h = s.target[i]; v = 0; }
    s.h[i] = Math.max(0, Math.min(32, h)); s.v[i] = v;
  }
}
export function pinHead(s: PinState, i: number) {
  'worklet';
  const p = pinBase(i), h = s.h[i];
  return { x: p.x + h * 0.18, y: p.y - h * 0.55 };
}
// Batched passes use identical geometry on Skia and Canvas2D. Neighbour slopes
// steer the small specular highlight rather than animating a fake shimmer.
export function pinPoints(s: PinState, pass: number) {
  'worklet';
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < PA_N; i++) {
    const p = pinBase(i), q = pinHead(s, i), h = s.h[i];
    if (pass === 0) { out.push({ x: p.x + h * .24 + 1, y: p.y + 2 }, { x: q.x + 1, y: q.y + 2 }); }
    else if (pass === 1) out.push(p, q);
    else if (pass === 2) out.push(q);
    else if (pass === 3) out.push({ x: q.x - .35, y: q.y - .55 });
    else if (pass === 4) out.push({ x: q.x + .65, y: q.y + .75 });
    else {
      const left = i % PA_COLS > 0 ? s.h[i - 1] : h;
      const up = i >= PA_COLS ? s.h[i - PA_COLS] : h;
      out.push({ x: q.x - .8 + Math.max(-.5, Math.min(.5, (h - left) * .06)), y: q.y - 1.05 + Math.max(-.4, Math.min(.4, (h - up) * .05)) });
    }
  }
  return out;
}
export const PIN_COLORS = ['#020507', '#57636b', '#2d363d', '#b1bec7', '#55636e', '#f3f8fa'];
export const PIN_WIDTHS = [5.8, 2.2, 6.3, 4.6, 3.2, 1.9];
