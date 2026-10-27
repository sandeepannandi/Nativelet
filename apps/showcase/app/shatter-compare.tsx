import {useEffect,useState} from 'react';
import {Text,View} from 'react-native';
import {runOnUI,runOnJS} from 'react-native-reanimated';
import {runComparison} from '../diagnostics/shatter/benchmark';
export default function Comparison(){
 const [done,setDone]=useState(0);
 useEffect(()=>{let active=true;
  const finish=(result:ReturnType<typeof runComparison>)=>{if(!active)return;console.log('SHATTER_COMPARE '+JSON.stringify(result));setDone(result.job+1);if(result.job+1<48)setTimeout(()=>launch(result.job+1),150);else console.log('SHATTER_COMPARE_DONE jobs=48');};
  const launch=(job:number)=>runOnUI(()=>{'worklet';try{const r=runComparison(job);runOnJS(finish)(r);}catch(e){console.log('SHATTER_COMPARE_ERROR '+String(e));}})();
  const t=setTimeout(()=>launch(0),2500);return()=>{active=false;clearTimeout(t);};
 },[]);
 return <View><Text>Finite UI comparison {done}/48. No animation or profiler.</Text></View>;
}
