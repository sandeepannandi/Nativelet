import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { traceShatterSection } from './shatterTrace.ts';
import { allShardsGone, createWorld, stepWorld, fillMesh } from './shatterMath.ts';

test('terminal is explicit all-gone, not sleeping, empty world or count90', () => {
  assert.equal(allShardsGone({ bodies: [] }), false);
  assert.equal(allShardsGone({ bodies: [{gone:false, asleep:true}] }), false);
  assert.equal(allShardsGone({ bodies: [{gone:true}, {gone:false}] }), false);
  assert.equal(allShardsGone({ bodies: [{gone:true}, {gone:true}] }), true);
});

test('component guard is opt-in, follows inputs, and leaves final invalidation + keepalive', () => {
  const src = fs.readFileSync(new URL('./GlassShatter.tsx', import.meta.url), 'utf8');
  assert.match(src, /EXPO_PUBLIC_SHATTER_TAIL === "physics-mesh"/);
  assert.match(src, /if \(diagnostics && QUIESCE_PHYSICS_MESH && terminal.value\) return;/);
  assert.ok(src.indexOf('const evs = inputs.value') < src.indexOf('&& terminal.value) return'));
  assert.equal((src.match(/terminal.value = false;/g) || []).length, 2, 'hit and reset each rearm');
  assert.ok(src.indexOf('frame.value = frame.value + 1;') < src.indexOf('if (QUIESCE_PHYSICS_MESH && reachedTerminal) terminal.value = true;'));
  assert.match(src, /reachedTerminal = allShardsGone\(w\)/);
  assert.match(src, /\{!reduce \? <CanvasKeepAlive \/> : null\}/);
});

test('A/B trajectories and final parked mesh match until all-gone, reset and second hit rearm', () => {
  for (const seed of [5, 7919, 23757]) {
    const args={width:340,height:460,hitX:170,hitY:180,seed,target:360};
    let baseline=createWorld(args), variant=createWorld(args), terminal=false, renders=0;
    for (let f=0; f<900 && !terminal; f++) {
      stepWorld(baseline, 1/60); stepWorld(variant, 1/60);
      fillMesh(baseline,2); fillMesh(variant,2); renders++;
      assert.deepEqual(variant, baseline, `same active/final frame seed${seed} f${f}`);
      terminal=allShardsGone(variant);
    }
    assert.equal(terminal,true,`all gone seed${seed}`);
    assert.ok(variant.mxy.every(v=>v.x===-9999 && v.y===-9999), 'last invalidation parks every vertex');
    const frozen=JSON.stringify(variant); const finalRenders=renders;
    for(let f=0;f<120;f++) { if(!terminal) {stepWorld(variant,1/60);fillMesh(variant,2);renders++;} }
    assert.equal(JSON.stringify(variant),frozen); assert.equal(renders,finalRenders);
    // Reset must be consumed even while terminal. A fresh hit supplies a new world.
    variant=null;terminal=false;
    assert.equal(variant,null);
    variant=createWorld({...args,seed:seed+1});terminal=false;
    stepWorld(variant,1/60);fillMesh(variant,2);
    assert.equal(terminal,false); assert.equal(allShardsGone(variant),false);
    assert.ok(variant.mxy.some(v=>v.x!==-9999));
  }
});

test('actual component callback consumes terminal/reset/hit; baseline and reduce-motion stay separate', async () => {
  const { createRequire } = await import('node:module');
  const { default: vm } = await import('node:vm');
  const require = createRequire(import.meta.url);
  const ts = require('../../../../../apps/showcase/node_modules/typescript');
  const code=ts.transpileModule(fs.readFileSync(new URL('./GlassShatter.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
  function mount(mode,diagnostics=true,terminalAt=3,trace=false) {
    let callback,steps=0,fills=0,attaches=0,disposes=0;const shared=[],derived=[],worlds=[];
    const react={useEffect(){},useMemo:f=>f(),useRef:v=>({current:v}),useState:v=>[v,()=>{}],createElement:()=>({})};
    react.default=react;
    const path={moveTo(){},lineTo(){},close(){}};
    const canvas={clear(){},drawRect(){}};const paint={setColor(){},dispose(){}};
    const surface={getCanvas:()=>canvas,flush(){},makeImageSnapshot:()=>({makeNonTextureImage:()=>({dispose(){}}),dispose(){}}),dispose(){}};
    const math={createWorld:()=>{const w={bodies:[{gone:false,local:[]}],ticks:0,mxy:[],mtex:[],mtint:[],mstart:[0]};worlds.push(w);return w;},stepWorld:w=>{steps++;w.ticks++;w.bodies[0].gone=w.ticks>=terminalAt;},allShardsGone,fillMesh:w=>{fills++;w.mxy=[{x:w.bodies[0].gone?-9999:0,y:0}];}};
    const native={NATIVE_SHATTER:true,prepareNativeShatter:async()=>{},attachNative:w=>{attaches++;w.nativeHandle=attaches;},disposeNative:w=>{if(w?.nativeHandle!==undefined){disposes++;delete w.nativeHandle;}},advanceNative:(w,dt)=>{assert.ok(w.nativeHandle);math.stepWorld(w,dt);}};
    const mocks={'./shatterNative':native,'./ShatterUnavailable':{ShatterUnavailable:()=>({})},react,'react-native':{AccessibilityInfo:{},PanResponder:{create:()=>({panHandlers:{}})}},'@shopify/react-native-skia':{FilterMode:{Linear:1},MipmapMode:{Linear:1,None:0},vec:()=>({}),Skia:{Surface:{MakeOffscreen:()=>surface},Paint:()=>paint,Color:v=>v,XYWHRect(){},Path:{Make:()=>path}}},'react-native-reanimated':{runOnJS:f=>f,runOnUI:f=>f,useSharedValue:v=>{const o={value:v};shared.push(o);return o;},useDerivedValue:f=>{derived.push(f);return {value:{xy:[],tex:[],tint:[],path}};},useFrameCallback:f=>{callback=f;}},'./shatterMath':math,'./shatterTrace':{traceShatterSection}};
    const context={exports:{},require:n=>mocks[n],process:{env:{EXPO_PUBLIC_SHATTER_TAIL:mode,EXPO_PUBLIC_SHATTER_TRACE:trace?"1":"0"}},performance,console:{log(){}},globalThis:{}};
    vm.runInNewContext(code,context);context.exports.GlassShatter({image:{},diagnostics});
    const [perf,broken,frame,terminal,terminalObserved,finalMeshObserved,inputs,seen,slow,reduce]=shared;
    const tick=()=>{const prev=frame.value;callback({timeSincePreviousFrame:16.7});if(frame.value!==prev)derived[1]();};
    const event=(id,k)=>{inputs.value=[{id,k,x:170,y:180}];};
    return {shared,perf,frame,terminal,reduce,event,tick,worlds,get attaches(){return attaches;},get disposes(){return disposes;},get steps(){return steps;},get fills(){return fills;}};
  }
  const markerEvents=[];
  globalThis._beginSection=n=>markerEvents.push(n);
  globalThis._endSection=()=>{};
  try {
    for (const mode of ['baseline','physics-mesh']) {
      markerEvents.length=0;
      const m=mount(mode,true,3,true);m.event(1,0);
      for(let i=0;i<5;i++)m.tick();
      for(const name of ['createWorld','stepWorld','fillMesh','path','copies','allGone','finalMeshParked']) assert.ok(markerEvents.includes('SHATTER/'+name),mode+name);
      assert.equal(markerEvents.filter(n=>n==='SHATTER/allGone').length,1);
      assert.equal(markerEvents.filter(n=>n==='SHATTER/finalMeshParked').length,1);
      assert.equal(m.terminal.value,mode==='physics-mesh');
      m.event(2,1);m.tick();assert.ok(markerEvents.includes('SHATTER/reset'));
      m.event(3,0);for(let i=0;i<3;i++)m.tick();
      assert.equal(markerEvents.filter(n=>n==='SHATTER/allGone').length,2,'next fracture rearmed markers');
    }
  } finally {delete globalThis._beginSection;delete globalThis._endSection;}
  const b=mount('baseline'),v=mount('physics-mesh');
  b.event(1,0);v.event(1,0);
  for(let i=0;i<3;i++){b.tick();v.tick();}
  assert.equal(v.terminal.value,true);assert.equal(v.frame.value,3);assert.equal(v.fills,3,'terminal mesh ran once');
  assert.equal(v.worlds[0].mxy[0].x,-9999);
  for(let i=0;i<5;i++){b.tick();v.tick();}
  assert.equal(b.steps,8);assert.equal(v.steps,3);assert.equal(v.fills,3);
  v.event(2,1);v.tick();assert.equal(v.terminal.value,false,'actual reset consumed');assert.equal(v.disposes,1,'reset disposes native handle');
  v.event(3,0);v.tick();assert.equal(v.steps,4);assert.equal(v.worlds.length,2);assert.equal(v.terminal.value,false);assert.equal(v.attaches,2,'second hit attaches new native world');
  const off=mount('physics-mesh',false);off.event(1,0);for(let i=0;i<5;i++)off.tick();assert.equal(off.steps,5,'diagnostics off unchanged');
  const reduced=mount('physics-mesh');reduced.reduce.value=true;reduced.event(1,0);reduced.tick();assert.equal(reduced.steps,0);assert.equal(reduced.terminal.value,false);
  const report90=mount('physics-mesh',true,999);report90.event(1,0);for(let i=0;i<95;i++)report90.tick();assert.equal(report90.perf.value.reported,true);assert.equal(report90.terminal.value,false);assert.equal(report90.steps,95,'90-frame report never terminates');
});
