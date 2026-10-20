import {test} from 'node:test';
import assert from 'node:assert/strict';
import {providerSession,LookupLimitError,GOOGLE_MONTHLY_LOOKUP_CAP} from '../src/provider-session.js';
const db=(read:()=>number)=>({query:async()=>({rows:[{used:read()}]})}) as any;
test('normal beta lookups are admitted past the old 500 cap; the project cap still blocks provider spend',async()=>{
 let used=500,calls=0;const request=providerSession(db(()=>++used),async()=>{calls++;return {ok:true}});
 assert.deepEqual(await request('places-a',{},'id','places'),{ok:true});
 used=GOOGLE_MONTHLY_LOOKUP_CAP;
 await assert.rejects(request('places-b',{},'id','places'),e=>e instanceof LookupLimitError&&e.statusCode===429&&e.message.includes('current openings'));
 assert.equal(calls,1);
});
test('repeated and simultaneous lookups share one provider call without mixing location, fields or providers',async()=>{
 let used=0,calls=0;const request=providerSession(db(()=>++used),async()=>{calls++;return {value:calls}});
 const [a,b]=await Promise.all([request('place',{name:'Cafe',lat:1},'id','places'),request('place',{name:'Cafe',lat:1},'id','places')]);
 assert.deepEqual(a,b);assert.equal(calls,1);assert.equal(used,1);
 await request('place',{name:'Cafe',lat:1},'id','places');assert.equal(calls,1);
 await request('place',{name:'Cafe',lat:2},'id','places');
 await request('place',{name:'Cafe',lat:1},'id,photos','places');
 await request('place',{name:'Cafe',lat:1},'id','routes');assert.equal(calls,4);
});
test('expired checks and failed provider responses are retried rather than kept as stale cached results',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout']});let used=0,fail=true;
 const request=providerSession(db(()=>++used),async()=>{if(fail)throw Error('temporary');return used},100);
 await assert.rejects(request('x',{},'id','routes'),/temporary/);fail=false;
 assert.equal(await request('x',{},'id','routes'),2);
 t.mock.timers.tick(101);
 assert.equal(await request('x',{},'id','routes'),3);
 t.mock.timers.reset();
});
