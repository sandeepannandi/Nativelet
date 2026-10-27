import {useEffect,useState} from 'react';
import {Text,View} from 'react-native';
import {runOnUI,runOnJS} from 'react-native-reanimated';
import {prepareNativeShatter} from '../../../packages/ui/src/components/glass-shatter/shatterNative';
import {checkShatterNativeBoundary,fullStateCase} from '../diagnostics/shatterNativeBoundary';
export default function NativeTest(){const[state,setState]=useState('Installing');useEffect(()=>{let active=true;
const failed=(e:string)=>{if(active){setState(e);console.log('SHATTER_NATIVE_ERROR '+e);}};
const finish=(r:ReturnType<typeof fullStateCase>)=>{if(!active)return;console.log('SHATTER_NATIVE_CASE '+JSON.stringify(r));setState(`Exact ${r.job+1}/54`);if(r.job<53)setTimeout(()=>launch(r.job+1),50);else console.log('SHATTER_NATIVE_DONE cases=54 frames=12960');};
const launch=(job:number)=>runOnUI(()=>{'worklet';try{if(job===0)console.log('SHATTER_NATIVE_BOUNDARY '+JSON.stringify(checkShatterNativeBoundary()));runOnJS(finish)(fullStateCase(job));}catch(e){runOnJS(failed)(String(e));}})();
if(process.env.EXPO_PUBLIC_SHATTER_PROFILE !== '1'){failed('diagnostic build required');return;}
prepareNativeShatter().then(()=>{if(active)launch(0);},e=>failed(String(e)));return()=>{active=false;};},[]);return <View><Text>{state}</Text></View>;}
