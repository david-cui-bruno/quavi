import test from 'node:test'
import assert from 'node:assert/strict'
import {SyncEngine} from '../src/sync-engine.mjs'
import {scrubGoogleContent} from '../src/google-retention.mjs'
test('live Google responses stay in memory while cache and transport retain user content and place IDs',async()=>{
 const storage=new Map();let remote={state:{story:null},revision:1};let shown;
 const engine=new SyncEngine({uid:'test',storage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},initial:remote.state,sanitize:scrubGoogleContent,prepare:async x=>x,onState:x=>{shown=x},onStatus:()=>{},request:async(method,body)=>{if(method==='GET')return remote;assert.ok(!JSON.stringify(body).includes('reported open'));assert.ok(!JSON.stringify(body).includes('"hours"'));remote={state:body.state,revision:2};return remote}})
 await engine.open()
 engine.edit({story:{walking:{provider:'Google Maps',distance:123},estimatedMinutes:60,timeBudgetMinutes:60,chapters:[{place:'Independent venue name',kind:'Cafe',googlePlaceId:'id',googleRoute:true,hours:{status:'open'},meta:'reported open for your visit',walk:'3 min walk'}],moments:{0:{note:'My photo walk',img:'quavi-media:private'}}}})
 assert.ok(!storage.get(engine.key).includes('reported open'));await engine.flush();assert.equal(shown.story.chapters[0].hours.status,'open');assert.equal(remote.state.story.chapters[0].googlePlaceId,'id');assert.equal(remote.state.story.moments[0].note,'My photo walk');engine.close()
})
