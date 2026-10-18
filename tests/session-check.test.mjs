import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import {create,act} from 'react-test-renderer'
import {useSessionCheck} from '../src/use-session-check.ts'
globalThis.IS_REACT_ACT_ENVIRONMENT=true
const settle=()=>new Promise(resolve=>setImmediate(resolve))
test('autosave rerenders cannot recursively launch more paid venue checks',async()=>{
 let calls=0,shown,renderer
 function Probe({snapshot}) {
  shown=useSessionCheck({sessionKey:snapshot.id,enabled:true,request:async()=>{calls++;return{hours:'unknown'}},onChecked:()=>{}})
  return null
 }
 await act(async()=>{renderer=create(React.createElement(Probe,{snapshot:{id:'outing:0:resume1',source:{provider:'Overture'}}}));await settle()})
 assert.equal(calls,1);assert.equal(shown.phase,'ready')
 for(let i=0;i<3;i++)await act(async()=>{renderer.update(React.createElement(Probe,{snapshot:{id:'outing:0:resume1',source:{provider:'Overture'}}}));await settle()})
 assert.equal(calls,1)
 await act(async()=>{renderer.update(React.createElement(Probe,{snapshot:{id:'outing:0:resume2',source:{provider:'Overture'}}}));await settle()})
 assert.equal(calls,2);await act(async()=>renderer.unmount())
})
test('locking or going offline aborts checks and ignores responses from the old session',async()=>{
 const pending=[],published=[];let renderer,shown
 function Probe({epoch,active}){shown=useSessionCheck({sessionKey:String(epoch),enabled:active,request:signal=>new Promise(resolve=>pending.push({signal,resolve})),onChecked:value=>published.push(value)});return null}
 await act(async()=>{renderer=create(React.createElement(Probe,{epoch:0,active:true}));await settle()})
 await act(async()=>{renderer.update(React.createElement(Probe,{epoch:1,active:false}));await settle()})
 assert.equal(pending[0].signal.aborted,true);assert.equal(shown,undefined)
 await act(async()=>{pending[0].resolve('stale hours');await settle()});assert.deepEqual(published,[])
 await act(async()=>{renderer.update(React.createElement(Probe,{epoch:2,active:true}));await settle()})
 await act(async()=>{pending[1].resolve('fresh hours');await settle()})
 assert.deepEqual(published,['fresh hours']);assert.equal(shown.phase,'ready');await act(async()=>renderer.unmount())
})
