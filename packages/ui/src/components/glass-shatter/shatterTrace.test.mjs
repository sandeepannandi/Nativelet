import {test} from 'node:test';
import assert from 'node:assert/strict';
import {traceShatterSection} from './shatterTrace.ts';

test('production default needs no tracing globals; diagnostic missing globals fails closed',()=>{
  delete globalThis._beginSection;delete globalThis._endSection;
  assert.equal(traceShatterSection(false,'unused',()=>7),7);
  let bodyRan=false;
  assert.throws(()=>traceShatterSection(true,'required',()=>{bodyRan=true;}),/SHATTER_TRACE_UNAVAILABLE/);
  assert.equal(bodyRan,false);
  globalThis._beginSection=()=>{};
  try {assert.throws(()=>traceShatterSection(true,'required',()=>{}),/SHATTER_TRACE_UNAVAILABLE/);}finally{delete globalThis._beginSection;}
});
test('sync nesting and throw balance through actual try/finally',()=>{
  const events=[];
  globalThis._beginSection=n=>events.push('begin '+n);globalThis._endSection=()=>events.push('end');
  try{
    assert.equal(traceShatterSection(true,'outer',()=>traceShatterSection(true,'inner',()=>9)),9);
    assert.deepEqual(events,['begin outer','begin inner','end','end']);events.length=0;
    assert.throws(()=>traceShatterSection(true,'throws',()=>{throw Error('body');}),/body/);
    assert.deepEqual(events,['begin throws','end']);
  }finally{delete globalThis._beginSection;delete globalThis._endSection;}
});
