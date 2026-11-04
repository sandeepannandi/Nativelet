import { useSyncExternalStore } from 'react';
import { Link } from 'expo-router';
import { Text, View } from 'react-native';
import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
// Skia on web loads CanvasKit (WebAssembly). Keep the version in step with canvaskit-wasm in the lockfile.
const canvasKit = 'https://cdn.jsdelivr.net/npm/canvaskit-wasm@0.41.0/bin/full/canvaskit.wasm';
export default function CradleScreen() {
  // Static export renders in Node, where CanvasKit must not load. Mount Skia in the browser only.
  const browser = useSyncExternalStore(() => () => {}, () => true, () => false);
  return <View style={{ flex: 1, backgroundColor: '#f3f6ee', paddingTop: 48, paddingBottom: 16 }}><Link href="/" style={{ marginHorizontal: 24, color: '#31513b' }}>← Nativelet</Link><View style={{ flex: 1, justifyContent: 'center' }}>{browser ? <WithSkiaWeb opts={{ locateFile: () => canvasKit }} getComponent={() => import('../../../packages/ui/src/components/newtons-cradle/Example')} fallback={<Text style={{ textAlign: 'center', color: '#637e6b' }}>Loading Skia…</Text>} /> : null}</View><Text style={{ padding: 24, color: '#637e6b', fontSize: 12 }}>Skia (CanvasKit) on web. Not yet tested on a device.</Text></View>;
}
