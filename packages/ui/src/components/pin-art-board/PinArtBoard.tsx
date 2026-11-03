import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, PanResponder, View, type ViewStyle } from 'react-native';
import { Canvas, Fill, LinearGradient, Points, RoundedRect, vec } from '@shopify/react-native-skia';
import { useSharedValue } from 'react-native-reanimated';
import { PA_H, PA_W, PIN_COLORS, PIN_WIDTHS, createPins, pinPoints, pressPins, stepPins, wipePins } from './pinMath';
export type PinArtBoardProps = { erase?: boolean; resetKey?: number; slowMotion?: boolean; reducedMotion?: boolean; onFeedback?: () => void; style?: ViewStyle };
export function PinArtBoard({ erase = false, resetKey = 0, slowMotion = false, reducedMotion, onFeedback, style }: PinArtBoardProps) {
  // One owner for simulation, input and reset. Only finished geometry crosses to
  // Skia. Do not mutate nested objects shared between JS and the UI runtime.
  const [initial] = useState(() => { const state=createPins(); return {state,points:Array.from({length:6},(_,pass)=>pinPoints(state,pass))}; });
  const sim = useRef(initial.state);
  const [systemReduce,setSystemReduce]=useState(false);
  const reduce=reducedMotion??systemReduce;
  const latest=useRef({erase,slowMotion,reduce,onFeedback});latest.current={erase,slowMotion,reduce,onFeedback};
  const pointer=useRef({x:0,y:0,down:false}),origin=useRef({x:0,y:0});
  const p0=useSharedValue(initial.points[0]),p1=useSharedValue(initial.points[1]),p2=useSharedValue(initial.points[2]),p3=useSharedValue(initial.points[3]),p4=useSharedValue(initial.points[4]),p5=useSharedValue(initial.points[5]);
  const passes=useMemo(()=>[p0,p1,p2,p3,p4,p5],[p0,p1,p2,p3,p4,p5]);
  const [beat,setBeat]=useState(0);
  const previous=useRef(resetKey);
  const clear=()=>{if(latest.current.reduce)sim.current=createPins(false);else wipePins(sim.current);};
  useEffect(()=>{if(previous.current!==resetKey){previous.current=resetKey;clear();}},[resetKey]);
  useEffect(()=>{let alive=true;AccessibilityInfo.isReduceMotionEnabled().then(v=>{if(alive)setSystemReduce(v);}).catch(()=>{});const sub=AccessibilityInfo.addEventListener('reduceMotionChanged',setSystemReduce);return()=>{alive=false;sub.remove();};},[]);
  useEffect(()=>{
    let active=true,id=0,last=0;
    const tick=(now:number)=>{
      if(!active)return;
      const s=sim.current,p=pointer.current,o=latest.current;
      if(p.down)pressPins(s,p.x,p.y,o.erase);
      const wall=Date.now();
      stepPins(s,Math.min(2,last?(wall-last)/1000:1/60)*(o.slowMotion?.25:1),o.reduce);last=wall;
      for(let pass=0;pass<6;pass++)passes[pass].value=pinPoints(s,pass);
      // Android sometimes omits presentation on an otherwise idle screen.
      setBeat(v=>v+1);id=requestAnimationFrame(tick);
    };
    id=requestAnimationFrame(tick);return()=>{active=false;cancelAnimationFrame(id);};
  },[passes]);
  const stroke=(x:number,y:number)=>{
    const old=pointer.current,steps=Math.max(1,Math.ceil(Math.hypot(x-old.x,y-old.y)/6));
    for(let i=1;i<=steps;i++)pressPins(sim.current,old.x+(x-old.x)*i/steps,old.y+(y-old.y)*i/steps,latest.current.erase);
    pointer.current={x,y,down:true};
  };
  const pan=useMemo(()=>PanResponder.create({
    onStartShouldSetPanResponder:()=>true,onMoveShouldSetPanResponder:()=>true,
    onPanResponderGrant:e=>{origin.current={x:e.nativeEvent.locationX,y:e.nativeEvent.locationY};pointer.current={...origin.current,down:true};pressPins(sim.current,origin.current.x,origin.current.y,latest.current.erase);latest.current.onFeedback?.();},
    onPanResponderMove:(_e,g)=>{stroke(origin.current.x+g.dx,origin.current.y+g.dy);},
    onPanResponderRelease:()=>{pointer.current.down=false;},onPanResponderTerminate:()=>{pointer.current.down=false;},onPanResponderTerminationRequest:()=>false,
  }),[]);
  return <View {...pan.panHandlers} style={[{width:PA_W,height:PA_H,borderRadius:20,overflow:'hidden',backgroundColor:'#10161b'},style]} accessible accessibilityRole="adjustable" accessibilityLabel="Pin art board. Drag to raise a lasting impression. Use erase mode to press pins flat, or Wipe flat to clear the board." accessibilityActions={[{name:'increment',label:'Make a centre impression'},{name:'decrement',label:'Flatten board'}]} onAccessibilityAction={e=>{if(e.nativeEvent.actionName==='increment')pressPins(sim.current,170,210);else clear();}}>
    <View pointerEvents="none" style={{position:'absolute',width:1,height:1,opacity:0,transform:[{translateX:beat%2}]}}/>
    <Canvas pointerEvents="none" style={{width:PA_W,height:PA_H}}>
      <Fill color="#10161b"/>
      <RoundedRect x={16} y={25} width={308} height={364} r={13}><LinearGradient start={vec(16,25)} end={vec(324,389)} colors={['#b6bfc5','#3c464e','#172027','#839098']} positions={[0,.12,.84,1]}/></RoundedRect>
      <RoundedRect x={23} y={32} width={294} height={350} r={8} color="#070d12"/>
      {passes.map((points,pass)=><Points key={pass} points={points} mode={pass<2?'lines':'points'} color={PIN_COLORS[pass]} style="stroke" strokeWidth={PIN_WIDTHS[pass]} strokeCap="round"/>)}
      {[[22,31],[318,31],[22,383],[318,383]].map(([x,y],i)=><RoundedRect key={i} x={x-2} y={y-2} width={4} height={4} r={2} color="#c1cbd0"/>)}
    </Canvas>
  </View>;
}
