import pg from 'pg'

export function createPool(connectionString: string) {
  return new pg.Pool({ connectionString, max: 5, connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000 })
}

export type StoredState = { state: Record<string, unknown>; revision: number; updatedAt: string }

export async function readState(pool: pg.Pool, uid: string): Promise<StoredState | null> {
  const result = await pool.query('SELECT document, revision, updated_at FROM user_state WHERE user_id = $1', [uid])
  const row = result.rows[0]
  return row ? { state: row.document, revision: row.revision, updatedAt: row.updated_at.toISOString() } : null
}

export async function writeState(pool: pg.Pool, uid: string, state: Record<string, unknown>, revision: number): Promise<StoredState | null> {
  const result = revision === 0
    ? await pool.query(`INSERT INTO user_state (user_id, document) VALUES ($1, $2::jsonb)
        ON CONFLICT (user_id) DO NOTHING RETURNING document, revision, updated_at`, [uid, JSON.stringify(state)])
    : await pool.query(`UPDATE user_state SET document = $2::jsonb, revision = revision + 1, updated_at = now()
        WHERE user_id = $1 AND revision = $3 RETURNING document, revision, updated_at`, [uid, JSON.stringify(state), revision])
  const row = result.rows[0]
  return row ? { state: row.document, revision: row.revision, updatedAt: row.updated_at.toISOString() } : null
}
