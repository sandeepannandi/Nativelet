import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(spec,context,next){try{return next(spec,context);}catch(e){if(spec.startsWith('.'))return next(spec+'.ts',context);throw e;}}});
const {pushPoint,recentVelocity,FLICK_HORIZON_MS}=await import('./velocityTracker.ts');
const out=[];const clamp=j=>Math.max(-.009,Math.min(.009,j*.003));
// Healthy 800ms leftward flick 610->470 with real move samples: recent window follows the tail.
{
 let pts=[];pts=pushPoint(pts,{x:610,t:0});for(let i=1;i<=8;i++)pts=pushPoint(pts,{x:610-140*i/8,t:i*100});
 const vx=recentVelocity(pts,800);assert(vx!==null&&Math.abs(vx+0.175)<1e-9,`vx=${vx}`);
 assert(clamp(vx)<0);out.push({name:'healthy flick keeps sign and magnitude',vx});
}
// Move then long hold then release: stale samples expire, no flick is invented.
{
 let pts=[];pts=pushPoint(pts,{x:610,t:0});for(let i=1;i<=2;i++)pts=pushPoint(pts,{x:610-20*i,t:i*100});
 pts=pushPoint(pts,{x:570,t:800}); // release point after 600ms hold
 assert.equal(recentVelocity(pts,800),null);out.push({name:'move-hold-release yields null (no flick)',pass:true});
}
// Reversal inside the recent window: the final direction wins.
{
 let pts=[];for(let i=0;i<=5;i++)pts=pushPoint(pts,{x:470+30*i,t:i*100}); // rightward to 620
 pts=pushPoint(pts,{x:590,t:660});pts=pushPoint(pts,{x:560,t:730});pts=pushPoint(pts,{x:530,t:800});
 const vx=recentVelocity(pts,800);assert(vx!==null&&vx<0,`vx=${vx}`);out.push({name:'reversal tracks final direction',vx});
}
// Zero/invalid dt: identical timestamps never divide.
{
 let pts=[];pts=pushPoint(pts,{x:610,t:800});pts=pushPoint(pts,{x:470,t:800});
 assert.equal(recentVelocity(pts,800),null);out.push({name:'zero dt yields null',pass:true});
}
// Fully coalesced flick (only down+up evidence, gesture longer than horizon):
// evidence is ambiguous, so no impulse - this is the run-282/283 delivery pattern.
{
 let pts=[];pts=pushPoint(pts,{x:610,t:0});pts=pushPoint(pts,{x:470,t:800});
 assert.equal(recentVelocity(pts,800),null);out.push({name:'saturated delivery with no recent samples yields null (ambiguity preserved)',pass:true});
}
// Saturated delivery where recent samples DO survive: sign is recovered from real data.
{
 let pts=[];pts=pushPoint(pts,{x:610,t:0});pts=pushPoint(pts,{x:520,t:700});pts=pushPoint(pts,{x:470,t:800});
 const vx=recentVelocity(pts,800);assert(vx!==null&&vx<0);assert(clamp(vx)<0);out.push({name:'surviving recent samples recover sign',vx});
}
// Horizon boundary: a sample exactly at the horizon counts, beyond it does not.
{
 let pts=[];pts=pushPoint(pts,{x:600,t:800-FLICK_HORIZON_MS});pts=pushPoint(pts,{x:500,t:800});
 assert(recentVelocity(pts,800)!==null);
 let pts2=[];pts2=pushPoint(pts2,{x:600,t:800-FLICK_HORIZON_MS-1});pts2=pushPoint(pts2,{x:500,t:800});
 assert.equal(recentVelocity(pts2,800),null);out.push({name:'horizon boundary is inclusive',pass:true});
}
console.log(JSON.stringify({passed:out.length,total:7,cases:out},null,1));
