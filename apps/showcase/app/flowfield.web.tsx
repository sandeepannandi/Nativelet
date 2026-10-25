import { useSyncExternalStore } from 'react';
import { Link } from 'expo-router';
import { Text, View } from 'react-native';
import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
const canvasKit = 'https://cdn.jsdelivr.net/npm/canvaskit-wasm@0.41.0/bin/full/canvaskit.wasm';
export default function FlowFieldScreen() {
  const browser = useSyncExternalStore(() => () => {}, () => true, () => false);
  return <View style={{ flex: 1, backgroundColor: '#04060d', paddingTop: 48, paddingBottom: 16 }}><Link href="/" style={{ marginHorizontal: 24, color: '#7f9cf5' }}>← Preview Rail</Link><View style={{ flex: 1, justifyContent: 'center' }}>{browser ? <WithSkiaWeb opts={{ locateFile: () => canvasKit }} getComponent={() => import('../../../packages/ui/src/components/flow-field/Example')} fallback={<Text style={{ textAlign: 'center', color: '#5d6f9e' }}>Loading Skia…</Text>} /> : null}</View><Text style={{ padding: 24, color: '#5d6f9e', fontSize: 12 }}>Skia (CanvasKit) on web. Not yet tested on a device.</Text></View>;
}
