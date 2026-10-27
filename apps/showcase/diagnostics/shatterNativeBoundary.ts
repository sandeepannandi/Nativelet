// Diagnostic harness, invoked explicitly on the actual UI runtime after installation.
// Never run automatically in the product component, never substitutes store tests.
import {createWorld,fillMesh,stepWorld} from '../../../packages/ui/src/components/glass-shatter/shatterMath';
export function checkShatterNativeBoundary() {
 'worklet';
 const api=(globalThis as typeof globalThis & {__nativeletShatter:{create:(w:unknown)=>number;advance:(id:number,dt:number,cb:(a:ArrayBuffer)=>unknown)=>void;render:(id:number,w:unknown)=>void;inspect:(id:number,w:unknown)=>void;dispose:(id:number)=>void}}).__nativeletShatter;
 if(!api)throw new Error('native UI acknowledgement required');
 const world=()=>{ 'worklet';return createWorld({width:340,height:460,hitX:170,hitY:180,seed:7919,target:360});};
 const trig=(buf:ArrayBuffer)=>{ 'worklet';const a=new Float64Array(buf),r=new Float64Array(a.length*2);for(let i=0;i<a.length;i++){r[i*2]=Math.cos(a[i]);r[i*2+1]=Math.sin(a[i]);}return r.buffer;};
 let passed=0;
 const rejects=(f:()=>void)=>{ 'worklet';let fail=false;try{f();}catch{fail=true;}if(!fail)throw new Error('expected native rejection');return 1;};
 for(let kind=0;kind<12;kind++){
  const w=world(),h=api.create(w);
  if(kind<5){passed+=rejects(()=>{ 'worklet';api.advance(h,1/60,(input)=>{ 'worklet';if(kind===0)throw new Error('intentional trig failure');if(kind===1)return {};if(kind===2)return new ArrayBuffer(0);const out=new Float64Array(trig(input));out[0]=kind===3?NaN:2;return out.buffer;});});}
  else {const fake=world();if(kind===5)Object.defineProperty(fake,'bodies',{get(){api.dispose(h);return w.bodies;}});
   else Object.defineProperty(fake.bodies[0],'x',{set(){if(kind===6)api.advance(h,1/60,trig);if(kind===7)api.dispose(h);if(kind===8){try{api.dispose(h);}catch{/* Even swallowed reentry must poison outer render. */}}if(kind===9)throw new Error("receiver setter");}});
   if(kind===10)Object.freeze(fake.bodies[1]);if(kind===11)Object.defineProperty(fake,"bodies",{get(){throw new Error("receiver getter");}});
   passed+=rejects(()=>{ 'worklet';api.render(h,fake);});}
  passed+=rejects(()=>{ 'worklet';api.render(h,w);});api.dispose(h);api.dispose(h);passed+=rejects(()=>{ 'worklet';api.advance(h,1/60,trig);});
 }
 // Actual wrapper render mesh equivalence, without assuming full-world debug sync.
 const a=world(),b=world(),h=api.create(b);
 for(let frame=0;frame<240;frame++){stepWorld(a,1/60);api.advance(h,1/60,trig);api.render(h,b);fillMesh(a,2);fillMesh(b,2);if(JSON.stringify([a.mxy,a.mtex,a.mtint,a.mparked])!==JSON.stringify([b.mxy,b.mtex,b.mtint,b.mparked]))throw new Error(`native mesh differs ${frame}`);}api.dispose(h);
 return {passed,meshFrames:240,scope:'actual UI JSI boundary, not real reload/whole-state/fps proof'};
}

export function fullStateCase(job:number){
 'worklet';
 const api=(globalThis as any).__nativeletShatter;
 const seeds=[1,5,7,7919,23757,99991],hits=[[4,4],[170,180],[336,456]],patterns=[[1/60],[.048],[0,.001,.009,1/120,.025,.05]];
 const seed=seeds[Math.floor(job/9)],hit=hits[Math.floor(job/3)%3],pattern=patterns[job%3];
 const args={width:340,height:460,hitX:hit[0],hitY:hit[1],seed,target:360};const a=createWorld(args),b=createWorld(args),h=api.create(b);
 const trig=(buf:ArrayBuffer)=>{ 'worklet';const a=new Float64Array(buf),r=new Float64Array(a.length*2);for(let i=0;i<a.length;i++){r[2*i]=Math.cos(a[i]);r[2*i+1]=Math.sin(a[i]);}return r.buffer;};
 try{for(let f=0;f<240;f++){const dt=pattern[f%pattern.length];stepWorld(a,dt);api.advance(h,dt,trig);api.inspect(h,b);fillMesh(a,2);fillMesh(b,2);if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`full-state mismatch case${job}frame${f}`);}}finally{api.dispose(h);}
 return {job,seed,hit,pattern,frames:240,shards:a.bodies.length,exact:true};
}
