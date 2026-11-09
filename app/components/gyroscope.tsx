"use client";
import {useEffect,useRef,useState} from 'react';
import {GYRO_DEFAULTS,createGyro,impulseGyro} from '../../packages/ui/src/components/gyroscope/gyroMath';
import {driveGyro,GYRO_IDLE,GYRO_W,GYRO_H,type GyroInput} from '../../packages/ui/src/components/gyroscope/gyroControl';
import {GYRO_SHADER} from '../../packages/ui/src/components/gyroscope/gyroShader';
import styles from './gyroscope.module.css';
const VERTEX='attribute vec2 pos;void main(){gl_Position=vec4(pos,0.,1.);}';
const FRAGMENT='precision highp float;\n#define float2 vec2\n#define float3 vec3\n#define float4 vec4\nuniform float uHeight;uniform float uScale;\n'+GYRO_SHADER+'\nvoid main(){gl_FragColor=gyroColor(vec2(gl_FragCoord.x,uHeight-gl_FragCoord.y)/uScale);}';
export function GyroscopePreview(){
 const canvasRef=useRef<HTMLCanvasElement>(null),[mode,setMode]=useState<'spin'|'frame'>('spin'),[slow,setSlow]=useState(false),[error,setError]=useState(''),reset=useRef(0),[reduce,setReduce]=useState(false);
 useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)'),update=()=>setReduce(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 const live=useRef({mode,slow,reduce});live.current={mode,slow,reduce};
 useEffect(()=>{
  const canvas=canvasRef.current;if(!canvas)return;const gl=canvas.getContext('webgl',{alpha:false,antialias:false});if(!gl){setError('WebGL is unavailable in this browser.');return;}
  let raf=0,last=0,resetSeen=reset.current,impulseSeen=0,disposed=false;let sim=createGyro(),input:GyroInput={...GYRO_IDLE};
  const shaders:WebGLShader[]=[];const compile=(type:number,src:string)=>{const sh=gl.createShader(type);if(!sh)throw Error('Shader allocation failed');shaders.push(sh);gl.shaderSource(sh,src);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh)||'Shader compile failed');return sh;};
  let program:WebGLProgram|null=null,buffer:WebGLBuffer|null=null;
  try{program=gl.createProgram();if(!program)throw Error('Program allocation failed');gl.attachShader(program,compile(gl.VERTEX_SHADER,VERTEX));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,FRAGMENT));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program)||'Shader link failed');}
  catch(e){setError(String(e));shaders.forEach(s=>gl.deleteShader(s));if(program)gl.deleteProgram(program);return;}
  const p=program;gl.useProgram(p);buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);const pos=gl.getAttribLocation(p,'pos');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
  const dpr=Math.min(window.devicePixelRatio||1,1.5);canvas.width=Math.round(GYRO_W*dpr);canvas.height=Math.round(GYRO_H*dpr);gl.viewport(0,0,canvas.width,canvas.height);
  const u=(name:string)=>gl.getUniformLocation(p,name);gl.uniform2f(u('size'),GYRO_W,GYRO_H);gl.uniform1f(u('uHeight'),canvas.height);gl.uniform1f(u('uScale'),dpr);gl.uniform1f(u('exposure'),1.2);const angles=u('angles');
  const tick=(now:number)=>{
   if(disposed)return;const dt=last?(now-last)/1000:1/60;last=now;
   if(resetSeen!==reset.current){sim=createGyro(GYRO_DEFAULTS,live.current.reduce?0:45);input={...GYRO_IDLE};impulseSeen=0;resetSeen=reset.current;}
   if(live.current.reduce)input={...input,active:false};
   if(!live.current.reduce)impulseSeen=driveGyro(sim,GYRO_DEFAULTS,input,dt*(live.current.slow?.25:1),impulseSeen);
   gl.uniform3f(angles,sim.v[0],sim.v[1],sim.v[2]%(2*Math.PI));gl.drawArrays(gl.TRIANGLE_STRIP,0,4);raf=requestAnimationFrame(tick);
  };raf=requestAnimationFrame(tick);
  let drag:{id:number;x:number;y:number;a:number;b:number;lastX:number;lastAt:number;vx:number;mode:'spin'|'frame'}|null=null;
  const down=(e:PointerEvent)=>{if(live.current.reduce)return;canvas.setPointerCapture(e.pointerId);drag={id:e.pointerId,x:e.clientX,y:e.clientY,a:sim.v[0],b:sim.v[1],lastX:e.clientX,lastAt:e.timeStamp,vx:0,mode:live.current.mode};if(drag.mode==='frame')input={...input,active:true,targetYaw:drag.a,targetTilt:drag.b};e.preventDefault();};
  const move=(e:PointerEvent)=>{if(!drag||e.pointerId!==drag.id)return;const scale=GYRO_W/canvas.getBoundingClientRect().width,elapsed=e.timeStamp-drag.lastAt;if(elapsed>0)drag.vx=(e.clientX-drag.lastX)*scale/elapsed;drag.lastX=e.clientX;drag.lastAt=e.timeStamp;if(drag.mode==='frame')input={...input,active:true,targetYaw:drag.a+(e.clientX-drag.x)*scale*.012,targetTilt:drag.b+(e.clientY-drag.y)*scale*.012};};
  const end=(e:PointerEvent)=>{if(!drag||e.pointerId!==drag.id)return;if(drag.mode==='spin'&&e.type==='pointerup'&&!live.current.reduce){const v=e.timeStamp-drag.lastAt<100?drag.vx:0;input={...input,active:false,spinImpulse:Math.max(-.009,Math.min(.009,v*.003)),impulseId:input.impulseId+1};}else input={...input,active:false};drag=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);};
  const key=(e:KeyboardEvent)=>{if(live.current.reduce)return;const j=.0003;if(e.key==='ArrowLeft')impulseGyro(sim,-j,0,0);else if(e.key==='ArrowRight')impulseGyro(sim,j,0,0);else if(e.key==='ArrowUp')impulseGyro(sim,0,-j,0);else if(e.key==='ArrowDown')impulseGyro(sim,0,j,0);else if(e.key===' '){input={...input,spinImpulse:e.shiftKey?-.003:.003,impulseId:input.impulseId+1};}else return;e.preventDefault();};
  const lost=(e:Event)=>{e.preventDefault();disposed=true;cancelAnimationFrame(raf);setError('WebGL context lost. Reload the preview to restart.');};
  canvas.addEventListener('keydown',key);canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.addEventListener('lostpointercapture',end);canvas.addEventListener('webglcontextlost',lost);
  return()=>{disposed=true;cancelAnimationFrame(raf);canvas.removeEventListener('keydown',key);canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',end);canvas.removeEventListener('pointercancel',end);canvas.removeEventListener('lostpointercapture',end);canvas.removeEventListener('webglcontextlost',lost);gl.deleteBuffer(buffer);gl.deleteProgram(p);shaders.forEach(s=>gl.deleteShader(s));};
 },[]);
 return <div className={styles.stage}><canvas ref={canvasRef} className={styles.canvas} width={GYRO_W} height={GYRO_H} tabIndex={0} role="img" aria-label={reduce?'Gyroscope, motion paused':'3D gyroscope. Space adds spin, Shift Space reverses spin, arrow keys nudge the gimbals. Or choose flick rotor or drag frame controls.'}/>{error?<p role="alert" className={styles.hint}>{error}</p>:null}<div className={styles.row}><button className={mode==='spin'?styles.chipPrimary:styles.chip} aria-pressed={mode==='spin'} onClick={()=>setMode('spin')}>Flick rotor</button><button className={mode==='frame'?styles.chipPrimary:styles.chip} aria-pressed={mode==='frame'} onClick={()=>setMode('frame')}>Drag frame</button><button className={slow?styles.chipPrimary:styles.chip} aria-pressed={slow} onClick={()=>setSlow(s=>!s)}>{slow?'¼ speed':'Slow motion'}</button><button className={styles.chip} onClick={()=>{reset.current++;}}>Reset</button></div><p className={styles.hint}>{reduce?'Motion paused for reduced motion.':mode==='spin'?'Flick horizontally to add or reverse spin.':'Drag to apply torque to the gimbals, then release.'}</p><p className={styles.fine}>Coupled rigid-body model · 1.5mm rotor imbalance · linear bearing drag</p></div>;
}
