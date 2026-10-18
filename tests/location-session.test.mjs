import test from 'node:test'
import assert from 'node:assert/strict'
import {usableFix,canArrive,beginLocationWatch,locationMessage} from '../src/location-session.mjs'
const now=1792310000000
const fix=(accuracy=8,timestamp=now)=>({timestamp,coords:{latitude:40.73,longitude:-74,accuracy}})
const settle=()=>new Promise(resolve=>setImmediate(resolve))
test('arrival requires the full GPS accuracy circle inside the stop radius and a recent fix',()=>{
 assert.equal(canArrive(55,fix(),now),true)
 assert.equal(canArrive(65,fix(),now),false)
 assert.equal(canArrive(0,fix(1000),now),false)
 assert.equal(canArrive(0,fix(8,now-21000),now),false)
 assert.equal(canArrive(0,fix(8,now+10000),now),false)
 assert.equal(usableFix({...fix(),coords:{latitude:NaN,longitude:0,accuracy:2}},now),false)
 assert.equal(canArrive(0,undefined,now),false)
})
test('a watch created after locking is cleared and cannot publish late positions',async()=>{
 let complete,callback;const clears=[],positions=[]
 const id=new Promise(resolve=>{complete=resolve})
 const stop=beginLocationWatch({permission:async()=> 'granted',watch:async fn=>{callback=fn;return id},clear:async id=>{clears.push(id)}},false,p=>positions.push(p),assert.fail)
 await settle();stop();callback(fix());complete('native-watch');await settle()
 assert.deepEqual(positions,[]);assert.deepEqual(clears,['native-watch'])
})
test('permission denial does not start a watcher or silently substitute simulated positions',async()=>{
 const errors=[];let watched=false
 const stop=beginLocationWatch({permission:async()=> 'denied',watch:async()=>{watched=true;return 'id'},clear:async()=>{}},true,assert.fail,e=>errors.push(e))
 await settle();stop();assert.equal(watched,false);assert.equal(errors[0].code,'1');assert.match(locationMessage(errors[0]),/Settings/)
})
test('cancellation during a permission request suppresses errors and native watcher creation',async()=>{
 let resolve;let watched=false
 const permission=new Promise(r=>{resolve=r})
 const stop=beginLocationWatch({permission:()=>permission,watch:async()=>{watched=true;return 'id'},clear:async()=>{}},true,assert.fail,assert.fail)
 stop();resolve('granted');await settle();assert.equal(watched,false)
})
