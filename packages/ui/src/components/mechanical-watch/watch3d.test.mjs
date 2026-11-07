/* Pixel test: rasterize the watch scene with a real scanline filler into an
   RGB buffer; assert coverage/variance/highlight; write /tmp/watch.ppm. */
import { buildWatchScene, renderWatch, lathe, renderFrame, rasterizeZB } from './watch3d.ts';
import { writeFileSync } from 'node:fs';

const S = 400;
const SS = 2;             // supersample: point-sampled at 2x then box-downsampled, mimicking Skia/Canvas2D antialiasing
const R = S * SS;
const scene = buildWatchScene();
const out = [];
renderWatch(scene, {
  barrel: 0, center: 0.3, third: 0.6, fourth: 1, escape: 0.5,
  fork: 0.05, balance: 1.2, hour: 0.5, minute: 2.2, second: 4, crown: 0.8,
}, { yaw: 0.35, pitch: 0.55, dist: 150, fov: 0.73, cx: 0, cy: 0 }, R, out);

const buf = new Uint8Array(R * R * 3);
buf.fill(12);   // dark background
function fillTri(t) {
  const ys = [t.y0, t.y1, t.y2], xs = [t.x0, t.x1, t.x2];
  const yMin = Math.max(0, Math.floor(Math.min(...ys)));
  const yMax = Math.min(R - 1, Math.ceil(Math.max(...ys)));
  for (let y = yMin; y <= yMax; y++) {
    const hits = [];
    for (let e = 0; e < 3; e++) {
      const [x0, y0] = [xs[e], ys[e]];
      const [x1, y1] = [xs[(e + 1) % 3], ys[(e + 1) % 3]];
      if (y0 === y1) continue;
      const yy = y + 0.5;
      if (yy < Math.min(y0, y1) || yy >= Math.max(y0, y1)) continue;
      hits.push(x0 + ((yy - y0) / (y1 - y0)) * (x1 - x0));
    }
    if (hits.length < 2) continue;
    hits.sort((a, b) => a - b);
    const x0 = Math.max(0, Math.floor(hits[0] - 0.5)), x1 = Math.min(R - 1, Math.ceil(hits[hits.length - 1] - 0.5));
    for (let x = x0; x <= x1; x++) {
      if (x + 0.5 < hits[0] || x + 0.5 >= hits[hits.length - 1]) continue;   // pixel-center rule: no overfill, no cracks on shared edges
      const o = (y * R + x) * 3;
      buf[o] = Math.round(t.r * 255); buf[o + 1] = Math.round(t.g * 255); buf[o + 2] = Math.round(t.b * 255);
    }
  }
}
for (const t of out) fillTri(t);

// box-downsample R -> S (evidence of what an antialiased renderer shows)
const img = new Uint8Array(S * S * 3);
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  let r = 0, g = 0, b = 0;
  for (let dy = 0; dy < SS; dy++) for (let dx = 0; dx < SS; dx++) {
    const o = ((y * SS + dy) * R + (x * SS + dx)) * 3;
    r += buf[o]; g += buf[o + 1]; b += buf[o + 2];
  }
  const n = SS * SS, o = (y * S + x) * 3;
  img[o] = r / n; img[o + 1] = g / n; img[o + 2] = b / n;
}
// assertions: coverage, color variance, bright speculars, gold pixels present
let covered = 0, bright = 0, gold = 0, sum = 0, sq = 0;
for (let i = 0; i < S * S; i++) {
  const r = img[i * 3], g = img[i * 3 + 1], b = img[i * 3 + 2];
  if (r !== 12 || g !== 12 || b !== 12) covered++;
  if (r > 220 && g > 220 && b > 220) bright++;
  if (r > 150 && g > 110 && b < 110) gold++;
  const l = r + g + b; sum += l; sq += l * l;
}
const mean = sum / (S * S), sd = Math.sqrt(sq / (S * S) - mean * mean);
console.log(`tris=${out.length} covered=${(100 * covered / (S * S)).toFixed(1)}% bright=${bright} gold=${gold} sd=${sd.toFixed(1)}`);
if (covered / (S * S) < 0.15) throw new Error('FAIL: watch covers <15% of frame');
if (sd < 10) throw new Error('FAIL: flat image');
if (bright < 40) throw new Error('FAIL: no specular highlights');
if (gold < 200) throw new Error('FAIL: no brass gear pixels');
// PPM out
const header = Buffer.from(`P6\n${S} ${S}\n255\n`);
writeFileSync('/tmp/watch.ppm', Buffer.concat([header, Buffer.from(img.buffer)]));
console.log('wrote /tmp/watch.ppm');

// Regression: lathe quad vertices must sit at their OWN angle and radius.
// The D-vertex bug mixed x=cos(a1) with y=sin(a0), displacing vertices off
// their circle by up to r*da and punching real holes in every lathe mesh.
{
  const prof = [[45.8, 13.5], [50.1, 13.3], [51.2, 11.9], [51.2, 10.0]];
  const m = lathe(prof, 256, [1, 1, 1], 0);
  let bad = 0;
  for (let i = 0; i < m.pos.length; i += 3) {
    const x = m.pos[i], y = m.pos[i + 1], z = m.pos[i + 2];
    const r = Math.hypot(x, y);
    const onProfile = prof.some(([pr, pz]) => Math.abs(pr - r) < 1e-5 && Math.abs(pz - z) < 1e-6);
    if (!onProfile) bad++;
  }
  if (bad > 0) throw new Error('FAIL: ' + bad + ' lathe vertices off their profile circle');
}

// Regression: a closed lathe primitive must render with zero enclosed
// background holes at a grazing angle (silhouette teeth must not return).
{
  const coin = lathe([[0, 0], [46, 0], [46, 4], [0, 4]], 160, [0.7, 0.7, 0.7], 0);
  const tris = [];
  renderFrame([coin], { yaw: 1.2, pitch: 0.55, dist: 150, fov: 0.73, cx: 0, cy: 0 }, 700, tris, false);
  const px = new Uint8ClampedArray(700 * 700 * 4);
  rasterizeZB(tris, 700, 2, [12, 12, 14], px, 700 / (2 * Math.tan(0.73 / 2)));
  const v = (x, y) => px[(y * 700 + x) * 4];
  let holes = 0;
  for (let y = 1; y < 699; y++) for (let x = 1; x < 699; x++) {
    if (v(x, y) !== 12) continue;
    if ((v(x - 1, y) > 60 && v(x + 1, y) > 60) || (v(x, y - 1) > 60 && v(x, y + 1) > 60)) holes++;
  }
  if (holes > 0) throw new Error('FAIL: closed lathe coin rendered with ' + holes + ' enclosed background holes');
}
console.log('lathe regression checks passed');
