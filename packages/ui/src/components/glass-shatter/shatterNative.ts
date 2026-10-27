import { Platform, TurboModuleRegistry, type TurboModule } from 'react-native';
import { getUIRuntimeHolder, getUISchedulerHolder, scheduleOnRN } from 'react-native-worklets';
import { runOnUI } from 'react-native-reanimated';
import { stepWorld, type World } from './shatterMath';
interface Installer extends TurboModule { install(runtime: object, scheduler: object): boolean }
type Core = { create(world: World): number; advance(id: number, dt: number, trig: (angles: ArrayBuffer) => ArrayBuffer): void; render(id: number, world: World): void; dispose(id: number): void };
type NativeGlobal = typeof globalThis & { __nativeletShatter?: Core; __nativeletShatterReady?: boolean; __nativeletShatterInstallError?: string };
export const NATIVE_SHATTER = Platform.OS !== 'web';
export const NATIVE_REQUIRED = 'Glass Shatter needs the Nativelet custom native build. Expo Go cannot run this component.';
export async function prepareNativeShatter(): Promise<void> {
  if (!NATIVE_SHATTER) return;
  const module = TurboModuleRegistry.get<Installer>('NativeletShatter');
  if (!module) throw new Error(NATIVE_REQUIRED);
  if (!module.install(getUIRuntimeHolder(), getUISchedulerHolder())) throw new Error("Glass Shatter native installation was rejected.");
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => { if (settled) return; settled = true; clearTimeout(timeout); clearInterval(poll); if (error) reject(error); else resolve(); };
    const report = (ready: boolean, error?: string) => { if (error) finish(new Error(error)); else if (ready) finish(); };
    const check = () => {
      // Only a report function is captured, never a native host function.
      try { runOnUI(() => { 'worklet'; const g=globalThis as NativeGlobal; scheduleOnRN(report, g.__nativeletShatterReady === true, g.__nativeletShatterInstallError); })(); } catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
    };
    const timeout = setTimeout(() => finish(new Error('Glass Shatter native UI installation timed out.')), 5000);
    const poll = setInterval(check, 50);
    check();
  });
}
function core(): Core { 'worklet'; const g=globalThis as NativeGlobal; if (!g.__nativeletShatterReady || !g.__nativeletShatter) throw new Error('Glass Shatter native UI runtime is not ready.'); return g.__nativeletShatter; }
function engineTrig(input: ArrayBuffer): ArrayBuffer { 'worklet'; const a=new Float64Array(input);const out=new Float64Array(a.length*2);for(let i=0;i<a.length;i++){out[i*2]=Math.cos(a[i]);out[i*2+1]=Math.sin(a[i]);}return out.buffer as ArrayBuffer; }
export type NativeWorld = World & { nativeHandle?: number };
export function attachNative(w: NativeWorld): void { 'worklet'; if (NATIVE_SHATTER) w.nativeHandle=core().create(w); }
export function disposeNative(w: NativeWorld | null | undefined): void { 'worklet'; if(NATIVE_SHATTER && w?.nativeHandle!==undefined){core().dispose(w.nativeHandle);delete w.nativeHandle;} }
export function advanceNative(w: NativeWorld,dt: number): void { 'worklet'; if(!NATIVE_SHATTER){stepWorld(w,dt);return;}if(w.nativeHandle===undefined)throw new Error('Glass Shatter world has no native handle.');core().advance(w.nativeHandle,dt,engineTrig);core().render(w.nativeHandle,w); }
