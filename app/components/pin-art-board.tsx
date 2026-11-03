'use client';
import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { PA_H, PA_W, PIN_COLORS, PIN_WIDTHS, createPins, pinPoints, pressPins, stepPins, wipePins } from '../../packages/ui/src/components/pin-art-board/pinMath';
import styles from './pin-art-board.module.css';
export function PinArtBoardPreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null), sim = useRef(createPins());
  const [erase,setErase] = useState(false), [slow,setSlow] = useState(false);
  const reduced = !!useReducedMotion(), latest = useRef({erase,slow,reduced}); latest.current={erase,slow,reduced};
  useEffect(() => {
    const canvas=canvasRef.current!, ctx=canvas.getContext('2d')!;
    const dpr=Math.min(2,window.devicePixelRatio||1); canvas.width=PA_W*dpr; canvas.height=PA_H*dpr; ctx.scale(dpr,dpr);
    let last=0, raf=0, down=false, x=0,y=0;
    const locate=(e:PointerEvent)=>{ const b=canvas.getBoundingClientRect(); x=(e.clientX-b.left)*PA_W/b.width; y=(e.clientY-b.top)*PA_H/b.height; };
    const start=(e:PointerEvent)=>{ locate(e); down=true; canvas.setPointerCapture(e.pointerId); };
    const move=(e:PointerEvent)=>locate(e); const end=()=>{down=false;};
    canvas.addEventListener('pointerdown',start);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.addEventListener('lostpointercapture',end);
    function draw(now:number) {
      const opts=latest.current,s=sim.current;
      if(down) pressPins(s,x,y,opts.erase);
      stepPins(s,Math.min(.04,(now-last)/1000)*(opts.slow?.25:1),opts.reduced);last=now;
      ctx.fillStyle='#10161b';ctx.fillRect(0,0,PA_W,PA_H);
      const g=ctx.createLinearGradient(16,25,324,389);[[0,'#b6bfc5'],[.12,'#3c464e'],[.84,'#172027'],[1,'#839098']].forEach(([o,c])=>g.addColorStop(o as number,c as string));
      ctx.fillStyle=g;ctx.beginPath();ctx.roundRect(16,25,308,364,13);ctx.fill();ctx.fillStyle='#070d12';ctx.beginPath();ctx.roundRect(23,32,294,350,8);ctx.fill();
      for(let p=0;p<6;p++) { const points=pinPoints(s,p);ctx.strokeStyle=PIN_COLORS[p];ctx.fillStyle=PIN_COLORS[p];ctx.lineWidth=PIN_WIDTHS[p];ctx.lineCap='round';ctx.beginPath();
        if(p<2) { for(let i=0;i<points.length;i+=2) {ctx.moveTo(points[i].x,points[i].y);ctx.lineTo(points[i+1].x,points[i+1].y);}ctx.stroke(); }
        else {for(const q of points) {ctx.moveTo(q.x+PIN_WIDTHS[p]/2,q.y);ctx.arc(q.x,q.y,PIN_WIDTHS[p]/2,0,Math.PI*2);}ctx.fill();}
      }
      ctx.fillStyle='#c1cbd0';for(const [sx,sy] of [[22,31],[318,31],[22,383],[318,383]]) {ctx.beginPath();ctx.arc(sx,sy,2,0,Math.PI*2);ctx.fill();}
      raf=requestAnimationFrame(draw);
    }
    raf=requestAnimationFrame(draw);return()=>{cancelAnimationFrame(raf);canvas.removeEventListener('pointerdown',start);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',end);canvas.removeEventListener('pointercancel',end);canvas.removeEventListener('lostpointercapture',end);};
  },[]);
  return <div className={styles.stage}><canvas ref={canvasRef} className={styles.canvas} style={{width:PA_W,height:PA_H}} tabIndex={0} role="application" aria-label="Metal pin art board. Drag to sculpt. Press Enter for a centre impression, Delete to flatten." onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();pressPins(sim.current,170,210,erase);}if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();if(reduced)sim.current=createPins(false);else wipePins(sim.current);}}}/><div className={styles.row}><button className={styles.chip} aria-pressed={erase} onClick={()=>setErase(v=>!v)}>{erase?'Erase':'Sculpt'}</button><button className={styles.chip} onClick={()=>{ if(reduced)sim.current=createPins(false);else wipePins(sim.current); }}>Wipe flat</button><button className={styles.chip} aria-pressed={slow} onClick={()=>setSlow(v=>!v)}>Slow motion: {slow?'on':'off'}</button></div><p className={styles.hint}>Press and drag. The pins hold your impression.</p></div>;
}
