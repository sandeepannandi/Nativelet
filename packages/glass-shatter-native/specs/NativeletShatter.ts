import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';
import type { UnsafeObject } from 'react-native/Libraries/Types/CodegenTypes';
export interface Spec extends TurboModule {
  install(runtimeHolder: UnsafeObject, schedulerHolder: UnsafeObject): boolean;
}
export default TurboModuleRegistry.get<Spec>('NativeletShatter');
