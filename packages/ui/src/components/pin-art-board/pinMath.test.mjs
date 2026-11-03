import {test} from 'node:test';import assert from 'node:assert/strict';
import {createPins,pressPins,stepPins,wipePins,pinPoints,PA_N} from './pinMath.ts';
const run=(s,t)=>{for(let i=0;i<t*60;i++)stepPins(s,1/60);};
test('1015 finite bounded pins',()=>{const s=createPins();assert.equal(s.h.length,1015);for(let i=0;i<400;i++){pressPins(s,(i*17)%340,(i*29)%414);stepPins(s,.04);}assert.ok(s.h.every(h=>Number.isFinite(h)&&h>=0&&h<=32));});
test('touch raises local pins and holds after release',()=>{const s=createPins(false);pressPins(s,170,210);run(s,1);assert.ok(Math.max(...s.h)>30);const a=s.h.slice();run(s,4);assert.ok(s.h.every((h,i)=>Math.abs(h-a[i])<.01));assert.equal(s.h[0],0);});
test('drag creates a continuous impression',()=>{const s=createPins(false);for(let x=70;x<260;x+=4)pressPins(s,x,210);run(s,1);assert.ok(s.h.filter(h=>h>10).length>100);});
test('erase lowers only touched targets',()=>{const s=createPins();const before=s.target.reduce((a,b)=>a+b,0);pressPins(s,170,149,true);run(s,1);assert.ok(s.h.reduce((a,b)=>a+b,0)<before);});
test('wipe settles fully flat',()=>{const s=createPins();wipePins(s);run(s,3);assert.ok(s.h.every(h=>h===0));assert.equal(s.wiping,false);});
test('geometry has no NaNs and correct batch sizes',()=>{const s=createPins();for(let p=0;p<6;p++){const a=pinPoints(s,p);assert.equal(a.length,PA_N*(p<2?2:1));assert.ok(a.every(q=>Number.isFinite(q.x)&&Number.isFinite(q.y)));}});
test('reduced motion preserves direct interaction',()=>{const s=createPins(false);pressPins(s,170,210);stepPins(s,.016,true);assert.deepEqual(s.h,s.target);});

test('long stalled frame catches up without instability',()=>{const s=createPins(false);pressPins(s,170,210);stepPins(s,1);assert.ok(Math.max(...s.h)>30);wipePins(s);stepPins(s,1);stepPins(s,1);assert.ok(s.h.every(h=>h===0));});
