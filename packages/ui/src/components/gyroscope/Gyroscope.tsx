import React,{useEffect,useMemo,useRef,useState} from 'react';
import {AccessibilityInfo,PanResponder,Pressable,Text,View,type ViewStyle} from 'react-native';
import {Canvas,Fill,Shader,Skia} from '@shopify/react-native-skia';
import {useDerivedValue,useFrameCallback,useSharedValue} from 'react-native-reanimated';
import {createGyro,GYRO_DEFAULTS} from './gyroMath';
import {driveGyro,GYRO_IDLE,GYRO_W,GYRO_H,type GyroInput} from './gyroControl';
import {GYRO_SHADER} from './gyroShader';
let effect:ReturnType<typeof Skia.RuntimeEffect.Make>|undefined;
function shader(){if(effect===undefined)effect=Skia.RuntimeEffect.Make(GYRO_SHADER+'\nhalf4 main(float2 p){return half4(gyroColor(p));}');return effect;}
export type GyroscopeProps={reducedMotion?:boolean;style?:ViewStyle;onFeedback?:(event:'grab'|'spin'|'reset')=>void};
export function Gyroscope({reducedMotion,style,onFeedback}:GyroscopeProps){
 const [beat,setBeat]=useState(0),[systemReduce,setSystemReduce]=useState(false),[mode,setMode]=useState<'spin'|'frame'>('spin'),[slow,setSlow]=useState(false),[error,setError]=useState(false);
 const reduce=reducedMotion??systemReduce,sim=useSharedValue(createGyro()),input=useSharedValue<GyroInput>({...GYRO_IDLE}),frame=useSharedValue(0),lastImpulse=useSharedValue(0),slowSV=useSharedValue(false),reduceSV=useSharedValue(false),resetSV=useSharedValue(0),seenReset=useSharedValue(0);
 useEffect(()=>{if(reduce)return;let id=0,alive=true;const tick=()=>{if(!alive)return;setBeat(x=>(x+1)%2);id=requestAnimationFrame(tick);};id=requestAnimationFrame(tick);return()=>{alive=false;cancelAnimationFrame(id);};},[reduce]);
 const effect=useMemo(()=>shader(),[]),latest=useRef({mode,reduce,onFeedback});latest.current={mode,reduce,onFeedback};
 const drag=useRef({a:0,b:0,mode:'spin' as 'spin'|'frame'});
 useEffect(()=>{let alive=true;AccessibilityInfo.isReduceMotionEnabled().then(x=>{if(alive)setSystemReduce(x);}).catch(()=>{});const sub=AccessibilityInfo.addEventListener('reduceMotionChanged',setSystemReduce);return()=>{alive=false;sub.remove();};},[]);
 useEffect(()=>{slowSV.value=slow;},[slow,slowSV]);
 useEffect(()=>{reduceSV.value=reduce;input.value={...GYRO_IDLE};},[reduce,reduceSV,input]);
 useEffect(()=>{if(!effect)setError(true);},[effect]);
 useFrameCallback(info=>{
  if(resetSV.value!==seenReset.value){sim.value=createGyro(GYRO_DEFAULTS,reduceSV.value?0:45);input.value={...GYRO_IDLE};seenReset.value=resetSV.value;lastImpulse.value=0;frame.value+=1;}
  if(reduceSV.value)return;
  if(!reduceSV.value){lastImpulse.value=driveGyro(sim.value,GYRO_DEFAULTS,input.value,Math.max(0,(info.timeSincePreviousFrame??16.667)/1000)*(slowSV.value?.25:1),lastImpulse.value);}
  frame.value+=1;
 });
 const uniforms=useDerivedValue(()=>{frame.value;const v=sim.value.v;return {size:[GYRO_W,GYRO_H],angles:[v[0],v[1],v[2]%(2*Math.PI)],exposure:1.2};});
 const pan=useMemo(()=>PanResponder.create({
  onStartShouldSetPanResponder:()=>!latest.current.reduce,onMoveShouldSetPanResponder:()=>!latest.current.reduce,
  onPanResponderGrant:()=>{drag.current={a:sim.value.v[0],b:sim.value.v[1],mode:latest.current.mode};latest.current.onFeedback?.('grab');if(drag.current.mode==='frame')input.value={...input.value,active:true,targetYaw:drag.current.a,targetTilt:drag.current.b};},
  onPanResponderMove:(_,g)=>{if(drag.current.mode==='frame')input.value={...input.value,active:true,targetYaw:drag.current.a+g.dx*.012,targetTilt:drag.current.b+g.dy*.012};},
  onPanResponderRelease:(_,g)=>{const old=input.value;if(drag.current.mode==='spin'){
   // Hand flick scales to a finite generalized angular impulse, not an assigned rotor speed.
   const j=Math.max(-.009,Math.min(.009,g.vx*.003));input.value={...old,active:false,spinImpulse:j,impulseId:old.impulseId+1};latest.current.onFeedback?.('spin');
  }else input.value={...old,active:false};},
  onPanResponderTerminate:()=>{input.value={...input.value,active:false};},onPanResponderTerminationRequest:()=>false,
 }),[input,sim]);
 const button=(label:string,onPress:()=>void,selected=false)=><Pressable accessibilityRole="button" accessibilityState={{selected}} onPress={onPress} style={{minHeight:44,paddingHorizontal:13,justifyContent:'center',borderRadius:12,backgroundColor:selected?'#31513b':'#e6edde'}}><Text style={{color:selected?'#fff':'#31513b',fontSize:12}}>{label}</Text></Pressable>;
 return <View style={[{alignItems:'center',gap:12},style]}>
  <View {...pan.panHandlers} accessible accessibilityRole="adjustable" accessibilityActions={[{name:"increment",label:"Add rotor spin"},{name:"decrement",label:"Reverse rotor spin"}]} onAccessibilityAction={e=>{if(reduce)return;const j=e.nativeEvent.actionName==="increment"?.003:-.003;input.value={...input.value,spinImpulse:j,impulseId:input.value.impulseId+1};}} accessibilityLabel={reduce?'Gyroscope, motion paused':'Gyroscope. Choose flick rotor or drag frame below.'} style={{width:GYRO_W,height:GYRO_H,borderRadius:18,overflow:'hidden',backgroundColor:'#171c21'}}>
   <View pointerEvents="none" style={{position:'absolute',width:1,height:1,opacity:0,transform:[{translateX:beat}]}}/>
   <Canvas pointerEvents="none" style={{width:GYRO_W,height:GYRO_H}}>{effect?<Fill><Shader source={effect} uniforms={uniforms}/></Fill>:null}</Canvas>
   {error?<Text style={{position:'absolute',top:24,left:16,right:16,color:'white'}}>Gyroscope shader unavailable on this renderer.</Text>:null}
  </View>
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:8,justifyContent:'center',maxWidth:GYRO_W}}>
   {button('Flick rotor',()=>{input.value={...input.value,active:false};setMode('spin');},mode==='spin')}
   {button('Drag frame',()=>{input.value={...input.value,active:false};setMode('frame');},mode==='frame')}
   {button(slow?'¼ speed':'Slow motion',()=>setSlow(x=>!x),slow)}
   {button('Reset',()=>{resetSV.value+=1;onFeedback?.('reset');})}
  </View>
  <Text style={{color:'#4b6053',fontSize:12,textAlign:'center',maxWidth:GYRO_W}}>{reduce?'Motion paused for reduced motion.':mode==='spin'?'Flick horizontally to add or reverse spin.':'Drag to apply torque to the gimbals, then release.'}</Text>
  <Text style={{color:'#718177',fontSize:10,textAlign:'center',maxWidth:GYRO_W}}>Coupled rigid-body model · 1.5mm rotor imbalance · linear bearing drag</Text>
 </View>;
}
