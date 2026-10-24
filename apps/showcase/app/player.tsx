import { Link } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Platform, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Example from '../../../packages/ui/src/components/mini-player/Example';
export default function PlayerScreen() {
  const inset = useSafeAreaInsets();
  return <View style={{ flex: 1, backgroundColor: '#f3f6ee', paddingTop: inset.top + 8 }}>
    <View style={{ paddingHorizontal: 24, paddingBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Link href="/" style={{ color: '#31513b' }}>← Preview Rail</Link>
      <Text style={{ color: '#637e6b', fontSize: 12 }}>Mini player</Text>
    </View>
    <View style={{ flex: 1 }}>
      <Example onFeedback={() => { if (Platform.OS === 'web') return; void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); }} />
    </View>
    <Text style={{ paddingHorizontal: 24, paddingBottom: inset.bottom + 10, color: '#637e6b', fontSize: 12 }}>Reanimated, Skia and PanResponder. Simulated playback: no audio. Haptics and screen readers need native verification.</Text>
  </View>;
}
