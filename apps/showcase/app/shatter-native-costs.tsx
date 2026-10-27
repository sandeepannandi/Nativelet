import {useEffect,useState} from 'react';
import {Text,View} from 'react-native';
import {runOnUI,runOnJS} from 'react-native-reanimated';
import {prepareNativeShatter} from '../../../packages/ui/src/components/glass-shatter/shatterNative';
import {nativeCosts} from '../diagnostics/shatterNativeCosts';
export default function NativeCosts(){const[state,setState]=useState('Installing');useEffect(()=>{let alive=true;
 const failed=(e:string)=>{if(alive){setState(e);console.log('SHATTER_COST_ERROR '+e);}};
 const finish=(r:ReturnType<typeof nativeCosts>)=>{if(!alive)return;console.log('SHATTER_COST '+JSON.stringify(r));setState(`Costs ${r.job+1}/24`);if(r.job<23)setTimeout(()=>launch(r.job+1),100);else console.log('SHATTER_COST_DONE jobs=24');};
 const launch=(job:number)=>runOnUI(()=>{'worklet';try{runOnJS(finish)(nativeCosts(job));}catch(e){runOnJS(failed)(String(e));}})();
 prepareNativeShatter().then(()=>{if(alive)launch(0);},e=>failed(String(e)));return()=>{alive=false;};},[]);return <View><Text>{state}</Text></View>;}
