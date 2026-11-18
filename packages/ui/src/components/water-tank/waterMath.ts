/** Linear shallow-water heightfield with reflecting pool walls. No breaking waves or spray. */
export const WATER_W=380,WATER_H=410,GRID_X=128,GRID_Z=96;
export type WaterState={time:number,x:number,z:number,h:Float32Array,v:Float32Array,next:Float32Array,acc:number,wakeX:number,wakeZ:number};
export function createWater():WaterState{const s={time:0,x:.22,z:.08,h:new Float32Array(GRID_X*GRID_Z),v:new Float32Array(GRID_X*GRID_Z),next:new Float32Array(GRID_X*GRID_Z),acc:0,wakeX:.22,wakeZ:.08};for(let j=0;j<GRID_Z;j++)for(let i=0;i<GRID_X;i++)s.h[j*GRID_X+i]=.006*Math.cos(i/(GRID_X-1)*Math.PI*7)*Math.cos(j/(GRID_Z-1)*Math.PI*5)+.003*Math.cos(i/(GRID_X-1)*Math.PI*4)*Math.cos(j/(GRID_Z-1)*Math.PI*8);disturb(s,-.4,-.25,.012);return s;}
export function disturb(s:WaterState,x:number,z:number,amplitude=.022){
 // A positive and negative lobe, so disturbances do not add water volume.
 let mean=0;const bump=new Float32Array(s.h.length);
 for(let j=0;j<GRID_Z;j++)for(let i=0;i<GRID_X;i++){const dx=(i/(GRID_X-1)*2.5-1.25-x),dz=(j/(GRID_Z-1)*1.9-.95-z),r2=dx*dx+dz*dz;const val=amplitude*(1-r2/.018)*Math.exp(-r2/.018);bump[j*GRID_X+i]=val;mean+=val;}
 mean/=bump.length;for(let i=0;i<bump.length;i++)s.h[i]+=bump[i]-mean;
}
export function moveBall(s:WaterState,x:number,z:number){
 if(!Number.isFinite(x)||!Number.isFinite(z))return;
 const nx=Math.max(-.94,Math.min(.94,x)),nz=Math.max(-.64,Math.min(.64,z));const dx=nx-s.wakeX,dz=nz-s.wakeZ,d=Math.hypot(dx,dz);
 if(d>.003){const strength=Math.min(.025,d*.12);disturb(s,nx+dx/Math.max(d,.001)*.12,nz+dz/Math.max(d,.001)*.12,strength);disturb(s,s.wakeX-dx/Math.max(d,.001)*.10,s.wakeZ-dz/Math.max(d,.001)*.10,-strength*.65);s.wakeX=nx;s.wakeZ=nz;}
 s.x=nx;s.z=nz;
}
export function stepWater(s:WaterState,dt:number){
 s.acc+=Math.max(0,Math.min(.05,dt));const step=1/120,dx=2.5/(GRID_X-1),dz=1.9/(GRID_Z-1),c2=.32;
 while(s.acc>=step){
  for(let j=0;j<GRID_Z;j++)for(let i=0;i<GRID_X;i++){const k=j*GRID_X+i,h=s.h[k];const left=s.h[j*GRID_X+Math.max(0,i-1)],right=s.h[j*GRID_X+Math.min(GRID_X-1,i+1)],up=s.h[Math.max(0,j-1)*GRID_X+i],down=s.h[Math.min(GRID_Z-1,j+1)*GRID_X+i];s.v[k]=(s.v[k]+c2*((left+right-2*h)/(dx*dx)+(up+down-2*h)/(dz*dz))*step)*Math.exp(-(.65+Math.max(0,Math.abs(h)-.05)*35)*step);s.next[k]=h+s.v[k]*step;}
  const old=s.h;s.h=s.next;s.next=old;s.time+=step;s.acc-=step;
 }
}
export function resetWater(s:WaterState){Object.assign(s,createWater());}
/** Two-byte signed height encoding, exact same data on Skia and WebGL. */
export function heightPixels(s:WaterState){const p=new Uint8Array(s.h.length*4);for(let i=0;i<s.h.length;i++){const q=Math.round((Math.max(-.12,Math.min(.12,s.h[i]))/.24+.5)*65535);p[i*4]=q>>8;p[i*4+1]=q&255;p[i*4+2]=0;p[i*4+3]=255;}return p;}
export function waterUniforms(s:WaterState,width:number,height:number){return{resolution:[width,height],clock:s.time,ball:[s.x,-.31,s.z]};}
// Matching camera projection for pointer -> water-plane intersections.
export function waterPoint(x:number,y:number,width:number,height:number,plane=-.31){
 x=Math.max(0,Math.min(width,x));y=Math.max(0,Math.min(height,y));
 const eye=[2.7,2.5,3.6],target=[0,-.22,0];const norm=(a:number[])=>{const l=Math.hypot(...a);return a.map(v=>v/l);};const f=norm(target.map((v,i)=>v-eye[i]));const r=norm([-f[2],0,f[0]]);const u=[r[1]*f[2]-r[2]*f[1],r[2]*f[0]-r[0]*f[2],r[0]*f[1]-r[1]*f[0]];
 const px=(x/width*2-1)*width/height,py=1-y/height*2;const d=norm(f.map((v,i)=>v*2.8+r[i]*px+u[i]*py));const t=-eye[1]/d[1];const sx=eye[0]+d[0]*t,sz=eye[2]+d[2]*t;const rx=d[0]/1.333,rz=d[2]/1.333,ry=-Math.sqrt(Math.max(.001,1-rx*rx-rz*rz));return{x:sx+rx*plane/ry,z:sz+rz*plane/ry};
}

export type WaterDrag={owned:boolean,dx:number,dz:number};
export function beginWaterDrag(s:WaterState,x:number,y:number,width:number,height:number):WaterDrag{const p=waterPoint(x,y,width,height);const owned=Math.hypot(p.x-s.x,p.z-s.z)<.36;if(!owned){const q=waterPoint(x,y,width,height,0);if(Math.abs(q.x)<1.22&&Math.abs(q.z)<.92)disturb(s,q.x,q.z,.025);}return{owned,dx:s.x-p.x,dz:s.z-p.z};}
export function updateWaterDrag(s:WaterState,g:WaterDrag,x:number,y:number,width:number,height:number){if(!g.owned)return;const p=waterPoint(x,y,width,height);moveBall(s,p.x+g.dx,p.z+g.dz);}
