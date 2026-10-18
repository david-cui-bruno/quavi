import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { createApp } from '../src/app.js'
import { createPool } from '../src/db.js'
import { readConfig } from '../src/config.js'

const config = readConfig()
if (config.GOOGLE_CLOUD_PROJECT !== 'demo-quavi' || config.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099') {
  throw new Error('Integration tests only run against the local demo-quavi auth emulator')
}
const firebase = initializeApp({ projectId: config.GOOGLE_CLOUD_PROJECT }, `test-${randomUUID()}`)
const auth = getAuth(firebase)
const pool = createPool(config.DATABASE_URL)
const app = await createApp({ pool, auth, origins: ['capacitor://localhost'], media: {
  async upload(key, contentType, bytes) { return { url: 'https://storage.test/upload', fields: { key, 'Content-Type': contentType, bytes: String(bytes) } } },
  async read(key) { return `https://storage.test/read/${key}` },
} })
const users: { uid: string; token: string }[] = []
const headers = (user: number) => ({ authorization: `Bearer ${users[user].token}` })

before(async () => {
  await app.ready()
  for (let i = 0; i < 3; i++) {
    const response = await fetch(`http://${config.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=local-test`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `test-${randomUUID()}@example.test`, password: 'local-test-password-123', returnSecureToken: true }),
    })
    assert.equal(response.status, 200)
    const result = await response.json() as { localId: string; idToken: string }
    users.push({ uid: result.localId, token: result.idToken })
  }
})

after(async () => {
  await app.close()
  if (users.length) {
    await pool.query('DELETE FROM user_state WHERE user_id = ANY($1)', [users.map((u) => u.uid)])
    await pool.query('DELETE FROM media_objects WHERE user_id = ANY($1)', [users.map((u) => u.uid)])
    await auth.deleteUsers(users.map((u) => u.uid))
  }
  await pool.end()
  await deleteApp(firebase)
})

test('state requires a valid Firebase token; readiness exposes no private data', async () => {
  assert.equal((await app.inject('/healthz')).statusCode, 200)
  assert.equal((await app.inject('/readyz')).statusCode, 200)
  assert.equal((await app.inject('/v1/me/state')).statusCode, 401)
  assert.equal((await app.inject({ url: '/v1/me/state', headers: { authorization: 'Bearer forged-token' } })).statusCode, 401)
})

test('two signed-in accounts save isolated state and cannot select someone else’s identity', async () => {
  const a = await app.inject({ method: 'PUT', url: '/v1/me/state', headers: headers(0), payload: { state: { name: 'A', story: 'private story' }, revision: 0 } })
  assert.equal(a.statusCode, 200)
  assert.equal(a.json().revision, 1)
  const b = await app.inject({ url: `/v1/me/state?userId=${users[0].uid}`, headers: headers(1) })
  assert.deepEqual(b.json(), { state: null, revision: 0, updatedAt: null })
  const impersonation = await app.inject({ method: 'PUT', url: '/v1/me/state', headers: headers(1), payload: { userId: users[0].uid, state: { name: 'stolen' }, revision: 1 } })
  assert.equal(impersonation.statusCode, 400)
  assert.equal((await app.inject({ url: '/v1/me/state', headers: headers(0) })).json().state.name, 'A')
  assert.equal((await app.inject({ url: '/v1/me', headers: headers(1) })).json().userId, users[1].uid)
})

test('stale and concurrent writes cannot silently overwrite another device', async () => {
  const writes = await Promise.all(['first', 'second'].map((name) => app.inject({ method: 'PUT', url: '/v1/me/state', headers: headers(0), payload: { state: { name }, revision: 1 } })))
  assert.deepEqual(writes.map((r) => r.statusCode).sort(), [200, 409])
  const response = await app.inject({ url: '/v1/me/state', headers: headers(0) })
  assert.equal(response.json().revision, 2)
  assert.ok(['first', 'second'].includes(response.json().state.name))
})

test('stored state survives replacing the API instance', async () => {
  const restarted = await createApp({ pool, auth, origins: [] })
  try {
    const response = await restarted.inject({ url: '/v1/me/state', headers: headers(0) })
    assert.equal(response.json().revision, 2)
    assert.ok(response.json().updatedAt)
  } finally { await restarted.close() }
})

test('private photo grants enforce ownership, image types and size limits', async () => {
  const badType = await app.inject({ method: 'POST', url: '/v1/me/media', headers: headers(0), payload: { contentType: 'text/html', bytes: 128 } })
  assert.equal(badType.statusCode, 400)
  const oversized = await app.inject({ method: 'POST', url: '/v1/me/media', headers: headers(0), payload: { contentType: 'image/jpeg', bytes: 9 * 1024 * 1024 } })
  assert.equal(oversized.statusCode, 400)
  const upload = await app.inject({ method: 'POST', url: '/v1/me/media', headers: headers(0), payload: { contentType: 'image/jpeg', bytes: 1024 } })
  assert.equal(upload.statusCode, 201)
  const media = upload.json()
  assert.match(media.upload.fields.key, /^users\/[a-f0-9]{64}\/[a-f0-9-]+$/)
  assert.equal(media.upload.fields.bytes, '1024')
  assert.equal((await app.inject({ url: `/v1/me/media/${media.id}`, headers: headers(1) })).statusCode, 404)
  assert.equal((await app.inject({ url: `/v1/me/media/${media.id}`, headers: headers(0) })).statusCode, 200)
})

test('disabled accounts lose access even with a previously issued token', async () => {
  await auth.updateUser(users[2].uid, { disabled: true })
  assert.equal((await app.inject({ url: '/v1/me/state', headers: headers(2) })).statusCode, 401)
})

test('production and non-demo projects reject emulator authentication', () => {
  const base = { GOOGLE_CLOUD_PROJECT: 'demo-quavi', DATABASE_URL: 'postgresql://localhost/quavi', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' }
  assert.throws(() => readConfig({ ...base, NODE_ENV: 'production' }), /never be enabled/)
  assert.throws(() => readConfig({ ...base, K_SERVICE: 'quavi' }), /never be enabled/)
  assert.throws(() => readConfig({ ...base, GOOGLE_CLOUD_PROJECT: 'quavi-production' }), /isolated demo-/)
})
