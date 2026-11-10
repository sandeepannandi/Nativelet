// Product regression: use the showcase's real Expo/worklets transform, then run
// its generated functions and isolated closure code. Not an Android runtime test.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../../../..');
const modules=path.join(root,'apps/showcase/node_modules');
const babel=require(path.join(modules,'@babel/core'));
const preset=require.resolve(path.join(modules,'babel-preset-expo'));
const libs={};
for(const name of ['gyroMath','gyroControl']){
 const file=path.join(__dirname,name+'.ts');
 const {code}=babel.transformSync(fs.readFileSync(file,'utf8'),{filename:file,presets:[[preset,{jsxRuntime:'automatic'}]],babelrc:false,configFile:false});
 const exports={};vm.runInNewContext(code,{exports,global,require:name=>{if(name==='./gyroMath')return libs.gyroMath;throw Error('Unexpected import '+name);}});libs[name]=exports;
}
function isolated(original){
 const cache=new Map();
 function copy(value){
  if(typeof value!=='function')return value;
  assert(value.__initData,'captured function must be a worklet: '+value.name);
  if(cache.has(value))return cache.get(value);
  const compiled=vm.runInNewContext('('+value.__initData.code+')'),holder={__closure:{}};
  const fn=(...args)=>compiled.apply(holder,args);cache.set(value,fn);
  for(const [key,binding] of Object.entries(value.__closure||{}))holder.__closure[key]=copy(binding);
  return fn;
 }
 return copy(original);
}
const m=libs.gyroMath,c=libs.gyroControl;
assert(m.createGyro.__initData,'Expo must transform this test');
const expected=m.createGyro(),actual=isolated(m.createGyro)();
assert.equal(JSON.stringify(actual.v),JSON.stringify(expected.v));
const drive=isolated(c.driveGyro);let normalSeen=0,isolatedSeen=0;
for(let i=0;i<600;i++){
 const input={...c.GYRO_IDLE,active:i>90&&i<200,targetYaw:1,targetTilt:1.2,impulseId:i>20?1:0,spinImpulse:.003};
 normalSeen=c.driveGyro(expected,m.GYRO_DEFAULTS,input,1/60,normalSeen);
 isolatedSeen=drive(actual,m.GYRO_DEFAULTS,input,1/60,isolatedSeen);
}
assert(actual.v.every(Number.isFinite));
const maximumStateDifference=Math.max(...actual.v.map((x,i)=>Math.abs(x-expected.v[i])));
assert.equal(maximumStateDifference,0);
console.log(JSON.stringify({expoTransform:true,defaultConstructor:'PASS',transformedController:'PASS',isolatedClosure10s:'PASS',maximumStateDifference,scope:'generated JavaScript and closure replay, not native crash clearance'},null,2));
