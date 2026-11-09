import assert from 'node:assert/strict';import fs from 'node:fs';
import {createGyro,GYRO_DEFAULTS as p,gyroRates} from './gyroMath.ts';import {registerHooks} from 'node:module';
registerHooks({resolve(spec,context,next){try{return next(spec,context);}catch(e){if(spec.startsWith('.'))return next(spec+'.ts',context);throw e;}}});
const {driveGyro,GYRO_IDLE}=await import('./gyroControl.ts');
const out=[];
// External rotor-axis impulse has the exact Jacobian projections; no speed assignment.
{
 const s=createGyro(p),r=gyroRates(s.v,p),pa=s.v[3],pg=s.v[5],b=s.v[1],j=.001;
 const id=driveGyro(s,p,{...GYRO_IDLE,spinImpulse:j,impulseId:1},0,0),after=gyroRates(s.v,p);
 assert.equal(id,1);assert(Math.abs((s.v[3]-pa)-j*Math.cos(b))<1e-15);assert(Math.abs(s.v[5]-pg-j)<1e-15);assert(Math.abs(after.yaw-r.yaw)<1e-12);assert(Math.abs(after.spin-r.spin-j/p.rotorAxialJ)<1e-12);
 const snap=s.v.slice();driveGyro(s,p,{...GYRO_IDLE,spinImpulse:j,impulseId:1},0,id);assert.deepEqual(s.v,snap);out.push({name:'external rotor impulse and consumed-once queue',pass:true});
}
// Grip force is reevaluated at RK stages, independent of display frame partition.
{
 const a=createGyro(p),b=createGyro(p),input={...GYRO_IDLE,active:true,targetYaw:1.2,targetTilt:1.8};
 for(let i=0;i<600;i++)driveGyro(a,p,input,1/60,0);for(let i=0;i<1200;i++)driveGyro(b,p,input,1/120,0);
 const err=Math.max(...a.v.map((x,i)=>Math.abs(x-b.v[i])));assert(err<1e-10);out.push({name:'held frame torque60/120Hz agreement',maximumStateError:err});
}
// A long pause is explicitly accounted as discarded time, never a giant unstable physics step.
{
 const s=createGyro(p);driveGyro(s,p,GYRO_IDLE,5,0);assert(Math.abs(s.droppedTime-4.9)<1e-10);assert(s.t<=.10001);assert(s.v.every(Number.isFinite));out.push({name:'hitch accounting',droppedTime:s.droppedTime,simulated:s.t});
}
// Repeated severe flicks cannot destabilize the fixed step: coupling-rate refinement is automatic.
{
 const s=createGyro(p);let id=0;for(let i=0;i<100;i++){id=driveGyro(s,p,{...GYRO_IDLE,active:true,targetYaw:1,targetTilt:1.4,spinImpulse:.009,impulseId:i+1},1/60,id);assert(s.v.every(Number.isFinite));}
 out.push({name:'100maximum flicks with frame torque',spin:gyroRates(s.v,p).spin,droppedTime:s.droppedTime,finite:true});
}
console.log(JSON.stringify(out,null,2));fs.writeFileSync(new URL('./gyroControl.test-results.json',import.meta.url),JSON.stringify(out,null,2));
