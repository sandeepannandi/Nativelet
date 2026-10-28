import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

test('actual TS callback consumes hit/reset/second hit, reduced/slow motion and unmount',()=>{
 const src=fs.readFileSync(new URL('./GlassShatter.tsx',import.meta.url),'utf8');
 const code=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
 const shared=[],derived=[],effects=[],worlds=[],dts=[];let callback,disposed=0;
 const react={useEffect:f=>effects.push(f),useMemo:f=>f(),useRef:v=>({current:v}),useState:v=>[v,()=>{}],createElement:()=>({})};react.default=react;
 const path={moveTo(){},lineTo(){},close(){}};const paint={setColor(){},dispose(){}};
 const surface={getCanvas:()=>({clear(){},drawRect(){}}),flush(){},makeImageSnapshot:()=>({makeNonTextureImage:()=>({dispose(){disposed++;}}),dispose(){}}),dispose(){}};
 const mocks={react,'react-native':{AccessibilityInfo:{isReduceMotionEnabled:()=>Promise.resolve(false),addEventListener:()=>({remove(){}})},PanResponder:{create:()=>({panHandlers:{}})}},'@shopify/react-native-skia':{FilterMode:{Linear:1},MipmapMode:{Linear:1,None:0},vec:()=>({}),Skia:{Surface:{MakeOffscreen:()=>surface},Paint:()=>paint,Color:v=>v,XYWHRect(){},Path:{Make:()=>path}}},'react-native-reanimated':{runOnUI:f=>f,useSharedValue:v=>{const x={value:v};shared.push(x);return x;},useDerivedValue:f=>{derived.push(f);return {value:{xy:[],tex:[],tint:[],path}};},useFrameCallback:f=>callback=f},'./shatterMath':{createWorld:()=>{const w={bodies:[{gone:false,local:[]}],mxy:[],mtex:[],mtint:[],mstart:[0]};worlds.push(w);return w;},stepWorld:(w,dt)=>{dts.push(dt);w.bodies[0].gone=true;},fillMesh(){}}};
 const context={exports:{},require:n=>{assert.ok(mocks[n],n);return mocks[n];},performance,console,globalThis:{}};vm.runInNewContext(code,context);context.exports.GlassShatter({image:{}});
 const cleanup=effects.map(f=>f()).filter(f=>typeof f==='function');
 const [perf,broken,frame,inputs,seen,slow,reduce]=shared;
 const event=(id,k)=>inputs.value=[{id,k,x:170,y:180}];
 const tick=()=>{callback({timeSincePreviousFrame:16.7});derived[0]();derived[1]();};
 event(1,0);tick();assert.equal(worlds.length,1);assert.equal(dts.length,1);tick();assert.equal(worlds.length,1,'event not replayed');
 event(2,1);tick();assert.equal(context.globalThis.__nativeletShatterWorlds[1],null);assert.equal(derived[0]().length,0,'reset indices clear');assert.equal(derived[1]().xy.length,0,'reset mesh clears');
 event(3,0);tick();assert.equal(worlds.length,2,'second hit fresh world');
 reduce.value=true;const before=dts.length;tick();assert.equal(dts.length,before,'reduced motion freezes physics');
 reduce.value=false;slow.value=true;tick();assert.equal(dts.at(-1),.0167*.25,'slow motion dt');
 for(const f of cleanup)f();assert.equal(Object.keys(context.globalThis.__nativeletShatterWorlds).length,0,'unmount removes runtime graph');assert.equal(disposed,1,'ramp disposed');
});
test('showcase does not run automatic synchronous profiling benchmark',()=>{
 const src=fs.readFileSync(new URL('../../../../../apps/showcase/app/shatter.tsx',import.meta.url),'utf8');assert.doesNotMatch(src,/SHATTER_BENCH|<Example diagnostics|stepWorld\(/);
});
