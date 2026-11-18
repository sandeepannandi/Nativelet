"use client";
import { useEffect,useRef,useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import {createZip,stepZip,zipTo,zipScene,ZIP_W,ZIP_H,ZIP_TOP,ZIP_BOTTOM} from '../../packages/ui/src/components/zipper-reveal/zipperMath';
import styles from './zipper-reveal.module.css';
export function ZipperRevealPreview(){
 const canvas=useRef<HTMLCanvasElement>(null),sim=useRef(createZip());
 const [unavailable,setUnavailable]=useState(false);const [opening,setOpening]=useState(18);const [slow,setSlow]=useState(false);const reduced=!!useReducedMotion();const latest=useRef({slow,reduced});latest.current={slow,reduced};
 useEffect(()=>{const el=canvas.current,ctx=el?.getContext('2d');if(!el||!ctx){setUnavailable(true);return;}const dpr=Math.min(window.devicePixelRatio||1,2);el.width=ZIP_W*dpr;el.height=ZIP_H*dpr;
 let raf=0,last=0;const tick=(now:number)=>{stepZip(sim.current,(last?Math.min(.05,(now-last)/1000):1/60)*(latest.current.slow?.22:1),latest.current.reduced);last=now;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,ZIP_W,ZIP_H);for(const m of zipScene(sim.current)){const p=new Path2D(m.path);if(m.stroke){ctx.strokeStyle=m.color;ctx.lineWidth=m.stroke;ctx.stroke(p);}else{ctx.fillStyle=m.color;ctx.fill(p);}}raf=requestAnimationFrame(tick);};raf=requestAnimationFrame(tick);
 let pointer=-1,start=0,origin=0;const local=(e:PointerEvent)=>{const r=el.getBoundingClientRect();return{x:(e.clientX-r.left)*ZIP_W/r.width,y:(e.clientY-r.top)*ZIP_H/r.height};};
 const down=(e:PointerEvent)=>{if(pointer!==-1)return;const p=local(e),s=sim.current;if(Math.abs(p.x-180)>58||Math.abs(p.y-s.y-12)>65)return;pointer=e.pointerId;start=p.y;origin=s.y;s.drag=true;s.target=s.y;s.vy=0;el.setPointerCapture(pointer);};
 const move=(e:PointerEvent)=>{if(e.pointerId!==pointer)return;const p=local(e);zipTo(sim.current,origin+p.y-start,e.movementX,true);setOpening(Math.round((sim.current.target-ZIP_TOP)/(ZIP_BOTTOM-ZIP_TOP)*100));};
 const up=(e:PointerEvent)=>{if(e.pointerId!==pointer)return;pointer=-1;sim.current.drag=false;setOpening(Math.round((sim.current.target-ZIP_TOP)/(ZIP_BOTTOM-ZIP_TOP)*100));};
 el.addEventListener('pointerdown',down);el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);el.addEventListener('lostpointercapture',up);
 return()=>{cancelAnimationFrame(raf);el.removeEventListener('pointerdown',down);el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',up);el.removeEventListener('lostpointercapture',up);};
 },[]);
 if(unavailable)return <p role="status">Canvas preview is unavailable in this browser. The native source is in the Code tab.</p>;
 return <div className={styles.stage}><canvas ref={canvas} className={styles.canvas} role="slider" aria-label="Zipper opening" aria-valuemin={0} aria-valuemax={100} aria-valuenow={opening} tabIndex={0} onKeyDown={e=>{if(['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();zipTo(sim.current,e.key==='Home'?ZIP_TOP:e.key==='End'?ZIP_BOTTOM:sim.current.target+(e.key==='ArrowUp'||e.key==='ArrowRight'?35:-35));setOpening(Math.round((sim.current.target-ZIP_TOP)/(ZIP_BOTTOM-ZIP_TOP)*100));}}}/><div className={styles.controls}><button onClick={()=>{zipTo(sim.current,ZIP_TOP);setOpening(0);}}>Close</button><button onClick={()=>{zipTo(sim.current,ZIP_BOTTOM);setOpening(100);}}>Open</button><button aria-pressed={slow} onClick={()=>setSlow(v=>!v)}>{slow?'Slow motion on':'Slow motion'}</button></div></div>;
}
