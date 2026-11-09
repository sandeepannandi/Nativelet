/* Coupled two-gimbal gyroscope. SI units, z-up, intersecting bearing axes.
 * q=(a,b,g): outer yaw Rz(a), inner tilt Rx(b), rotor spin Rz(g).
 * Rotor axis n=Rz(a)Rx(b)ez. Generalized momenta, not scripted precession.
 * T=.5 Jo a'^2 + .5 B(b'^2+a'^2 sin²b)
 *   +.5 Js a'^2 cos²b +.5 Is(g'+a'cosb)^2.
 * V=G cosb, G=mass*g*axial COM offset. Small named imbalance causes gravity torque.
 * Bearing axes are ideal rigid constraints; no bearing clearance, elasticity,
 * impacts, air turbulence or earth rotation. Damping is linear bearing drag.
 */
export type GyroParams={outerJ:number;innerTransverseJ:number;innerAxialJ:number;rotorTransverseJ:number;rotorAxialJ:number;gravityMoment:number;yawDrag:number;tiltDrag:number;spinDrag:number;fixedDt:number};
const mass=.15,r=.045,h=.008;
export const GYRO_DEFAULTS:GyroParams={
 outerJ:3.2e-5,innerTransverseJ:1.8e-5,innerAxialJ:3.6e-5,
 rotorTransverseJ:mass*(r*r/4+h*h/12+.0015*.0015),rotorAxialJ:mass*r*r/2,
 gravityMoment:mass*9.81*.0015, // 1.5mm axial COM imbalance, whole disk offset along its axis in renderer
 yawDrag:2e-6,tiltDrag:3e-6,spinDrag:2e-6,fixedDt:1/960,
};
export type GyroState={v:number[];scratch:number[];acc:number;t:number;droppedTime:number};
export type GyroTorque={yaw:number;tilt:number;spin:number;targetYaw?:number;targetTilt?:number};
export function gyroRates(v:number[],p:GyroParams){'worklet';
 const c=Math.cos(v[1]),s=Math.sin(v[1]),B=p.innerTransverseJ+p.rotorTransverseJ,D=p.outerJ+B*s*s+p.innerAxialJ*c*c;
 const a=(v[3]-c*v[5])/D,b=v[4]/B,g=v[5]/p.rotorAxialJ-c*a;return {yaw:a,tilt:b,spin:g};
}
export function createGyro(p:GyroParams=GYRO_DEFAULTS,spin=45):GyroState{'worklet';
 return {v:[.25,.95,0,p.rotorAxialJ*spin*Math.cos(.95),0,p.rotorAxialJ*spin],scratch:Array(30).fill(0),acc:0,t:0,droppedTime:0};
}
export function gyroEnergy(v:number[],p:GyroParams){'worklet';
 const c=Math.cos(v[1]),s=Math.sin(v[1]),B=p.innerTransverseJ+p.rotorTransverseJ,D=p.outerJ+B*s*s+p.innerAxialJ*c*c;
 return .5*(v[3]-c*v[5])**2/D+.5*v[4]**2/B+.5*v[5]**2/p.rotorAxialJ+p.gravityMoment*c;
}
function gripTorque(position:number,rate:number,target:number|undefined){'worklet';
 if(target===undefined)return 0;
 return Math.max(-.008,Math.min(.008,.003*(target-position)-.00045*rate));
}
function derivative(v:number[],p:GyroParams,t:GyroTorque,out:number[],o:number){'worklet';
 const c=Math.cos(v[1]),s=Math.sin(v[1]),B=p.innerTransverseJ+p.rotorTransverseJ,D=p.outerJ+B*s*s+p.innerAxialJ*c*c;
 const a=(v[3]-c*v[5])/D,b=v[4]/B,g=v[5]/p.rotorAxialJ-c*a;
 out[o]=a;out[o+1]=b;out[o+2]=g;
 out[o+3]=t.yaw+gripTorque(v[0],a,t.targetYaw)-p.yawDrag*a;
 out[o+4]=a*a*(B-p.innerAxialJ)*s*c-a*v[5]*s+p.gravityMoment*s+t.tilt+gripTorque(v[1],b,t.targetTilt)-p.tiltDrag*b;
 out[o+5]=t.spin-p.spinDrag*g;
}
export function gyroSubstep(st:GyroState,p:GyroParams,torque:GyroTorque,dt:number){'worklet';
 const v=st.v,k=st.scratch;derivative(v,p,torque,k,0);
 // Temporary six-vector is reused; no per-substep arrays.
 for(let i=0;i<6;i++)k[24+i]=v[i]+dt*.5*k[i];
 // derivative accepts a starting index through a reusable view copied into temp.
 rkDerivative(k,24,p,torque,k,6);
 for(let i=0;i<6;i++)k[24+i]=v[i]+dt*.5*k[6+i];rkDerivative(k,24,p,torque,k,12);
 for(let i=0;i<6;i++)k[24+i]=v[i]+dt*k[12+i];rkDerivative(k,24,p,torque,k,18);
 for(let i=0;i<6;i++)v[i]+=dt/6*(k[i]+2*k[6+i]+2*k[12+i]+k[18+i]);st.t+=dt;
}
function rkDerivative(v:number[],i:number,p:GyroParams,t:GyroTorque,out:number[],o:number){'worklet';
 const c=Math.cos(v[i+1]),s=Math.sin(v[i+1]),B=p.innerTransverseJ+p.rotorTransverseJ,D=p.outerJ+B*s*s+p.innerAxialJ*c*c;
 const a=(v[i+3]-c*v[i+5])/D,b=v[i+4]/B,g=v[i+5]/p.rotorAxialJ-c*a;
 out[o]=a;out[o+1]=b;out[o+2]=g;out[o+3]=t.yaw+gripTorque(v[i],a,t.targetYaw)-p.yawDrag*a;
 out[o+4]=a*a*(B-p.innerAxialJ)*s*c-a*v[i+5]*s+p.gravityMoment*s+t.tilt+gripTorque(v[i+1],b,t.targetTilt)-p.tiltDrag*b;
 out[o+5]=t.spin-p.spinDrag*g;
}
export function stepGyro(st:GyroState,p:GyroParams,seconds:number,torque:GyroTorque){'worklet';
 const accepted=Math.min(Math.max(0,seconds),.1);st.droppedTime+=Math.max(0,seconds-accepted);st.acc+=accepted;
 let steps=0;
 while(st.acc>1e-12&&steps<4096){
  // Resolve the fastest gyroscopic coupling even after repeated large flicks.
  const B=p.innerTransverseJ+p.rotorTransverseJ;
  const h=Math.min(p.fixedDt,.12*B/Math.max(Math.abs(st.v[5]),1e-8));
  if(st.acc<h-1e-12)break;
  gyroSubstep(st,p,torque,h);st.acc-=h;steps++;
 }
 if(steps===4096){st.droppedTime+=st.acc;st.acc=0;}
}
export function impulseGyro(st:GyroState,yaw:number,tilt:number,spin:number){'worklet';
 st.v[3]+=yaw;st.v[4]+=tilt;st.v[5]+=spin;
}
export function gyroPose(v:number[]){'worklet';
 const a=v[0],b=v[1],c=Math.cos(a),s=Math.sin(a),cb=Math.cos(b),sb=Math.sin(b);
 return {axis:[s*sb,-c*sb,cb],yaw:a,tilt:b,rotor:v[2]};
                                    }
