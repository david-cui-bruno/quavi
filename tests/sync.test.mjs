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
