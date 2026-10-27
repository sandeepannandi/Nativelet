import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import * as candidate from './shatterMath.ts';

// Recreate the prior two-call SAT implementation, independently of the inlined
// loop, and compare complete worlds including contacts, meshes and RNG output.
const referenceSAT = "/**\n * Best separating axis of A's edges against B. Returns the separation and\n * leaves the edge index in A.si. Stops at the first axis that separates them\n * (the caller only needs to know they do not touch).\n */\nfunction maxSeparation(A: Body, B: Body): number {\n  'worklet';\n  let best = -Infinity;\n  const ax = A.wx, ay = A.wy, bx = B.wx, by = B.wy;\n  const enx = A.enx, eny = A.eny;\n  const n = ax.length;\n  const m = bx.length;\n  for (let i = 0; i < n; i++) {\n    const nx = enx[i];\n    const ny = eny[i];\n    const ox = ax[i];\n    const oy = ay[i];\n    let min = Infinity;\n    for (let k = 0; k < m; k++) {\n      const d = (bx[k] - ox) * nx + (by[k] - oy) * ny;\n      if (d < min) min = d;\n      // Later vertices can only lower this axis minimum. Once it cannot beat\n      // the best earlier face, stop this axis without changing the SAT result.\n      if (min <= best) break;\n    }\n    if (min > best) {\n      best = min;\n      A.si = i;\n      if (best > 0) return best;\n    }\n  }\n  return best;\n}\n\n";
const referenceCalls = '  const sepA = maxSeparation(A, B);\n  if (sepA > 0) return;\n  const sepB = maxSeparation(B, A);\n  if (sepB > 0) return;\n';
test('inlined SAT preserves exact worlds and meshes for 36 full 240-frame paths', async () => {
  const require = createRequire(import.meta.url);
  const ts = require('../../../../../apps/showcase/node_modules/typescript');
  const src = fs.readFileSync(new URL('./shatterMath.ts', import.meta.url),'utf8');
  const a = src.indexOf('  // Same SAT arithmetic/order as maxSeparation');
  const b = src.indexOf('  // Reference body',a);
  assert.ok(a > 0 && b > a);
  const code = ts.transpileModule(referenceSAT + src.slice(0,a) + referenceCalls + src.slice(b),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'shatter-inline-reference-'));
  const modulePath = path.join(dir,'baseline.mjs');
  fs.writeFileSync(modulePath,code);
  const baseline = await import(pathToFileURL(modulePath));
  fs.rmSync(dir,{recursive:true,force:true});
  let frames = 0;
  for (const seed of [1,5,7,7919,23757,99991]) for (const [hitX,hitY] of [[4,4],[170,180],[336,456]]) for (const dt of [1/60,0.048]) {
    const args = {width:340,height:460,hitX,hitY,seed,target:360};
    const a = baseline.createWorld(args),b = candidate.createWorld(args);
    for (let f=0;f<240;f++) {
      baseline.stepWorld(a,dt);candidate.stepWorld(b,dt);
      baseline.fillMesh(a,2);candidate.fillMesh(b,2);
      assert.deepEqual(b,a,`seed${seed} hit${hitX},${hitY} dt${dt} frame${f}`);
      frames++;
    }
  }
  assert.equal(frames,8640);
});
