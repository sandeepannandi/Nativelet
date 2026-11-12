// Local regression for the fail-closed telemetry verifier: drives the REAL
// babel-transformed gyroMath/gyroControl through a scripted frame sequence,
// emits '[gyro-test]' logcat fixtures in the component's exact schema, then
// runs scripts/gyro-telemetry-verify.py against positive and negative cases.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const modules=path.join(root,'apps/showcase/node_modules');
const babel=require(path.join(modules,'@babel/core'));
const preset=require.resolve(path.join(modules,'babel-preset-expo'));
const gyroDir=path.join(root,'packages/ui/src/components/gyroscope');
const libs={};
for(const name of ['gyroMath','gyroControl']){
 const file=path.join(gyroDir,name+'.ts');
 const {code}=babel.transformSync(fs.readFileSync(file,'utf8'),{filename:file,presets:[[preset,{jsxRuntime:'automatic'}]],babelrc:false,configFile:false});
 const exports={};vm.runInNewContext(code,{exports,global,require:n=>{if(n==='./gyroMath')return libs.gyroMath;throw Error('Unexpected import '+n);}});libs[name]=exports;
}
const m=libs.gyroMath,c=libs.gyroControl;

function buildFixture(){
 const out=[];
 let wallT=1000000,frame=0,seenReset=0,slow=false,reduce=false;
 let st=m.createGyro(),input={...c.GYRO_IDLE},lastImpulse=0;
 const emit=e=>out.push("I ReactNativeJS: '[gyro-test]', '"+JSON.stringify(e)+"'");
 const snap=(dtReq,stepMs)=>emit({kind:'snap',wallT,dtReq,stepMs,simT:st.t,dropped:st.droppedTime,acc:st.acc,v:st.v.slice(),input:{...input},seenImpulse:lastImpulse,seenReset,slow,reduce,frame});
 const runFrame=dtRaw=>{
  const dtReq=dtRaw*(slow?.25:1);
  const t0=Date.now();
  if(!reduce)lastImpulse=c.driveGyro(st,m.GYRO_DEFAULTS,input,dtReq,lastImpulse);
  wallT+=dtRaw*1000;frame++;
  snap(dtReq,reduce?0:Math.max(0.01,Date.now()-t0));
 };
 emit({kind:'bridge',wallT});
 // Idle frames (free precession under gravity imbalance), saturated cadence.
 for(let i=0;i<6;i++)runFrame(4);
 // Slow toggle, then a leftward flick (grab -> release with negative j).
 slow=true;runFrame(4);
 emit({kind:'grab',wallT,mode:'spin',a:st.v[0],b:st.v[1]});
 input={...input,active:false,spinImpulse:-0.006,impulseId:1};
 emit({kind:'spin',wallT,j:-0.006,impulseId:1});
 for(let i=0;i<3;i++)runFrame(4);
 // Frame mode: PD grip toward pointer-set targets.
 emit({kind:'grab',wallT,mode:'frame',a:st.v[0],b:st.v[1]});
 input={...input,active:true,targetYaw:st.v[0]+1.56,targetTilt:st.v[1]+0.96};
 for(let i=0;i<4;i++)runFrame(4);
 input={...input,active:false};
 runFrame(4);
 // Reset: sim back to documented initial (spin 45), slow persists by design.
 emit({kind:'reset',wallT});
 st=m.createGyro(m.GYRO_DEFAULTS,45);input={...c.GYRO_IDLE};lastImpulse=0;seenReset=1;
 for(let i=0;i<3;i++)runFrame(4);
 slow=false;for(let i=0;i<2;i++)runFrame(4);
 // Reduced-motion leg: relaunch marker, then frozen sim snapshots.
 out.push('I gyrotest  : LEG-RM-BEGIN');
 wallT+=30000;reduce=true;slow=false;
 st=m.createGyro(m.GYRO_DEFAULTS,0);input={...c.GYRO_IDLE};lastImpulse=0;
 emit({kind:'bridge',wallT});
 for(let i=0;i<4;i++)runFrame(4);
 return out.join('\n')+'\n';
}

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gyro-verify-'));
const verifier=path.join(root,'scripts/gyro-telemetry-verify.py');
function run(name,lines){
 const file=path.join(dir,name+'.log');
 fs.writeFileSync(file,lines);
 let status=0,stdout='';
 try{stdout=execFileSync('python3',[verifier,file],{encoding:'utf8'});}
 catch(e){status=e.status;stdout=(e.stdout||'')+(e.stderr||'');}
 return {status,stdout};
}
const positive=buildFixture();
const results=[];
function expect(name,{status,stdout},wantFail,frag){
 const verdict=/^VERIFY (PASS|FAIL)/m.exec(stdout);
 const ok=(wantFail?status!==0&&verdict&&verdict[1]==='FAIL':status===0&&verdict&&verdict[1]==='PASS')&&stdout.includes(frag);
 results.push(name+':'+(ok?'PASS':'FAIL'));
 if(!ok){console.log('--- '+name+' verifier output ---\n'+stdout);throw new Error(name+' expectation failed');}
}
expect('positive',run('positive',positive),false,'VERIFY PASS');
const corrupted=positive.split('\n').map((ln,i,a)=>{
 if(ln.includes('"kind":"snap"')&&a.slice(0,i).filter(x=>x.includes('"kind":"snap"')).length===6)
  return ln.replace(/"v":\[/,'"v":[0.05,');
 return ln;
}).join('\n');
expect('corrupted-state',run('corrupted',corrupted),true,'step-consistency FAIL');
const noReset=positive.split('\n').filter(ln=>!ln.includes('"kind":"reset"')).join('\n');
expect('missing-reset-event',run('noreset',noReset),true,'event-sequence FAIL');
const rmDriftLines=positive.split('\n');
for(let i=rmDriftLines.length-1;i>=0;i--){
 if(rmDriftLines[i].includes('"kind":"snap"')&&rmDriftLines[i].includes('"reduce":true')){rmDriftLines[i]=rmDriftLines[i].replace('"simT":0','"simT":0.1');break;}
}
const rmDrift=rmDriftLines.join('\n');
expect('rm-not-frozen',run('rmdrift',rmDrift),true,'rm-leg FAIL');
console.log(JSON.stringify({fixtures:results,scope:'real transformed model vs independent python port; negative fixtures must FAIL'},null,2));
