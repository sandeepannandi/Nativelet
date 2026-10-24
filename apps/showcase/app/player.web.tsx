import { useSyncExternalStore } from 'react';
import { Link } from 'expo-router';
import { Text, View } from 'react-native';
import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
const canvasKit = 'https://cdn.jsdelivr.net/npm/canvaskit-wasm@0.41.0/bin/full/canvaskit.wasm';
export default function PlayerScreen() {
  const browser = useSyncExternalStore(() => () => {}, () => true, () => false);
  return <View style={{ flex: 1, backgroundColor: '#f3f6ee', paddingTop: 48 }}>
    <View style={{ paddingHorizontal: 24, paddingBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Link href="/" style={{ marginHorizontal: 0, color: '#31513b' }}>← Preview Rail</Link>
      <Text style={{ color: '#637e6b', fontSize: 12 }}>Mini player</Text>
    </View>
    <View style={{ flex: 1 }}>{browser ? <WithSkiaWeb opts={{ locateFile: () => canvasKit }} getComponent={() => import('../../../packages/ui/src/components/mini-player/Example')} fallback={<Text style={{ textAlign: 'center', color: '#637e6b' }}>Loading Skia…</Text>} /> : null}</View>
    <Text style={{ paddingHorizontal: 24, paddingBottom: 16, color: '#637e6b', fontSize: 12 }}>Skia (CanvasKit) on web. Not yet tested on a device.</Text>
  </View>;
}
