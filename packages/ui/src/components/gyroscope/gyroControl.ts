import {impulseGyro,stepGyro,type GyroParams,type GyroState} from './gyroMath';
export type GyroInput={active:boolean;targetYaw:number;targetTilt:number;spinImpulse:number;impulseId:number};
export const GYRO_IDLE:GyroInput={active:false,targetYaw:.25,targetTilt:.95,spinImpulse:0,impulseId:0};
export function driveGyro(s:GyroState,p:GyroParams,input:GyroInput,seconds:number,lastImpulse:number){'worklet';
 if(input.impulseId!==lastImpulse){
  // External hand impulse about rotor axis: projections into both cyclic coordinates.
  impulseGyro(s,input.spinImpulse*Math.cos(s.v[1]),0,input.spinImpulse);
 }
 stepGyro(s,p,seconds,{yaw:0,tilt:0,spin:0,targetYaw:input.active?input.targetYaw:undefined,targetTilt:input.active?input.targetTilt:undefined});return input.impulseId;
}
export const GYRO_W=320,GYRO_H=380;
