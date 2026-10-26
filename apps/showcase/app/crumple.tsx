import { Link } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Platform, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Example from '../../../packages/ui/src/components/paper-crumple/Example';
export default function CrumpleScreen() {
  const inset = useSafeAreaInsets();
  return <View style={{ flex: 1, backgroundColor: '#e9e6df', paddingTop: inset.top + 24, paddingBottom: inset.bottom + 16 }}><Link href="/" style={{ marginHorizontal: 24, color: '#2f6b4f' }}>← Preview Rail</Link><View style={{ flex: 1, justifyContent: 'center' }}><Example onFeedback={() => { if (Platform.OS === 'web') return; void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); }} /></View><Text style={{ padding: 24, color: '#8a8374', fontSize: 12 }}>Skia and Reanimated. Haptics and screen readers need native verification.</Text></View>;
}
