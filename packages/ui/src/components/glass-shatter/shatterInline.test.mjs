import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import * as candidate from './shatterMath.ts';

// Frozen pre-native two-call SAT reference, recovered from commit4332fcc.
// Fixture SHA256: fb5523d45c85f6f4159aed53ed06c451004faca8060e6c794f278986af763344
// This checks the retained TS reference, NOT native execution. Real same-Hermes
// native54case/12960frame parity is a separate Android qualification gate.
test('retained TS reference preserves exact pre-native worlds and meshes for36 full240-frame paths', async () => {
  const require = createRequire(import.meta.url);
  const ts = require('../../../../../apps/showcase/node_modules/typescript');
  const src = fs.readFileSync(new URL('./fixtures/shatterMath.preNative.ts', import.meta.url),'utf8');
  const code = ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
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
