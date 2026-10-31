import { Link } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Platform, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Example from '../../../packages/ui/src/components/venom-button/Example';
export default function VenomScreen() {
  const inset = useSafeAreaInsets();
  return <View style={{ flex: 1, backgroundColor: '#f6f8f4', paddingTop: inset.top + 24, paddingBottom: inset.bottom + 16 }}><Link href="/" style={{ marginHorizontal: 24, color: '#31533e' }}>← Preview Rail</Link><View style={{ flex: 1, justifyContent: 'center' }}><Example onFeedback={(event) => { if (Platform.OS === 'web') return; void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); }} /></View><Text style={{ padding: 24, color: '#4b6053', fontSize: 12 }}>Skia and PanResponder. Touch near the pill: tendrils reach, grab and snap back. Tap the pill to press. Haptics and screen readers need native verification.</Text></View>;
}
