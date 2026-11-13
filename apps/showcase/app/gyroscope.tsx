import {Link,useLocalSearchParams} from 'expo-router';
import {Text,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Example from '../../../packages/ui/src/components/gyroscope/Example';
import {__setGyroTestHook} from '../../../packages/ui/src/components/gyroscope/Gyroscope';
// Test-only: ?telemetry=1 installs the internal gyro test hook before the
// component mounts (release APKs have no console strip, so events reach
// logcat as '[gyro-test]' JSON). ?reducedMotion=1 pins the reduced-motion
// path; ?reducedMotion=0 pins motion ON for physical-test devices whose
// system reduced-motion setting is enabled. Both default off (the system
// setting wins); production renders are untouched.
let telemetryInstalled=false;
export default function GyroscopeScreen(){const inset=useSafeAreaInsets();const params=useLocalSearchParams();if(params.telemetry==='1'&&!telemetryInstalled){telemetryInstalled=true;__setGyroTestHook(e=>{console.log('[gyro-test]',JSON.stringify(e));});console.log('[gyro-test]',JSON.stringify({kind:'bridge',wallT:Date.now()}));}return <View style={{flex:1,backgroundColor:'#f3f6ee',paddingTop:inset.top+20,paddingBottom:inset.bottom+12}}><Link href="/" style={{marginHorizontal:24,color:'#31513b'}}>← Components</Link><View style={{flex:1,justifyContent:'center'}}><Example reducedMotion={params.reducedMotion==='1'?true:params.reducedMotion==='0'?false:undefined}/></View><Text style={{paddingHorizontal:24,color:'#637e6b',fontSize:11}}>Gyroscope model and studio rendering. Native/device verification pending.</Text></View>;}
