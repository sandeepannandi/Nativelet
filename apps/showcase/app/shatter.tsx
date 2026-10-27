import { Link } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Platform, Text, View } from 'react-native';
import { createWorld, fillMesh, stepWorld } from '../../../packages/ui/src/components/glass-shatter/shatterMath';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Example from '../../../packages/ui/src/components/glass-shatter/Example';
export default function ShatterScreen() {
  const inset = useSafeAreaInsets();
  // Hermes timing probe for the CI log: the same ~360-shard simulation, stepped
  // at 60 fps on this device's JS engine. It is a cost estimate, not a frame rate.
  useEffect(() => {
    const t = setTimeout(() => {
      const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const w = createWorld({ width: 340, height: 460, hitX: 170, hitY: 180, seed: 5, target: 360 });
      const sim: number[] = [];
      const mesh: number[] = [];
      for (let i = 0; i < 90; i++) {
        const a = now(); stepWorld(w, 1 / 60); const b = now(); fillMesh(w, 2); const c = now();
        sim.push(b - a); mesh.push(c - b);
      }
      const avg = (v: number[]) => v.reduce((x, y) => x + y, 0) / v.length;
      console.log(`SHATTER_BENCH shards=${w.bodies.length} frames=90 sim_avg_ms=${avg(sim).toFixed(2)} sim_worst_ms=${Math.max(...sim).toFixed(2)} mesh_avg_ms=${avg(mesh).toFixed(2)} mesh_worst_ms=${Math.max(...mesh).toFixed(2)} budget_ms=16.67`);
    }, 2000);
    return () => clearTimeout(t);
  }, []);
  return <View style={{ flex: 1, backgroundColor: '#dfe5ee', paddingTop: inset.top + 24, paddingBottom: inset.bottom + 16 }}><Link href="/" style={{ marginHorizontal: 24, color: '#1f3a5f' }}>← Preview Rail</Link><View style={{ flex: 1, justifyContent: 'center' }}><Example diagnostics onFeedback={() => { if (Platform.OS === 'web') return; void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); }} /></View><Text style={{ padding: 24, color: '#7a879c', fontSize: 12 }}>Skia and Reanimated. Not yet tested on a physical device. Haptics and screen readers need native verification.</Text></View>;
}
