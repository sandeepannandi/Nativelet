import React,{useEffect,useMemo,useRef,useState} from 'react';
import {AccessibilityInfo,Pressable,StyleSheet,Text,View} from 'react-native';
import {Canvas,Fill,Shader,Skia,ImageShader,ColorType,AlphaType} from '@shopify/react-native-skia';
import {Gesture,GestureDetector,GestureHandlerRootView} from 'react-native-gesture-handler';
import {createWater,beginWaterDrag,updateWaterDrag,heightPixels,GRID_X,GRID_Z,disturb,moveBall,resetWater,stepWater,waterPoint,waterUniforms,WATER_H,WATER_W} from './waterMath';
import {WATER_SHADER} from './waterShader';
const effect=Skia.RuntimeEffect.Make(WATER_SHADER);
export function WaterTank({reducedMotion=false}:{reducedMotion?:boolean}){
 const state=useRef(createWater());const [width,setWidth]=useState(WATER_W);const height=width*WATER_H/WATER_W;
 const [image,setImage]=useState<ReturnType<typeof Skia.Image.MakeImage>|null>(null);
 const [uniforms,setUniforms]=useState(()=>waterUniforms(state.current,width,height));const [paused,setPaused]=useState(false),[slow,setSlow]=useState(false),[systemReduce,setSystemReduce]=useState(false);
 const latest=useRef({width,height,paused,slow,reduce:reducedMotion||systemReduce});latest.current={width,height,paused,slow,reduce:reducedMotion||systemReduce};
 useEffect(()=>{let alive=true;AccessibilityInfo.isReduceMotionEnabled().then(v=>{if(alive)setSystemReduce(v);}).catch(()=>{});const sub=AccessibilityInfo.addEventListener('reduceMotionChanged',setSystemReduce);return()=>{alive=false;sub.remove();};},[]);
 useEffect(()=>{let raf=0,last=0;const draw=(now:number)=>{const p=latest.current;const dt=last?Math.min(.05,(now-last)/1000):0;last=now;if(!p.paused&&!p.reduce)stepWater(state.current,dt*(p.slow?.2:1));const data=Skia.Data.fromBytes(heightPixels(state.current));setImage(Skia.Image.MakeImage({width:GRID_X,height:GRID_Z,colorType:ColorType.RGBA_8888,alphaType:AlphaType.Opaque},data,GRID_X*4));setUniforms(waterUniforms(state.current,p.width,p.height));raf=requestAnimationFrame(draw);};raf=requestAnimationFrame(draw);return()=>cancelAnimationFrame(raf);},[]);
 const grab=useRef({owned:false,dx:0,dz:0});
 const pan=useMemo(()=>Gesture.Pan().runOnJS(true).minDistance(0).onBegin(e=>{grab.current=beginWaterDrag(state.current,e.x,e.y,latest.current.width,latest.current.height);}).onUpdate(e=>{updateWaterDrag(state.current,grab.current,e.x,e.y,latest.current.width,latest.current.height);}).onFinalize(()=>{grab.current.owned=false;}),[]);
 const action=(name:string)=>{const s=state.current;if(name==='increment')moveBall(s,s.x+.15,s.z);else if(name==='decrement')moveBall(s,s.x-.15,s.z);};
 if(!effect)return <Text accessibilityRole="alert">Water renderer unavailable: shader compilation failed.</Text>;
 return <GestureHandlerRootView style={styles.root} onLayout={e=>setWidth(Math.max(100,Math.min(WATER_W,e.nativeEvent.layout.width)))}><GestureDetector gesture={pan}><View accessible accessibilityRole="adjustable" accessibilityLabel="Interactive water tank" accessibilityHint="Drag across the pool to move the submerged ball. Wave, pause and reset controls are below." accessibilityActions={[{name:'increment',label:'Move ball right'},{name:'decrement',label:'Move ball left'}]} onAccessibilityAction={e=>action(e.nativeEvent.actionName)} style={{width,height}}><Canvas style={{width,height}}><Fill>{image?<Shader source={effect} uniforms={uniforms}><ImageShader image={image} tx="clamp" ty="clamp" fit="none" sampling={{filter:1,mipmap:0}}/></Shader>:null}</Fill></Canvas></View></GestureDetector><View style={styles.controls}>{[
 ['Wave',()=>disturb(state.current,0,0,.04)],
 [paused?'Resume':'Pause',()=>setPaused(v=>!v)],
 [slow?'Slow on':'Slow motion',()=>setSlow(v=>!v)],
 ['Reset',()=>resetWater(state.current)],
 ].map(([label,fn])=><Pressable key={label as string} accessibilityRole="button" onPress={fn as ()=>void} style={styles.button}><Text style={styles.label}>{label as string}</Text></Pressable>)}</View></GestureHandlerRootView>;
}
const styles=StyleSheet.create({root:{width:'100%',alignItems:'center'},controls:{flexDirection:'row',flexWrap:'wrap',gap:8,justifyContent:'center'},button:{minHeight:44,paddingHorizontal:12,borderWidth:1,borderColor:'#b8cbc6',borderRadius:8,justifyContent:'center'},label:{fontSize:12,color:'#315954',fontFamily:'Geist'}});
