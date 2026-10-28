import { Link } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Platform, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Example from '../../../packages/ui/src/components/glass-shatter/Example';
export default function ShatterScreen() {
  const inset = useSafeAreaInsets();
  return <View style={{ flex: 1, backgroundColor: '#dfe5ee', paddingTop: inset.top + 24, paddingBottom: inset.bottom + 16 }}><Link href="/" style={{ marginHorizontal: 24, color: '#1f3a5f' }}>← Preview Rail</Link><View style={{ flex: 1, justifyContent: 'center' }}><Example onFeedback={() => { if (Platform.OS === 'web') return; void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); }} /></View><Text style={{ padding: 24, color: '#7a879c', fontSize: 12 }}>Skia and Reanimated. Not yet tested on a physical device. Haptics and screen readers need native verification.</Text></View>;
}
