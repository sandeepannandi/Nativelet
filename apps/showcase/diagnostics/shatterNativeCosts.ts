import {createWorld,fillMesh,stepWorld} from '../../../packages/ui/src/components/glass-shatter/shatterMath';
// Diagnostic only. Render path/copies/actual pacing are measured separately on component.
export function nativeCosts(job:number){
 'worklet';
 const api=(globalThis as any).__nativeletShatter;
 const seed=job%2?7919:5,dt=Math.floor(job/2)%2?.048:1/60,native=(Math.floor(job/4)+Math.floor(job/8))%2===1;
 const opts={width:340,height:460,hitX:170,hitY:180,seed,target:360};
 const begin=performance.now(),w=createWorld(opts);const h=native?api.create(w):0;const setup=performance.now()-begin;
 const trig=(buf:ArrayBuffer)=>{ 'worklet';const a=new Float64Array(buf),r=new Float64Array(a.length*2);for(let i=0;i<a.length;i++){r[2*i]=Math.cos(a[i]);r[2*i+1]=Math.sin(a[i]);}return r.buffer;};
 const step:number[]=[],mesh:number[]=[],total:number[]=[];
 try{for(let f=0;f<120;f++){const a=performance.now();if(native){api.advance(h,dt,trig);api.render(h,w);}else stepWorld(w,dt);const b=performance.now();fillMesh(w,2);const c=performance.now();step.push(b-a);mesh.push(c-b);total.push(c-a);}}finally{if(native)api.dispose(h);}
 return {job,seed,dt,native,setup,step,mesh,total,shards:w.bodies.length,scope:'whole physics+boundary+mesh, not Skia/path/pacing'};
}
