import assert from 'node:assert/strict';
import * as m from './waterMath.ts';
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
let s=m.createWater();const initialMean=mean(s.h);m.disturb(s,.2,.1,.04);assert(Math.abs(mean(s.h)-initialMean)<1e-8,'Disturbance conserves mean water level');
const a=m.createWater(),b=m.createWater();for(let i=0;i<120;i++)m.stepWater(a,1/60);for(let i=0;i<240;i++)m.stepWater(b,1/120);assert(a.h.every((v,i)=>Math.abs(v-b.h[i])<1e-9),'Frame partition invariance');
let peak=0;for(let i=0;i<1800;i++){if(i<900)m.moveBall(s,Math.sin(i*.19)*2,Math.cos(i*.21)*2);m.stepWater(s,i%9?.0167:.15);peak=Math.max(peak,...s.h.map(Math.abs));assert(s.h.every(Number.isFinite)&&s.v.every(Number.isFinite));assert(Math.abs(s.x)<=.94&&Math.abs(s.z)<=.64);}
assert(peak<.12,'Stress remains inside encoded height range');assert(Math.max(...s.h.map(Math.abs))<.01,'Waves damp after interaction');
const noStep=Array.from(s.h);m.stepWater(s,-5);assert.deepEqual(Array.from(s.h),noStep);
const pixels=m.heightPixels(s);assert.equal(pixels.length,m.GRID_X*m.GRID_Z*4);for(let i=0;i<s.h.length;i++){const h=((pixels[i*4]*256+pixels[i*4+1])/65535-.5)*.24;assert(Math.abs(h-s.h[i])<.24/65535);}
s=m.createWater();const oldX=s.x,oldZ=s.z;const g=m.beginWaterDrag(s,380*.54,410*.53,380,410);assert(g.owned,'Projection picks rendered sphere');assert.equal(s.x,oldX,'Grab does not teleport');assert.equal(s.z,oldZ);m.updateWaterDrag(s,g,380*.72,410*.58,380,410);assert(Math.hypot(s.x-oldX,s.z-oldZ)>.2,'Drag moves sphere');
const missed=m.beginWaterDrag(s,5,5,380,410);assert(!missed.owned);const position=[s.x,s.z];m.updateWaterDrag(s,missed,200,200,380,410);assert.deepEqual([s.x,s.z],position,'Missed grab never takes ownership');
console.log('PASS: volume-neutral impulse, fixed-step partition invariance, finite stress, boundaries, damping, height codec, perspective/refraction picking and grab ownership; peak height',peak);
