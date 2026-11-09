import {Link} from 'expo-router';
import {Text,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Example from '../../../packages/ui/src/components/gyroscope/Example';
export default function GyroscopeScreen(){const inset=useSafeAreaInsets();return <View style={{flex:1,backgroundColor:'#f3f6ee',paddingTop:inset.top+20,paddingBottom:inset.bottom+12}}><Link href="/" style={{marginHorizontal:24,color:'#31513b'}}>← Components</Link><View style={{flex:1,justifyContent:'center'}}><Example/></View><Text style={{paddingHorizontal:24,color:'#637e6b',fontSize:11}}>Gyroscope model and studio rendering. Native/device verification pending.</Text></View>;}
