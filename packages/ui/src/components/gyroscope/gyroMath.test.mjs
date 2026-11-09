import assert from 'node:assert/strict';import fs from 'node:fs';
import {GYRO_DEFAULTS as P,createGyro,gyroRates,gyroEnergy,gyroSubstep,stepGyro,impulseGyro,gyroPose} from './gyroMath.ts';
const zero={yaw:0,tilt:0,spin:0};const conservative={...P,yawDrag:0,tiltDrag:0,spinDrag:0};
const checks=[];function record(name,data){checks.push({name,...data});}
// Conserved cyclic momenta and energy, finite gimbals, gravity and nontrivial motion.
{
 const p=conservative,s=createGyro(p),e=gyroEnergy(s.v,p),pa=s.v[3],pg=s.v[5];let err=0;
 for(let i=0;i<60/p.fixedDt;i++){gyroSubstep(s,p,zero,p.fixedDt);err=Math.max(err,Math.abs(gyroEnergy(s.v,p)-e)/e);assert(s.v.every(Number.isFinite));}
 assert(err<2e-7);assert.equal(s.v[3],pa);assert.equal(s.v[5],pg);record('60s conservative finite-gimbal invariants',{maxRelativeEnergyError:err,paError:s.v[3]-pa,pgError:s.v[5]-pg});
}
// Uniform precession is an exact solution: D' Ω²/2-pg sinb Ω+G sinb=0.
{
 const p=conservative,s=createGyro(p),b=s.v[1],B=p.innerTransverseJ+p.rotorTransverseJ,A=(B-p.innerAxialJ)*Math.cos(b),G=p.gravityMoment,pg=s.v[5];
 const omega=2*G/(pg+Math.sqrt(pg*pg-4*A*G));const D=p.outerJ+B*Math.sin(b)**2+p.innerAxialJ*Math.cos(b)**2;
 s.v[3]=D*omega+pg*Math.cos(b);let tiltErr=0;
 for(let i=0;i<20/p.fixedDt;i++){gyroSubstep(s,p,zero,p.fixedDt);tiltErr=Math.max(tiltErr,Math.abs(s.v[1]-b));}
 assert(tiltErr<1e-9);assert(Math.abs((s.v[0]-.25)/20-omega)<1e-9);record('analytic uniform precession',{omega,maximumTiltError:tiltErr});
}
// Balanced, initially pure axial spin: no invented precession or wobble.
{
 const p={...conservative,gravityMoment:0},s=createGyro(p),initial=s.v.slice();for(let i=0;i<10/p.fixedDt;i++)gyroSubstep(s,p,zero,p.fixedDt);
 assert(Math.abs(s.v[0]-initial[0])<1e-12);assert(Math.abs(s.v[1]-initial[1])<1e-12);record('balanced no-torque axis fixed',{yawChange:s.v[0]-initial[0],tiltChange:s.v[1]-initial[1]});
}
// Massless-gimbal force-free symmetric-top limit: world L fixed independently of solver formula.
{
 const p={...conservative,outerJ:0,innerTransverseJ:0,innerAxialJ:0,gravityMoment:0},s=createGyro(p);s.v[3]+=.0002;s.v[4]=.0001;
 const worldL=v=>{const r=gyroRates(v,p),a=v[0],b=v[1],n=gyroPose(v).axis,ex=[Math.cos(a),Math.sin(a),0],omega=[r.tilt*ex[0],r.tilt*ex[1],r.yaw],projection=omega.reduce((s,x,i)=>s+x*n[i],0),axial=p.rotorAxialJ*(r.spin+projection);
 return omega.map((x,i)=>p.rotorTransverseJ*(x-projection*n[i])+axial*n[i]);};
 const l=worldL(s.v);let max=0;for(let i=0;i<10/p.fixedDt;i++){gyroSubstep(s,p,zero,p.fixedDt);max=Math.max(max,Math.hypot(...worldL(s.v).map((x,i)=>x-l[i]))/Math.hypot(...l));}console.log({forceFreeVectorDrift:max,finalTilt:s.v[1]});assert(max<1e-6);record('force-free top world angular momentum',{maxRelativeVectorDrift:max});
}
// Step-size convergence of motion, same10s; compare to1/3840 reference.
{
 const sim=h=>{const s=createGyro(conservative);for(let i=0;i<Math.round(10/h);i++)gyroSubstep(s,conservative,zero,h);return s.v;};
 const ref=sim(1/3840),error=h=>Math.hypot(...sim(h).map((x,i)=>x-ref[i]));const e240=error(1/240),e480=error(1/480),e960=error(1/960);
 assert(e240/e480>10&&e480/e960>8);record('RK4 convergence',{error240:e240,error480:e480,error960:e960,ratio240to480:e240/e480});
}
// Damping does nonpositive work; finite external impulse and frame partition agreement.
{
 const s=createGyro(P);let prev=gyroEnergy(s.v,P),maxIncrease=0;for(let i=0;i<20/P.fixedDt;i++){gyroSubstep(s,P,zero,P.fixedDt);const e=gyroEnergy(s.v,P);maxIncrease=Math.max(maxIncrease,e-prev);prev=e;}assert(maxIncrease<1e-10);record('bearing damping energy loss',{maxStepEnergyIncrease:maxIncrease,finalEnergy:prev});
 const a=createGyro(P),b=createGyro(P);impulseGyro(a,.0002,-.0001,.0004);impulseGyro(b,.0002,-.0001,.0004);
 for(let i=0;i<600;i++)stepGyro(a,P,1/60,zero);for(let i=0;i<1200;i++)stepGyro(b,P,1/120,zero);
 const err=Math.max(...a.v.map((x,i)=>Math.abs(x-b.v[i])));assert(err<1e-10);record('60Hz/120Hz frame partition',{maximumStateError:err});
}
// Finite-gimbal parameterization remains nonsingular even with aligned axes.
{
 for(const tilt of [0,1e-8,Math.PI,Math.PI+1e-8]){const s=createGyro(P);s.v[1]=tilt;for(let i=0;i<1/P.fixedDt;i++)gyroSubstep(s,P,zero,P.fixedDt);assert(s.v.every(Number.isFinite));}record('aligned-axis finite-inertia states',{pass:true});
}
console.log(JSON.stringify(checks,null,2));fs.writeFileSync(new URL('./gyroMath.test-results.json',import.meta.url),JSON.stringify(checks,null,2));
