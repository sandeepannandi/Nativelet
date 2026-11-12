import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(spec,context,next){try{return next(spec,context);}catch(e){if(spec.startsWith('.'))return next(spec+'.ts',context);throw e;}}});
const {pushPoint,recentVelocity,FLICK_HORIZON_MS,MAX_SAMPLES}=await import('./velocityTracker.ts');
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
// Synthetic fixture: only down+up evidence with the gesture longer than the
// horizon. No recent samples survive, so the result is null and no impulse is
// applied. (One of several mechanisms consistent with the j=0 seen in device
// runs 282/283; this test asserts tracker behavior, not a device cause.)
{
 let pts=[];pts=pushPoint(pts,{x:610,t:0});pts=pushPoint(pts,{x:470,t:800});
 assert.equal(recentVelocity(pts,800),null);out.push({name:'down/up-only longer than horizon yields null (no recent evidence)',pass:true});
}
// Genuine quick down/up pair INSIDE the horizon is real delivered evidence:
// the window average velocity is returned (no ambiguity claim here).
{
 let pts=[];pts=pushPoint(pts,{x:610,t:750});pts=pushPoint(pts,{x:470,t:800});
 const vx=recentVelocity(pts,800);assert(vx!==null&&Math.abs(vx+2.8)<1e-9,`vx=${vx}`);out.push({name:'down/up-only inside horizon returns real window velocity',vx});
}
// Internal disorder with positive endpoint dt: a sample stepping backwards
// inside the window makes order ambiguous -> null.
{
 let pts=[];pts=pushPoint(pts,{x:610,t:700});pts=pushPoint(pts,{x:590,t:760});pts=pushPoint(pts,{x:580,t:720});pts=pushPoint(pts,{x:470,t:800});
 assert.equal(recentVelocity(pts,800),null);out.push({name:'internal disorder with positive endpoint dt yields null',pass:true});
}
// Future-timestamped samples are excluded from the window.
{
 let pts=[];pts=pushPoint(pts,{x:610,t:780});pts=pushPoint(pts,{x:470,t:900}); // t>now excluded
 assert.equal(recentVelocity(pts,800),null);out.push({name:'future timestamps are excluded',pass:true});
}
// Non-finite inputs never propagate NaN into the impulse.
{
 let pts=[];pts=pushPoint(pts,{x:NaN,t:780});pts=pushPoint(pts,{x:470,t:800});
 assert.equal(recentVelocity(pts,800),null);
 let pts2=[];pts2=pushPoint(pts2,{x:610,t:780});pts2=pushPoint(pts2,{x:470,t:Infinity});
 assert.equal(recentVelocity(pts2,800),null);
 let pts3=[];pts3=pushPoint(pts3,{x:610,t:780});pts3=pushPoint(pts3,{x:470,t:800});
 assert.equal(recentVelocity(pts3,NaN),null);
 out.push({name:'NaN/Infinity inputs yield null',pass:true});
}
// Duplicate timestamps inside the window are tolerated: zero-dt segment carries
// no rate, endpoints still define a real average.
{
 let pts=[];pts=pushPoint(pts,{x:610,t:700});pts=pushPoint(pts,{x:600,t:750});pts=pushPoint(pts,{x:590,t:750});pts=pushPoint(pts,{x:470,t:800});
 const vx=recentVelocity(pts,800);assert(vx!==null&&Math.abs(vx+1.4)<1e-9,`vx=${vx}`);out.push({name:'duplicate timestamps tolerated, endpoint average returned',vx});
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
// Out-of-order timestamps (coalesced delivery arriving late): dt<=0 guard yields null.
{
 let pts=[];pts=pushPoint(pts,{x:610,t:780});pts=pushPoint(pts,{x:470,t:750}); // late move stamped before prior
 assert.equal(recentVelocity(pts,800),null);out.push({name:'out-of-order timestamps yield null',pass:true});
}
// Duplicate timestamps on distinct positions never divide by zero.
{
 let pts=[];pts=pushPoint(pts,{x:610,t:800});pts=pushPoint(pts,{x:500,t:800});pts=pushPoint(pts,{x:470,t:800});
 assert.equal(recentVelocity(pts,800),null);out.push({name:'duplicate timestamps yield null',pass:true});
}
// MAX_SAMPLES eviction: only the most recent 8 samples are kept, and the
// window velocity is computed from those, not the evicted tail.
{
 let pts=[];pts=pushPoint(pts,{x:1000,t:700}); // inside horizon but must be evicted as the 9th sample
 for(let i=1;i<=8;i++)pts=pushPoint(pts,{x:610-10*i,t:710+i*10});
 assert.equal(pts.length,MAX_SAMPLES);
 const vx=recentVelocity(pts,800);
 // Eviction (not the horizon) excludes the stale x=1000: window is t=720..790, vx=(530-600)/70=-1.
 assert(vx!==null&&Math.abs(vx+1)<1e-9,`vx=${vx}`);
 out.push({name:'MAX_SAMPLES evicts oldest, window uses recent 8',vx});
}
// Cancel followed by a new gesture: the terminate handler clears the array and
// grant re-seeds it, so no pre-cancel samples leak into the next gesture's window.
{
 let pts=[];for(let i=0;i<=4;i++)pts=pushPoint(pts,{x:610-30*i,t:i*50}); // flicking motion
 pts=[]; // onPanResponderTerminate clears
 pts=pushPoint(pts,{x:470,t:800}); // new grant seed only
 assert.equal(recentVelocity(pts,800),null);out.push({name:'cancel then new gesture: stale samples do not leak',pass:true});
}
console.log(JSON.stringify({passed:out.length,total:16,cases:out},null,1));
