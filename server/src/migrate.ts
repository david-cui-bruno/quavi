import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { createPool } from './db.js'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
const pool = createPool(process.env.DATABASE_URL)
const client = await pool.connect()
try {
  await client.query('BEGIN')
  await client.query('SELECT pg_advisory_xact_lock(72418201)')
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())')
  const directory = new URL('../migrations/', import.meta.url)
  for (const name of (await readdir(directory)).filter((n) => n.endsWith('.sql')).sort()) {
    const sql = await readFile(new URL(name, directory), 'utf8')
    const checksum = createHash('sha256').update(sql).digest('hex')
    const existing = await client.query('SELECT checksum FROM schema_migrations WHERE name = $1', [name])
    if (existing.rows[0]) {
      if (existing.rows[0].checksum !== checksum) throw new Error(`Applied migration changed: ${name}`)
      continue
    }
    await client.query(sql)
    await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [name, checksum])
    process.stdout.write(`Applied ${name}\n`)
  }
  await client.query('COMMIT')
} catch (error) { await client.query('ROLLBACK'); throw error }
finally { client.release(); await pool.end() }
