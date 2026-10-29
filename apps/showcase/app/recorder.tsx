import { Link } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Platform, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Example from '../../../packages/ui/src/components/voice-recorder/Example';
export default function VoiceRecorderScreen() {
  const inset = useSafeAreaInsets();
  return <View style={{ flex: 1, backgroundColor: '#f6f8f4', paddingTop: inset.top + 24, paddingBottom: inset.bottom + 16 }}><Link href="/" style={{ marginHorizontal: 24, color: '#31533e' }}>← Preview Rail</Link><View style={{ flex: 1, justifyContent: 'center' }}><Example onFeedback={() => { if (Platform.OS === 'web') return; void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); }} /></View><Text style={{ padding: 24, color: '#4b6053', fontSize: 12 }}>Skia and Reanimated. Audio levels are simulated; haptics and screen readers need native verification.</Text></View>;
}
