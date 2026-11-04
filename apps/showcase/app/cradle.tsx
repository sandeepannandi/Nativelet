import { Link } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Platform, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Example from '../../../packages/ui/src/components/newtons-cradle/Example';
export default function CradleScreen() { const inset=useSafeAreaInsets(); return <View style={{flex:1,backgroundColor:'#f5f6f7',paddingTop:inset.top+24,paddingBottom:inset.bottom+16}}><Link href="/" style={{marginHorizontal:24,color:'#52616b'}}>← Nativelet</Link><View style={{flex:1,justifyContent:'center'}}><Example onFeedback={()=>{if(Platform.OS!=='web')void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(()=>{});}}/></View><Text style={{padding:24,fontSize:12,color:'#71808a'}}>Skia and Reanimated. Physical-device performance untested.</Text></View>; }
