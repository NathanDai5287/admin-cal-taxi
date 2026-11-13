import test from 'node:test';
import assert from 'node:assert/strict';
import { ProcessingMonitor } from '../lib/accreditation/processing-monitor.ts';
const flush=()=>new Promise(setImmediate);
const active=id=>({id,active:true,ingestion_status:'running'});

test('idle and terminal documents have no recurring requests',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date']});
 let calls=0;const m=new ProcessingMonitor(async()=>{calls++;return[];});
 const stop=m.subscribe(['a','b'],()=>{});
 m.seed([{id:'a',active:false},{id:'b',active:false,ingestion_status:'complete'}]);
 t.mock.timers.tick(120000);await flush();assert.equal(calls,0);stop();
});
test('20 active rows and duplicate subscribers share one batch; completion stops polling',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date']});
 const ids=Array.from({length:20},(_,i)=>String(i));let calls=[];
 const m=new ProcessingMonitor(async ids=>{calls.push(ids);return ids.map(id=>({id,active:false,ingestion_status:'complete'}));});
 m.seed(ids.map(active));const stop=m.subscribe(ids,()=>{});const stop2=m.subscribe(ids,()=>{});
 t.mock.timers.tick(15000);await flush();assert.equal(calls.length,1);assert.equal(calls[0].length,20);
 t.mock.timers.tick(120000);await flush();assert.equal(calls.length,1);stop();stop2();
});
test('slow requests do not overlap and late responses cannot restore deleted or newer state',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date']});
 let resolve;let calls=0;const m=new ProcessingMonitor(async()=>{calls++;return new Promise(r=>resolve=r);});
 m.seed([active('a')]);const stop=m.subscribe(['a'],()=>{});
 t.mock.timers.tick(15000);await flush();t.mock.timers.tick(120000);await flush();assert.equal(calls,1);
 m.seed([{id:'a',active:false}]);resolve([active('a')]);await flush();assert.equal(m.rows.a.active,false);
 t.mock.timers.tick(120000);await flush();assert.equal(calls,1);stop();
});
test('hidden or offline monitoring pauses, resumes once, and failures back off',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date']});
 let visible=false,calls=0;
 const m=new ProcessingMonitor(async()=>{calls++;throw new Error('offline');},()=>visible);
 m.seed([active('a')]);const stop=m.subscribe(['a'],()=>{});t.mock.timers.tick(90000);await flush();assert.equal(calls,0);
 visible=true;m.visibilityChanged();t.mock.timers.tick(0);await flush();assert.equal(calls,1);assert.equal(m.rows.a.active,true);
 t.mock.timers.tick(29999);await flush();assert.equal(calls,1);t.mock.timers.tick(1);await flush();assert.equal(calls,2);
 t.mock.timers.tick(60000);await flush();assert.equal(calls,3);stop();
});
test('waiting jobs sleep until retry time, manual refresh discovers newly queued work',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date']});
 let calls=0;const m=new ProcessingMonitor(async ids=>{calls++;return ids.map(active);});
 m.seed([{id:'a',active:true,ingestion_status:'waiting',ingestion_job:{id:'j',status:'waiting',stage:'embedding',next_retry_at:new Date(120000).toISOString()}},{id:'b',active:false}]);
 const stop=m.subscribe(['a','b'],()=>{});t.mock.timers.tick(119999);await flush();assert.equal(calls,0);
 m.refresh(['b']);t.mock.timers.tick(0);await flush();assert.equal(calls,1);assert.equal(m.rows.b.active,true);stop();
});

test('large queues split into bounded batches and missing jobs stop monitoring',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date']});
 const calls=[];const ids=Array.from({length:25},(_,i)=>String(i));
 const m=new ProcessingMonitor(async ids=>{calls.push(ids);return [];});
 m.seed(ids.map(active));const stop=m.subscribe(ids,()=>{});
 t.mock.timers.tick(15000);await flush();t.mock.timers.tick(0);await flush();
 assert.deepEqual(calls.map(ids=>ids.length),[20,5]);
 t.mock.timers.tick(120000);await flush();assert.equal(calls.length,2);stop();
});

test('an explicit resume during a slow request survives its stale result',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date']});
 const pending=[];let calls=0;const m=new ProcessingMonitor(async()=>{calls++;return new Promise(resolve=>pending.push(resolve));});
 m.seed([active('a')]);const stop=m.subscribe(['a'],()=>{});
 t.mock.timers.tick(15000);await flush();m.refresh(['a']);
 pending.shift()([{id:'a',active:false,ingestion_status:'paused'}]);await flush();
 t.mock.timers.tick(0);await flush();assert.equal(calls,2);assert.equal(m.rows.a.active,true);
 pending.shift()([{id:'a',active:false,ingestion_status:'cancelled'}]);await flush();
 t.mock.timers.tick(120000);await flush();assert.equal(calls,2);stop();
});
