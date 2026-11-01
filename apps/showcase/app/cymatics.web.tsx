import { useSyncExternalStore } from 'react';
import { Link } from 'expo-router';
import { Text, View } from 'react-native';
import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
const canvasKit = 'https://cdn.jsdelivr.net/npm/canvaskit-wasm@0.41.0/bin/full/canvaskit.wasm';
export default function CymaticsScreen() {
  const browser = useSyncExternalStore(() => () => {}, () => true, () => false);
  return <View style={{ flex: 1, backgroundColor: '#05070c', paddingTop: 48, paddingBottom: 16 }}><Link href="/" style={{ marginHorizontal: 24, color: '#c9a96f' }}>← Preview Rail</Link><View style={{ flex: 1, justifyContent: 'center' }}>{browser ? <WithSkiaWeb opts={{ locateFile: () => canvasKit }} getComponent={() => import('../../../packages/ui/src/components/cymatics/Example')} fallback={<Text style={{ textAlign: 'center', color: '#7a6a4d' }}>Loading Skia…</Text>} /> : null}</View><Text style={{ padding: 24, color: '#7a6a4d', fontSize: 12 }}>Skia (CanvasKit) on web. Not yet tested on a device.</Text></View>;
}
