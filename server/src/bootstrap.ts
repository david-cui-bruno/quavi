/** Run once with the migration DB role before serving requests. No runtime DDL privileges. */
import pg from 'pg'
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
try {
  await pool.query(`REVOKE cloudsqlsuperuser FROM quavi_runtime;
    ALTER ROLE quavi_runtime NOCREATEDB NOCREATEROLE;
    REVOKE CREATE ON SCHEMA public FROM PUBLIC;
    GRANT CONNECT ON DATABASE quavi TO quavi_runtime;
    GRANT USAGE ON SCHEMA public TO quavi_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON user_state, media_objects, account_deletions, request_quotas, venue_cache TO quavi_runtime;`)
  console.log('Runtime database permissions applied')
} finally { await pool.end() }
