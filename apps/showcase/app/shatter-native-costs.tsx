import {useEffect,useState} from 'react';
import {Text,View} from 'react-native';
import {runOnUI,runOnJS} from 'react-native-reanimated';
import {prepareNativeShatter} from '../../../packages/ui/src/components/glass-shatter/shatterNative';
import {nativeCosts} from '../diagnostics/shatterNativeCosts';
export default function NativeCosts(){const[state,setState]=useState('Installing');useEffect(()=>{let alive=true;const run=String(Date.now())+'-'+Math.random().toString(36).slice(2);
 const failed=(e:string)=>{if(alive){setState(e);console.log('SHATTER_COST_ERROR '+e);}};
 const finish=(r:ReturnType<typeof nativeCosts>)=>{if(!alive)return;const raw=JSON.stringify(r),count=Math.ceil(raw.length/1800);for(let index=0;index<count;index++)console.log('SHATTER_COST_CHUNK '+JSON.stringify({run,job:r.job,index,count,text:raw.slice(index*1800,(index+1)*1800)}));setState(`Costs ${r.job+1}/24`);if(r.job<23)setTimeout(()=>launch(r.job+1),100);else console.log('SHATTER_COST_DONE '+JSON.stringify({run,jobs:24}));};
 const launch=(job:number)=>runOnUI(()=>{'worklet';try{runOnJS(finish)(nativeCosts(job));}catch(e){runOnJS(failed)(String(e));}})();
 prepareNativeShatter().then(()=>{if(alive)launch(0);},e=>failed(String(e)));return()=>{alive=false;};},[]);return <View><Text>{state}</Text></View>;}
