import { createHash, randomUUID } from 'node:crypto'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { z, ZodError } from 'zod'
import type { Auth } from 'firebase-admin/auth'
import type pg from 'pg'
import { readState, writeState } from './db.js'
import { MAX_PHOTO_BYTES, type MediaSigner } from './media.js'

declare module 'fastify' { interface FastifyRequest { uid: string } }

const stateInput = z.object({ state: z.record(z.string(), z.unknown()), revision: z.number().int().nonnegative().max(2147483646) }).strict()
const uploadInput = z.object({ contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']), bytes: z.number().int().positive().max(MAX_PHOTO_BYTES) }).strict()

export async function createApp(options: { pool: pg.Pool; auth: Auth; origins: string[]; media?: MediaSigner; logger?: boolean }) {
  const app = Fastify({ bodyLimit: 2 * 1024 * 1024, logger: options.logger ? { redact: ['req.headers.authorization', 'req.headers.cookie'] } : false })
  app.decorateRequest('uid', '')
  await app.register(cors, { origin: options.origins, methods: ['GET', 'PUT', 'POST'], allowedHeaders: ['Authorization', 'Content-Type'] })
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' })
  app.addHook('onSend', async (_req, reply) => { reply.header('Cache-Control', 'no-store'); reply.header('X-Content-Type-Options', 'nosniff') })
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof ZodError) return reply.code(400).send({ error: 'Invalid request', fields: error.issues.map((i) => i.path.join('.')) })
    const code = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : undefined
    const status = typeof code === 'number' && code >= 400 && code < 500 ? code : 500
    if (status === 500) req.log.error({ err: error }, 'Request failed')
    return reply.code(status).send({ error: status === 500 ? 'Service temporarily unavailable' : status === 429 ? 'Too many requests' : 'Invalid request' })
  })

  app.get('/healthz', async () => ({ status: 'ok' }))
  app.get('/readyz', async (_req, reply) => {
    try { await options.pool.query('SELECT 1'); return { status: 'ready' } }
    catch { return reply.code(503).send({ status: 'unavailable' }) }
  })

  await app.register(async (api) => {
    api.addHook('preHandler', async (req, reply) => {
      const header = req.headers.authorization
      if (!header?.startsWith('Bearer ')) return reply.code(401).send({ error: 'Sign in required' })
      try {
        const token = await options.auth.verifyIdToken(header.slice(7), true)
        req.uid = token.uid
      } catch { return reply.code(401).send({ error: 'Session expired or invalid. Sign in again.' }) }
    })

    api.get('/me', async (req) => ({ userId: req.uid }))
    api.get('/me/state', async (req) => (await readState(options.pool, req.uid)) ?? { state: null, revision: 0, updatedAt: null })
    api.put('/me/state', async (req, reply) => {
      const { state, revision } = stateInput.parse(req.body)
      const saved = await writeState(options.pool, req.uid, state, revision)
      if (!saved) return reply.code(409).send({ error: 'Changes were saved on another device. Reload before retrying.' })
      return saved
    })

    api.post('/me/media', async (req, reply) => {
      if (!options.media) return reply.code(503).send({ error: 'Photo storage is not configured' })
      const input = uploadInput.parse(req.body)
      const id = randomUUID()
      const owner = createHash('sha256').update(req.uid).digest('hex')
      const key = `users/${owner}/${id}`
      const upload = await options.media.upload(key, input.contentType, input.bytes)
      await options.pool.query('INSERT INTO media_objects (id, user_id, object_key, content_type) VALUES ($1, $2, $3, $4)', [id, req.uid, key, input.contentType])
      return reply.code(201).send({ id, upload, expiresInSeconds: 600 })
    })
    api.get('/me/media/:id', async (req, reply) => {
      const id = z.uuid().parse((req.params as { id: string }).id)
      const result = await options.pool.query('SELECT object_key FROM media_objects WHERE id = $1 AND user_id = $2', [id, req.uid])
      if (!result.rows[0]) return reply.code(404).send({ error: 'Photo not found' })
      if (!options.media) return reply.code(503).send({ error: 'Photo storage is not configured' })
      return { url: await options.media.read(result.rows[0].object_key), expiresInSeconds: 300 }
    })
  }, { prefix: '/v1' })
  return app
}
