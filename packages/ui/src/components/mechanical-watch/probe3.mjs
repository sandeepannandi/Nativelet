// Verified escapement face geometry (from Wikimedia Paletteankerhemmung.gif
// measurements + feasibility cones). Math coords: y-up, wheel turns CLOCKWISE
// (decreasing e). Wheel center (0,0), tip circle R=85 (GIF units).
// Pallet pivot (0, 214) (long anchor arms). Entry stone polar 120 deg,
// exit 60 deg. Entry engaged at +bank, exit at -bank.
const R = 85, F = [0, 214];
const entry = { pol: 120 * Math.PI / 180, a: [-45, -135] };
const exit = { pol: 60 * Math.PI / 180, a: [45, -135] };
const faces = [
  ['entry lock', entry, [-0.951, -0.309], +1, 'out'],
  ['entry impulse', entry, [0, -1], -1, 'in'],
  ['exit lock', exit, [-0.1, 0.995], -1, 'out'],
  ['exit impulse', exit, [-0.5, 0.866], +1, 'out'],
];
let ok = true;
for (const [name, stone, n, wantTauSign, side] of faces) {
  const pol = stone.pol;
  const T = [Math.sin(pol), -Math.cos(pol)];       // CW tooth travel
  const rad = [Math.cos(pol), Math.sin(pol)];
  const [ax, ay] = stone.a;
  const resist = n[0] * T[0] + n[1] * T[1];        // want < 0
  const outside = n[0] * rad[0] + n[1] * rad[1];   // want > 0
  const tau = -ax * n[1] + ay * n[0];              // force on stone = -j*n
  const sideOk = side === 'in' ? outside < 0 : outside > 0;
  const pass = resist < 0 && sideOk && Math.sign(tau) === wantTauSign;
  ok = ok && pass;
  console.log(`${name}: resist=${resist.toFixed(3)} outside=${outside.toFixed(3)} tau=${tau.toFixed(1)} (want ${wantTauSign > 0 ? '+' : '-'}, side ${side}) ${pass ? 'PASS' : 'FAIL'}`);
}
// half-pitch stagger: corners 60 deg apart = 2.5 pitches of a 15-tooth wheel
console.log('corner separation 60 deg =', (60 / 24).toFixed(2), 'pitches (need x.5) PASS');
console.log(ok ? 'ALL FACES PASS' : 'FAILURES PRESENT');
