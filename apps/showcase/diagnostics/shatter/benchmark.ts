import * as reference from './reference';
import * as pool from './pool';
import * as bitset from './bitset';
import * as packed from './packed';
export function runComparison(job: number) {
  'worklet';
  // One finite job per scheduled UI callback. No animated component is mounted.
  const variants=[reference,pool,bitset,packed];
  const names=['reference','pool','bitset','packed'];
  const round=Math.floor(job/16), item=job%16;
  const variant=(item%4+round)%4, scenario=Math.floor(item/4);
  const dt=scenario%2===0?1/60:0.048,seed=scenario<2?5:7919;
  const mod=variants[variant];
  const opts={width:340,height:460,hitX:170,hitY:180,seed,target:360};
  const t0=performance.now();const w=mod.createWorld(opts);const setup=performance.now()-t0;
  const r=reference.createWorld(opts);
  let exact=JSON.stringify(w)===JSON.stringify(r);
  const step:number[]=[],mesh:number[]=[],total:number[]=[];
  for(let f=0;f<60;f++) {
    const a=performance.now();mod.stepWorld(w,dt);const b=performance.now();mod.fillMesh(w,2);const c=performance.now();
    step.push(b-a);mesh.push(c-b);total.push(c-a);
    // Reference execution and full exact comparison are outside timing.
    reference.stepWorld(r,dt);reference.fillMesh(r,2);
    if(JSON.stringify(w)!==JSON.stringify(r))exact=false;
  }
  return {job,round,warmup:round===0,variant:names[variant],dt,seed,setup,step,mesh,total,exact,shards:w.bodies.length};
}
