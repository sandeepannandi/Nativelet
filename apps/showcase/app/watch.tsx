import { Link } from 'expo-router';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Example from '../../../packages/ui/src/components/mechanical-watch/Example';
export default function WatchScreen() { const inset=useSafeAreaInsets(); return <View style={{flex:1,backgroundColor:'#0b0b10',paddingTop:inset.top+24,paddingBottom:inset.bottom+16}}><Link href="/" style={{marginHorizontal:24,color:'#8a93a6'}}>← Nativelet</Link><View style={{flex:1,justifyContent:'center'}}><Example /></View><Text style={{padding:24,fontSize:12,color:'#6b7488'}}>Skia and Reanimated, software 3D. Physical-device performance untested.</Text></View>; }
