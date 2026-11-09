import assert from 'node:assert/strict';import fs from 'node:fs';
// Dimension contract for all yaw/tilt angles, because concentric sphere/radial bounds are rotation invariant.
const rotorBound=Math.hypot(.9,.125),innerHoopMin=1.08,innerHoopBound=Math.hypot(1.18,.045),outerHoopMin=1.28;
const bridgeMinZ=.23-.04,rotorMaxZ=.03+.095,standoffMinX=1.12-.045;
assert(rotorBound<innerHoopMin);assert(innerHoopBound<outerHoopMin);assert(bridgeMinZ>rotorMaxZ);assert(standoffMinX>.9);
const allMovingBound=Math.max(innerHoopBound,Math.hypot(1.12,.23)+.045);assert(allMovingBound<outerHoopMin);
const baseOverallBound=Math.hypot(.88,2.06);assert(baseOverallBound**2<5.1);
const r={rotorToHoopRadialGap:innerHoopMin-rotorBound,innerToOuterHoopGap:outerHoopMin-innerHoopBound,bridgeAxialGap:bridgeMinZ-rotorMaxZ,standoffRotorRadialGap:standoffMinX-.9,assemblyBoundingSphereMargin:Math.sqrt(5.1)-baseOverallBound,scope:'non-contact rotor/hoop/bridge pairs only; bearing contacts are intentional ideal constraints; not a whole manufactured assembly tolerance validation'};
console.log(JSON.stringify(r,null,2));fs.writeFileSync(new URL('./gyroGeometry.test-results.json',import.meta.url),JSON.stringify(r,null,2));
