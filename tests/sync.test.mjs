import test from 'node:test'
import assert from 'node:assert/strict'
import { SyncEngine } from '../src/sync-engine.mjs'
function storage() { const values = new Map(); return { getItem: (k) => values.get(k), setItem: (k, v) => values.set(k, v) } }
function setup(overrides = {}) {
  const db = overrides.db || { revision: 0, state: null }
  let displayed, status
  const engine = new SyncEngine({ uid: 'alice', storage: storage(), initial: { name: 'Empty' },
    prepare: async (s) => s,
    request: async (method, body) => {
      if (method === 'GET') return structuredClone(db)
      if (body.revision !== db.revision) throw Object.assign(new Error('Conflict'), { status: 409 })
      db.state = body.state; db.revision++; return structuredClone(db)
    }, ...overrides,
    onState: (s) => { displayed = s }, onStatus: (s) => { status = s },
  })
  return { engine, db, get displayed() { return displayed }, get status() { return status } }
}
test('accounts isolate caches and never silently import the anonymous demo', async () => {
  const disk = storage(); disk.setItem('quavi.v1', JSON.stringify({ name: 'Private demo' }))
  const a = setup({ storage: disk }); await a.engine.open(); a.engine.edit({ name: 'Alice' }); await a.engine.flush(); a.engine.close()
  const b = setup({ uid: 'bob', storage: disk }); await b.engine.open()
  assert.equal(b.displayed.name, 'Empty'); assert.equal(b.db.revision, 0); b.engine.close()
})
test('offline edits survive relaunch and retry only after reading remote revision', async () => {
  const disk = storage(), db = { state: { name: 'Cloud' }, revision: 1 }
  const a = setup({ storage: disk, db }); await a.engine.open(); a.engine.edit({ name: 'Offline edit' }); a.engine.close()
  let online = false
  const b = setup({ storage: disk, db, request: async (method, body) => {
    if (!online) throw new Error('offline')
    if (method === 'GET') return structuredClone(db)
    assert.equal(body.revision, 1); db.state = body.state; db.revision++; return structuredClone(db)
  } })
  await b.engine.open(); assert.equal(b.status, 'offline'); assert.equal(b.displayed.name, 'Offline edit')
  online = true; await b.engine.flush(); assert.equal(db.state.name, 'Offline edit'); assert.equal(b.status, 'saved'); b.engine.close()
})
test('newer remote save pauses stale writes and requires explicit replacement', async () => {
  const disk = storage(), db = { state: { name: 'Original' }, revision: 1 }
  const a = setup({ storage: disk, db }); await a.engine.open(); a.engine.edit({ name: 'Local edits' }); a.engine.close()
  db.state = { name: 'Another device' }; db.revision = 2
  const b = setup({ storage: disk, db }); await b.engine.open(); assert.equal(b.status, 'conflict'); await b.engine.flush()
  assert.equal(b.displayed.name, 'Local edits'); assert.equal(db.state.name, 'Another device')
  await b.engine.useCloud(); assert.equal(b.displayed.name, 'Another device'); assert.equal(b.status, 'saved'); b.engine.close()
})
test('edits made during a slow photo upload are saved after the first snapshot', async () => {
  let release
  const gate = new Promise((r) => { release = r })
  const a = setup({ prepare: async (s) => { await gate; return s } }); await a.engine.open()
  a.engine.edit({ name: 'First' }); const saving = a.engine.flush(); a.engine.edit({ name: 'Latest' }); release(); await saving
  assert.equal(a.db.state.name, 'Latest'); assert.equal(a.db.revision, 2); assert.equal(a.status, 'saved'); a.engine.close()
})
test('signing out during a request cannot publish another account’s save into the UI', async () => {
  let release
  const gate = new Promise((r) => { release = r })
  const a = setup({ request: async () => { await gate; return { state: { name: 'Alice' }, revision: 1 } } })
  const opening = a.engine.open(); a.engine.close(); release(); await opening
  assert.equal(a.displayed, undefined)
})

test('notes typed during a slow reconnect read survive the returned older snapshot',async()=>{
 let release
 const gate=new Promise(r=>{release=r})
 const a=setup({request:async(method,body)=>{if(method==='GET'){await gate;return{state:{name:'Cloud'},revision:0}}return{state:body.state,revision:1}}})
 const opening=a.engine.open();a.engine.edit({name:'New note while reconnecting'});release();await opening
 assert.equal(a.displayed.name,'New note while reconnecting');assert.equal(a.engine.cache.dirty,false);a.engine.close()
})
test('an interrupted write reads remote before retry and retains conflicting local notes',async()=>{
 const calls=[];let remote={state:{name:'Original'},revision:1}
 const a=setup({request:async(method,body)=>{calls.push(method);if(method==='GET')return structuredClone(remote);remote={state:body.state,revision:2};throw new Error('connection lost after server accepted') }})
 await a.engine.open();a.engine.edit({name:'First offline note'});await a.engine.flush()
 a.engine.edit({name:'Additional local note'});await a.engine.flush()
 assert.deepEqual(calls,['GET','PUT','GET']);assert.equal(a.status,'conflict');assert.equal(a.displayed.name,'Additional local note');assert.equal(remote.state.name,'First offline note');a.engine.close()
})
test('offline startup makes no network calls, restores cached progress and reconnects with a read first',async()=>{
 const disk=storage();disk.setItem('quavi.account.v1.alice',JSON.stringify({state:{name:'Cached plan'},revision:4,dirty:true}))
 let available=false;const calls=[]
 const a=setup({storage:disk,available:()=>available,request:async(method,body)=>{calls.push(method);return{state:body?.state??{name:'Cloud'},revision:method==='GET'?4:5}}})
 await a.engine.open();assert.equal(a.displayed.name,'Cached plan');assert.deepEqual(calls,[])
 a.engine.edit({name:'Offline note'});await a.engine.flush();assert.deepEqual(calls,[])
 available=true;await a.engine.resume();assert.deepEqual(calls,['GET','PUT']);assert.equal(a.displayed.name,'Offline note');a.engine.close()
})

test('storage-full warnings survive offline retries so unsaved content is not described as safely cached',async()=>{
 let online=true,full=false
 const disk=storage();const a=setup({storage:{getItem:disk.getItem,setItem:(k,v)=>{if(full)throw new Error('quota exceeded');disk.setItem(k,v)}},available:()=>online})
 await a.engine.open();full=true;online=false;a.engine.edit({name:'Not cached'});assert.equal(a.status,'storage-full')
 await a.engine.flush();assert.equal(a.status,'storage-full');assert.equal(a.engine.cache.state.name,'Not cached');a.engine.close()
})
