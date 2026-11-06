// Feasibility checker for the corrected arbor F = (0, 13.4), CW wheel (math y-up).
// For each face: resist n.T < -0.6; draw tau sign toward engaged bank;
// creep |vt/vn| < 0.35; corner cone contains -T with margin toward lock.
const F = [0, 13.4];
const deg = d => [Math.cos(d * Math.PI / 180), Math.sin(d * Math.PI / 180)];
const stones = [
  { name: 'entry', corner: [-4.738, -4.674], pol: 119 * Math.PI / 180, engaged: +1,
    lockN: 197, impN: 270 },
  { name: 'exit', corner: [5.625, -5.216], pol: 55 * Math.PI / 180, engaged: -1,
    lockN: 132, impN: 200 },
];
let ok = true;
for (const s of stones) {
  const [cx, cy] = s.corner;
  const w = [cx, cy + F[1]];               // world corner
  const r = Math.hypot(w[0], w[1]);
  const T = [Math.sin(s.pol), -Math.cos(s.pol)];   // CW travel
  const mT = [-T[0], -T[1]];                        // tooth reaction dir
  for (const [label, nd] of [['lock', s.lockN], ['impulse', s.impN]]) {
    const n = deg(nd);
    const a = [w[0] - F[0], w[1] - F[1]];
    const resist = n[0] * T[0] + n[1] * T[1];
    const tau = -(a[0] * n[1] - a[1] * n[0]);       // torque on fork from force -n
    const t = [-n[1], n[0]];
    const creep = Math.abs((T[0] * t[0] + T[1] * t[1]) / resist);
    const want = label === 'lock' ? s.engaged : -s.engaged;
    const pass = resist < -0.2 && Math.sign(tau) === want && (label === 'impulse' || creep < 0.4);
    ok = ok && pass;
    console.log(`${s.name} ${label}: n=${nd}deg resist=${resist.toFixed(2)} tau=${tau.toFixed(2)} (want ${want > 0 ? '+p' : '-p'}) creep=${creep.toFixed(2)} ${pass ? 'PASS' : 'FAIL'}`);
  }
  // corner cone test
  const l = s.lockN, i = s.impN;
  let mTang = Math.atan2(mT[1], mT[0]) * 180 / Math.PI;
  const lo = Math.min(l, i), hi = Math.max(l, i);
  while (mTang < lo) mTang += 360;
  const inCone = mTang > lo && mTang < hi;
  const margin = (mTang - lo) / (hi - lo);   // want small = near lock edge
  const conePass = inCone && margin < 0.35;
  ok = ok && conePass;
  console.log(`${s.name} corner cone [${lo},${hi}]: -T at ${mTang.toFixed(1)}, margin ${(margin * 100).toFixed(0)}% from lock ${conePass ? 'PASS' : 'FAIL'}`);
}
console.log(ok ? 'ALL PASS' : 'FAILURES PRESENT');
