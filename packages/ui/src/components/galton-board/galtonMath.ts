/* Galton board shared simulation. Pure TypeScript, no closures over
   component state, so Reanimated can run every function on the UI thread.
   Model: identical rigid wooden beads under gravity on a fixed quincunx of
   brass pegs. Circle-vs-peg deflections with restitution, sequential
   ball-ball impulses over a uniform spatial hash, wall/divider/floor
   contacts, and a sleep state for piled beads (woken by hard knocks or by
   the board tilting). The bell curve is never scripted: it emerges from the
   collision geometry exactly like the real bean machine. Tilting rotates
   the gravity vector in board coordinates - physically identical to
   rotating the board while the camera stays put.
   This is an impulse solver over circular contacts, not a finite-element
   contact model - the same idealisation the other desk toys use. */

export type GaltonPhysics = {
  rows: number;
  sx: number;
  sy: number;
  pegY0: number;
  cx: number;
  pegR: number;
  ballR: number;
  wallL: number;
  wallR: number;
  ceilY: number;
  floorY: number;
  binTop: number;
  maxBalls: number;
  pourRate: number;
  gravity: number;
  restPeg: number;
  pegJitter: number;
  restBall: number;
  restWall: number;
  sleepSpeed: number;
  sleepDelay: number;
  wakeSpeed: number;
  tiltMax: number;
  tiltEase: number;
  fixedDt: number;
};

export const GALTON_DEFAULTS: GaltonPhysics = {
  rows: 10,
  sx: 46,
  sy: 38,
  pegY0: 150,
  cx: 288,
  pegR: 6,
  ballR: 6,
  wallL: 34,
  wallR: 542,
  ceilY: 26,
  floorY: 688,
  binTop: 504,
  maxBalls: 200,
  pourRate: 15,
  gravity: 2600,
  restPeg: 0.35,
  pegJitter: 1.6,
  restBall: 0.24,
  restWall: 0.4,
  sleepSpeed: 55,
  sleepDelay: 0.15,
  wakeSpeed: 120,
  tiltMax: 0.12,
  tiltEase: 10,
  fixedDt: 1 / 240,
};

export type GaltonState = {
  n: number;
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  sleep: Uint8Array;
  counted: Uint8Array;
  sleepT: Float32Array;
  contactT: Float32Array;
  beadT: Float32Array;
  pileT: Float32Array;
  rng: number;
  tilt: number;
  tiltTarget: number;
  spawnAcc: number;
  pouring: number;
  acc: number;
  time: number;
  settled: number;
  head: Int32Array;
  next: Int32Array;
  lastImpactAt: number;
};

const CELL = 14;
const COLS = 42; /* ceil(588 / 14) covers the panel with margin */
const ROWS_G = 52; /* ceil(720 / 14) */

export function createGalton(p: GaltonPhysics, seed = 22222): GaltonState {
  "worklet";
  return {
    n: 0,
    x: new Float32Array(p.maxBalls),
    y: new Float32Array(p.maxBalls),
    vx: new Float32Array(p.maxBalls),
    vy: new Float32Array(p.maxBalls),
    sleep: new Uint8Array(p.maxBalls),
    counted: new Uint8Array(p.maxBalls),
    sleepT: new Float32Array(p.maxBalls),
    contactT: new Float32Array(p.maxBalls).fill(-1),
    beadT: new Float32Array(p.maxBalls).fill(-1),
    pileT: new Float32Array(p.maxBalls).fill(-1),
    rng: seed | 0 || 1,
    tilt: 0,
    tiltTarget: 0,
    spawnAcc: 0,
    pouring: 0,
    acc: 0,
    time: 0,
    settled: 0,
    head: new Int32Array(COLS * ROWS_G),
    next: new Int32Array(p.maxBalls),
    lastImpactAt: -10,
  };
}

export function resetGalton(s: GaltonState) {
  "worklet";
  s.n = 0;
  s.spawnAcc = 0;
  s.acc = 0;
  s.settled = 0;
  s.sleep.fill(0);
  s.counted.fill(0);
  s.sleepT.fill(0);
  s.contactT.fill(-1);
  s.beadT.fill(-1);
  s.pileT.fill(-1);
}

function rand(s: GaltonState): number {
  "worklet";
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function spawnBall(s: GaltonState, p: GaltonPhysics) {
  "worklet";
  const i = s.n;
  s.x[i] = p.cx + (rand(s) - 0.5) * 16;
  s.y[i] = 110;
  s.vx[i] = (rand(s) - 0.5) * 24;
  s.vy[i] = 120;
  s.sleep[i] = 0;
  s.counted[i] = 0;
  s.sleepT[i] = 0;
  s.contactT[i] = -1;
  s.n++;
}

export function dropOne(s: GaltonState, p: GaltonPhysics) {
  "worklet";
  if (s.n < p.maxBalls) spawnBall(s, p);
}

export function setPouring(s: GaltonState, on: boolean) {
  "worklet";
  s.pouring = on ? 1 : 0;
}

export function setTiltTarget(s: GaltonState, p: GaltonPhysics, t: number) {
  "worklet";
  s.tiltTarget = Math.max(-p.tiltMax, Math.min(p.tiltMax, t));
}

export function binIndex(p: GaltonPhysics, x: number): number {
  "worklet";
  const firstDivider = p.cx - ((p.rows - 1) / 2) * p.sx;
  const lastDivider = p.cx + ((p.rows - 1) / 2) * p.sx;
  if (x < firstDivider) return 0;
  if (x >= lastDivider) return p.rows;
  const k = Math.round((x - p.cx) / p.sx + p.rows / 2);
  return Math.max(1, Math.min(p.rows - 1, k));
}

export function binCounts(s: GaltonState, p: GaltonPhysics, out: Float64Array) {
  "worklet";
  out.fill(0);
  for (let i = 0; i < s.n; i++) {
    if (s.counted[i]) out[binIndex(p, s.x[i])]++;
  }
}

function wake(s: GaltonState, i: number) {
  "worklet";
  if (s.sleep[i]) {
    s.sleep[i] = 0;
    s.sleepT[i] = 0;
    if (s.counted[i]) {
      s.counted[i] = 0;
      s.settled--;
    }
  }
}

function collideStatics(s: GaltonState, p: GaltonPhysics, i: number) {
  "worklet";
  const r = p.ballR;
  let x = s.x[i], y = s.y[i];
  /* panel walls, ceiling and floor */
  if (x < p.wallL + r) {
    x = p.wallL + r;
    if (s.vx[i] < 0) {
      s.vx[i] = -s.vx[i] * p.restWall;
      s.contactT[i] = s.time;
    }
  } else if (x > p.wallR - r) {
    x = p.wallR - r;
    if (s.vx[i] > 0) {
      s.vx[i] = -s.vx[i] * p.restWall;
      s.contactT[i] = s.time;
    }
  }
  if (y < p.ceilY + r) {
    y = p.ceilY + r;
    if (s.vy[i] < 0) s.vy[i] = -s.vy[i] * p.restWall;
  } else if (y > p.floorY - r) {
    y = p.floorY - r;
    if (s.vy[i] > 0) {
      s.vy[i] = s.vy[i] > 150 ? -s.vy[i] * p.restWall : 0;
      s.vx[i] *= 0.985;
      s.contactT[i] = s.time;
    }
  }
  /* bin dividers: vertical segments from binTop to the floor, one below
     each last-row peg */
  if (y > p.binTop - r) {
    const kNear = Math.round((x - (p.cx - (p.rows - 1) / 2 * p.sx)) / p.sx);
    for (let k = Math.max(0, kNear - 1); k <= Math.min(p.rows - 1, kNear + 1); k++) {
      const xd = p.cx + (k - (p.rows - 1) / 2) * p.sx;
      const dx = x - xd;
      if (Math.abs(dx) < r + 3 && y > p.binTop) {
        const side = dx >= 0 ? 1 : -1;
        x = xd + side * (r + 3);
        if (s.vx[i] * side < 0) {
          s.vx[i] = -s.vx[i] * p.restWall;
          s.vy[i] *= 0.99;
          s.contactT[i] = s.time;
        }
      }
    }
  }
  /* pegs: only the rows this ball can actually touch */
  const reach = p.pegR + r + 2;
  let rLo = Math.ceil((y - p.pegY0 - reach) / p.sy) + 1;
  let rHi = Math.floor((y - p.pegY0 + reach) / p.sy) + 1;
  if (rLo < 1) rLo = 1;
  if (rHi > p.rows) rHi = p.rows;
  for (let row = rLo; row <= rHi; row++) {
    const py = p.pegY0 + (row - 1) * p.sy;
    for (let j = 0; j < row; j++) {
      const px = p.cx + (j - (row - 1) / 2) * p.sx;
      const dx = x - px;
      const dy = y - py;
      const minD = p.pegR + r;
      const d2 = dx * dx + dy * dy;
      if (d2 < minD * minD && d2 > 1e-9) {
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        x = px + nx * (minD + 0.01);
        y = py + ny * (minD + 0.01);
        const vn = s.vx[i] * nx + s.vy[i] * ny;
        if (vn < 0) {
          const e = -vn > 150 ? p.restPeg : 0;
          s.vx[i] -= (1 + e) * vn * nx;
          s.vy[i] -= (1 + e) * vn * ny;
          /* brass-on-wood contact eats most of the slide, so each row
             re-randomises the fall instead of momentum carrying the bead
             outward row after row */
          const tx = -ny, ty = nx;
          let vt = s.vx[i] * tx + s.vy[i] * ty;
          s.vx[i] -= vt * 0.55 * tx;
          s.vy[i] -= vt * 0.55 * ty;
          /* bead and peg micro-roughness: on a real hit the clatter knocks
             the bead's sideways drive into a fresh direction, the same
             effect grain and dents have on the toy - without it a bead
             bouncing down the flanks keeps its first direction forever,
             which real beads do not */
          if (-vn > 60) {
            const spN = Math.hypot(s.vx[i], s.vy[i]);
            s.vx[i] = s.vx[i] * 0.5 + (rand(s) - 0.5) * spN * p.pegJitter;
          }
          s.contactT[i] = s.time;
          if (vn < -60) s.lastImpactAt = s.time;
        }
      }
    }
  }
  s.x[i] = x;
  s.y[i] = y;
}

function collidePairs(s: GaltonState, p: GaltonPhysics) {
  "worklet";
  const r2 = 2 * p.ballR;
  for (let i = 0; i < s.n; i++) {
    const cxi = Math.max(0, Math.min(COLS - 1, Math.floor(s.x[i] / CELL)));
    const cyi = Math.max(0, Math.min(ROWS_G - 1, Math.floor(s.y[i] / CELL)));
    for (let gx = Math.max(0, cxi - 1); gx <= Math.min(COLS - 1, cxi + 1); gx++) {
      for (let gy = Math.max(0, cyi - 1); gy <= Math.min(ROWS_G - 1, cyi + 1); gy++) {
        let j = s.head[gy * COLS + gx];
        while (j >= 0) {
          if (j > i && !(s.sleep[i] && s.sleep[j])) {
            const dx = s.x[j] - s.x[i];
            const dy = s.y[j] - s.y[i];
            const d2 = dx * dx + dy * dy;
            if (d2 < r2 * r2) {
              let d = Math.sqrt(d2);
              let nx: number, ny: number;
              if (d2 > 1e-9) {
                nx = dx / d;
                ny = dy / d;
              } else {
                /* perfectly stacked spawns: separate on index parity */
                nx = (i + j) % 2 === 0 ? 1 : -1;
                ny = 0;
                d = 1e-4;
              }
              const overlap = r2 - d - 0.4;
              const rvn = (s.vx[i] - s.vx[j]) * nx + (s.vy[i] - s.vy[j]) * ny;
              const si = s.sleep[i] > 0;
              const sj = s.sleep[j] > 0;
              s.beadT[i] = s.time;
              s.beadT[j] = s.time;
              if (rvn > 0) {
                if (si || sj) {
                  /* a bead pile is not a wall: landing energy dissipates
                     through the granules, so resting contacts absorb almost
                     all of the bounce and most of the slide */
                  const e = rvn > 150 ? 0.15 : 0;
                  const f = si ? j : i;
                  const sgn = si ? 1 : -1;
                  s.vx[f] += sgn * (1 + e) * rvn * nx;
                  s.vy[f] += sgn * (1 + e) * rvn * ny;
                  s.vx[f] *= 0.7;
                  s.vy[f] *= 0.85;
                  s.pileT[f] = s.time;
                  if (rvn > p.wakeSpeed) wake(s, si ? i : j);
                } else {
                  const e = rvn > 150 ? p.restBall : 0;
                  const imp = ((1 + e) * rvn) / 2;
                  s.vx[i] -= imp * nx;
                  s.vy[i] -= imp * ny;
                  s.vx[j] += imp * nx;
                  s.vy[j] += imp * ny;
                  /* wood on wood scrubs a quarter of the slide */
                  const tx = -ny, ty = nx;
                  const vt = ((s.vx[i] - s.vx[j]) * tx + (s.vy[i] - s.vy[j]) * ty) * 0.06;
                  s.vx[i] -= vt * tx;
                  s.vy[i] -= vt * ty;
                  s.vx[j] += vt * tx;
                  s.vy[j] += vt * ty;
                }
                if (rvn > 60) s.lastImpactAt = s.time;
                s.contactT[i] = s.time;
                s.contactT[j] = s.time;
              }
              if (overlap > 0) {
                if (si) {
                  s.x[j] += nx * overlap * 0.6;
                  s.y[j] += ny * overlap * 0.6;
                } else if (sj) {
                  s.x[i] -= nx * overlap * 0.6;
                  s.y[i] -= ny * overlap * 0.6;
                } else {
                  s.x[i] -= nx * overlap * 0.3;
                  s.y[i] -= ny * overlap * 0.3;
                  s.x[j] += nx * overlap * 0.3;
                  s.y[j] += ny * overlap * 0.3;
                }
              }
            }
          }
          j = s.next[j];
        }
      }
    }
  }
}

function substep(s: GaltonState, p: GaltonPhysics, dt: number) {
  "worklet";
  /* tilt eases toward the drag target; a changing tilt wakes the piles so
     they can slump the way beads do on a real tilted board */
  const prevTilt = s.tilt;
  s.tilt += (s.tiltTarget - s.tilt) * (1 - Math.exp(-p.tiltEase * dt));
  if (Math.abs(s.tilt - prevTilt) > 0.0004) {
    for (let i = 0; i < s.n; i++) wake(s, i);
  }
  const gx = p.gravity * Math.sin(s.tilt);
  const gy = p.gravity * Math.cos(s.tilt);
  if (s.pouring && s.n < p.maxBalls) {
    s.spawnAcc += p.pourRate * dt;
    while (s.spawnAcc >= 1 && s.n < p.maxBalls) {
      spawnBall(s, p);
      s.spawnAcc -= 1;
    }
  }
  for (let i = 0; i < s.n; i++) {
    if (s.sleep[i]) continue;
    s.vx[i] += gx * dt;
    s.vy[i] += gy * dt;
    s.x[i] += s.vx[i] * dt;
    s.y[i] += s.vy[i] * dt;
    collideStatics(s, p, i);
    /* beads touching anything while slow inside the bin zone - or touching
       another bead in the mound that crests above the bin mouths when the
       hopper is full - shed energy hard, the way beads resting in a pile do,
       so the sleep state can engage instead of the pile boiling forever.
       Bead contact specifically, so a bead clattering down the pegs keeps
       its energy. */
    const touching = s.time - s.contactT[i] < p.fixedDt * 1.5;
    const onPile = s.time - s.pileT[i] < 0.3;
    if ((s.y[i] > p.binTop - 10 && touching) || (s.y[i] > p.binTop - 340 && onPile)) {
      const sp = Math.hypot(s.vx[i], s.vy[i]);
      if (sp < 260) {
        const keep = Math.max(0, 1 - 25 * dt);
        s.vx[i] *= keep;
        s.vy[i] *= keep;
      }
    }
  }
  /* rebuild the spatial hash */
  s.head.fill(-1);
  for (let i = 0; i < s.n; i++) {
    const cx = Math.max(0, Math.min(COLS - 1, Math.floor(s.x[i] / CELL)));
    const cy = Math.max(0, Math.min(ROWS_G - 1, Math.floor(s.y[i] / CELL)));
    const c = cy * COLS + cx;
    s.next[i] = s.head[c];
    s.head[c] = i;
  }
  for (let pass = 0; pass < 3; pass++) collidePairs(s, p);
  for (let i = 0; i < s.n; i++) {
    if (!s.sleep[i]) collideStatics(s, p, i);
  }
  /* sleep bookkeeping: slow, supported beads in the bin zone nod off */
  for (let i = 0; i < s.n; i++) {
    if (s.sleep[i]) continue;
    const sp = Math.hypot(s.vx[i], s.vy[i]);
    const inBins = s.y[i] > p.binTop - 44;
    /* a bead creeping on top of already-sleeping beads is part of the pile,
       however high the heap has crested - sleeping beads only ever exist in
       the bins or the mound, so contact with one is the safe signal */
    const onPile = s.time - s.pileT[i] < 0.3;
    const inMound = onPile;
    /* piles nod off when creeping inside the bins, or when resting on other
       beads in the mound above the bin mouths; a bead balanced on a peg
       keeps micro-jittering until it slips off - only near the bins does
       long stillness freeze a bead */
    if ((inBins && sp < p.sleepSpeed) || (inMound && sp < p.sleepSpeed) || (sp < 4 && s.y[i] > p.binTop - 30)) {
      s.sleepT[i] += dt;
      if (s.sleepT[i] > (inBins || inMound ? p.sleepDelay : 1.5)) {
        s.sleep[i] = 1;
        s.vx[i] = 0;
        s.vy[i] = 0;
        if (!s.counted[i]) {
          s.counted[i] = 1;
          s.settled++;
        }
      }
    } else {
      s.sleepT[i] = 0;
    }
  }
  s.time += dt;
}

export function stepGalton(s: GaltonState, dtFrame: number, p: GaltonPhysics) {
  "worklet";
  s.acc += Math.min(dtFrame, 0.05);
  const dt = p.fixedDt;
  let guard = 0;
  while (s.acc >= dt && guard < 24) {
    substep(s, p, dt);
    s.acc -= dt;
    guard++;
  }
  if (guard >= 24) s.acc = 0;
}
