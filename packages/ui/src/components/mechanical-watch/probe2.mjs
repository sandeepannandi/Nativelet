// Search: fork pivot position around the wheel (CCW teeth motion), two stones
// at +-30deg from the pivot direction, 2.5-pitch separation (half-pitch stagger
// comes from the +12deg exit offset). For each stone, feasibility cone for the
// IMPULSE-face normal: (i) tooth on +n side at lock radius, (ii) n opposes tooth
// travel, (iii) impulse force on stone drives fork toward the unlock direction.
const R = 10, D = 13.4, stoneIn = 0.55, Rs = R - stoneIn;
const pitch = 2*Math.PI/15;
function cone(polDeg, pivDeg, unlockSign) {
  const pol = polDeg*Math.PI/180, pv = pivDeg*Math.PI/180;
  const cx = Rs*Math.cos(pol), cy = Rs*Math.sin(pol);       // corner (at fork 0; small throw approx)
  const Fx = D*Math.cos(pv), Fy = D*Math.sin(pv);
  const rx = Math.cos(pol), ry = Math.sin(pol);             // outward radial
  const Tx = -Math.sin(pol), Ty = Math.cos(pol);            // CCW tangent = tooth travel
  const ax = cx-Fx, ay = cy-Fy;                             // pivot->corner
  const feas = [];
  for (let th = 0; th < 360; th += 1) {
    const t = th*Math.PI/180, nx = Math.cos(t), ny = Math.sin(t);
    // (i) tooth tip (radius R) vs plane through corner: d = (0.55*R..)*n > 0
    if ((R-Rs)*(rx*nx+ry*ny) <= 0.02) continue;
    // (ii) resists tooth travel
    if (nx*Tx + ny*Ty >= -0.05) continue;
    // (iii) torque about pivot from force on stone = -j*n: sign must equal unlockSign
    const tau = ax*(-ny) - ay*(-nx);
    if (Math.sign(tau) !== unlockSign) continue;
    feas.push(th);
  }
  return feas;
}
for (let pivDeg = 0; pivDeg < 360; pivDeg += 15) {
  // stones dip on the pivot side: corners at pivDeg +/- 30deg
  // entry engaged at p=-bank, unlock sign + ; exit at +bank, unlock sign -
  const e1 = cone(pivDeg-30, pivDeg, +1);
  const e2 = cone(pivDeg+30, pivDeg, -1);
  if (e1.length > 4 && e2.length > 4)
    console.log(`pivot@${pivDeg}: stoneA(${pivDeg-30}) cone ${e1[0]}..${e1[e1.length-1]} (${e1.length}) stoneB(${pivDeg+30}) cone ${e2[0]}..${e2[e2.length-1]} (${e2.length})`);
}
