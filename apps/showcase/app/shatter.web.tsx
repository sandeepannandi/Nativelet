import { useSyncExternalStore } from 'react';
import { Link } from 'expo-router';
import { Text, View } from 'react-native';
import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
const canvasKit = 'https://cdn.jsdelivr.net/npm/canvaskit-wasm@0.41.0/bin/full/canvaskit.wasm';
export default function ShatterScreen() {
  const browser = useSyncExternalStore(() => () => {}, () => true, () => false);
  return <View style={{ flex: 1, backgroundColor: '#dfe5ee', paddingTop: 48, paddingBottom: 16 }}><Link href="/" style={{ marginHorizontal: 24, color: '#1f3a5f' }}>← Preview Rail</Link><View style={{ flex: 1, justifyContent: 'center' }}>{browser ? <WithSkiaWeb opts={{ locateFile: () => canvasKit }} getComponent={() => import('../../../packages/ui/src/components/glass-shatter/Example')} fallback={<Text style={{ textAlign: 'center', color: '#7a879c' }}>Loading Skia…</Text>} /> : null}</View><Text style={{ padding: 24, color: '#8a8374', fontSize: 12 }}>Skia (CanvasKit) on web. Not yet tested on a device.</Text></View>;
}
