import { useSyncExternalStore } from 'react';
import { Link } from 'expo-router';
import { Text, View } from 'react-native';
import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
// Skia on web loads CanvasKit (WebAssembly). Keep the version in step with canvaskit-wasm in the lockfile.
const canvasKit = 'https://cdn.jsdelivr.net/npm/canvaskit-wasm@0.41.0/bin/full/canvaskit.wasm';
export default function WatchScreen() {
  // Static export renders in Node, where CanvasKit must not load. Mount Skia in the browser only.
  const browser = useSyncExternalStore(() => () => {}, () => true, () => false);
  return <View style={{ flex: 1, backgroundColor: '#0b0b10', paddingTop: 48, paddingBottom: 16 }}><Link href="/" style={{ marginHorizontal: 24, color: '#8a93a6' }}>← Nativelet</Link><View style={{ flex: 1, justifyContent: 'center' }}>{browser ? <WithSkiaWeb opts={{ locateFile: () => canvasKit }} getComponent={() => import('../../../packages/ui/src/components/mechanical-watch/Example')} fallback={<Text style={{ textAlign: 'center', color: '#6b7488' }}>Loading Skia…</Text>} /> : null}</View><Text style={{ padding: 24, color: '#6b7488', fontSize: 12 }}>Skia (CanvasKit) on web. Not yet tested on a device.</Text></View>;
}
