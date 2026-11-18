import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { Canvas, Group, Picture, Skia, PaintStyle, type SkPicture } from '@shopify/react-native-skia';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { createZip, stepZip, zipScene, zipTo, ZIP_BOTTOM, ZIP_H, ZIP_TOP, ZIP_W } from './zipperMath';

export type ZipperRevealProps = { initialOpening?: number; reducedMotion?: boolean; slowMotion?: boolean; onOpeningChange?: (opening: number) => void; style?: ViewStyle };

export function ZipperReveal({ initialOpening=0.18, reducedMotion, slowMotion=false, onOpeningChange, style }: ZipperRevealProps) {
  const windowWidth=useWindowDimensions().width;
  const [available,setAvailable]=useState(windowWidth-32);
  const scale=Math.max(.1,Math.min(1,available/ZIP_W));
  const [opening,setOpening]=useState(Math.round(Math.max(0,Math.min(1,initialOpening))*100));
  const sim=useRef(createZip(initialOpening));
  const [picture,setPicture]=useState<SkPicture|null>(null);
  const [systemReduce,setSystemReduce]=useState(false);
  const [slow,setSlow]=useState(false);
  const latest=useRef({reduce:reducedMotion??systemReduce,slow:slowMotion||slow,onOpeningChange});
  latest.current={reduce:reducedMotion??systemReduce,slow:slowMotion||slow,onOpeningChange};
  const grab=useRef({y:0,start:0,active:false});
  useEffect(()=>{let mounted=true; AccessibilityInfo.isReduceMotionEnabled().then(v=>{if(mounted)setSystemReduce(v);}); const sub=AccessibilityInfo.addEventListener('reduceMotionChanged',setSystemReduce); return()=>{mounted=false;sub.remove();};},[]);
  useEffect(()=>{
    let alive=true,raf=0,last=0,previous="";
    const draw=(now:number)=>{
      if(!alive)return;
      const dt=last?Math.min(.05,(now-last)/1000):1/60;last=now;
      stepZip(sim.current,dt*(latest.current.slow?.22:1),latest.current.reduce);
      const key=[sim.current.y.toFixed(3),sim.current.pull.toFixed(3),...sim.current.edge.map(x=>x.toFixed(2))].join();
      if(key===previous){raf=requestAnimationFrame(draw);return;} previous=key;
      const recorder=Skia.PictureRecorder(); const c=recorder.beginRecording({x:0,y:0,width:ZIP_W,height:ZIP_H});
      const paint=Skia.Paint();paint.setAntiAlias(true);
      for(const mark of zipScene(sim.current)) {
        const path=Skia.Path.MakeFromSVGString(mark.path); if(!path)continue;
        paint.setColor(Skia.Color(mark.color)); paint.setStyle(mark.stroke?PaintStyle.Stroke:PaintStyle.Fill); paint.setStrokeWidth(mark.stroke??1);
        c.drawPath(path,paint);
      }
      setPicture(recorder.finishRecordingAsPicture());
      raf=requestAnimationFrame(draw);
    };
    raf=requestAnimationFrame(draw);return()=>{alive=false;cancelAnimationFrame(raf);};
  },[]);
  const publish=()=>setOpening(Math.round((sim.current.target-ZIP_TOP)/(ZIP_BOTTOM-ZIP_TOP)*100));
  const change=(y:number)=>{zipTo(sim.current,y);publish();latest.current.onOpeningChange?.((sim.current.target-ZIP_TOP)/(ZIP_BOTTOM-ZIP_TOP));};
  const pan=Gesture.Pan().runOnJS(true).minDistance(0).onBegin(e=>{
    const s=sim.current;grab.current={y:e.y/scale,start:s.y,active:Math.abs(e.x/scale-180)<58&&Math.abs(e.y/scale-s.y-12)<65};
    if(grab.current.active){s.drag=true;s.target=s.y;s.vy=0;}
  }).onUpdate(e=>{if(grab.current.active){zipTo(sim.current,grab.current.start+e.translationY/scale,e.velocityX*.002,true);publish();}}).onFinalize(()=>{
    const owned=grab.current.active;sim.current.drag=false;grab.current.active=false;
    if(owned)latest.current.onOpeningChange?.((sim.current.target-ZIP_TOP)/(ZIP_BOTTOM-ZIP_TOP));
  });
  return <GestureHandlerRootView onLayout={e=>setAvailable(e.nativeEvent.layout.width)} style={[styles.root,style]}><GestureDetector gesture={pan}><View accessible accessibilityValue={{min:0,max:100,now:opening,text:`${opening}% open`}} accessibilityRole="adjustable" accessibilityLabel="Zipper reveal" accessibilityHint="Drag the metal pull down to open or up to close. Open and Close buttons are also available." accessibilityActions={[{name:'increment',label:'Open further'},{name:'decrement',label:'Close further'}]} onAccessibilityAction={e=>change(sim.current.target+(e.nativeEvent.actionName==='increment'?45:-45))} style={[styles.panel,{width:ZIP_W*scale,height:ZIP_H*scale}]}>
    <Canvas style={{width:ZIP_W*scale,height:ZIP_H*scale}}><Group transform={[{scale}]}>{picture?<Picture picture={picture}/>:null}</Group></Canvas>
  </View></GestureDetector><View style={styles.controls}>
    <Pressable accessibilityRole="button" onPress={()=>change(ZIP_TOP)} style={styles.button}><Text style={styles.label}>Close</Text></Pressable>
    <Pressable accessibilityRole="button" onPress={()=>change(ZIP_BOTTOM)} style={styles.button}><Text style={styles.label}>Open</Text></Pressable>
    <Pressable accessibilityRole="button" disabled={slowMotion} accessibilityState={{selected:slowMotion||slow,disabled:slowMotion}} onPress={()=>setSlow(v=>!v)} style={styles.button}><Text style={styles.label}>{slowMotion||slow?'Slow motion on':'Slow motion'}</Text></Pressable>
  </View></GestureHandlerRootView>;
}
const styles=StyleSheet.create({root:{alignItems:'center',width:'100%'},panel:{width:ZIP_W,height:ZIP_H,borderRadius:14,overflow:'hidden',backgroundColor:'#e9dac1'},controls:{flexDirection:'row',gap:8,marginTop:16,justifyContent:'center'},button:{minHeight:44,paddingHorizontal:14,justifyContent:'center',borderRadius:8,borderWidth:1,borderColor:'#cad1c9'},label:{fontFamily:'Geist',fontSize:12,color:'#31513b'}});
