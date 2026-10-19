#!/usr/bin/env node
// Read-only verification through a local Cloud SQL Auth Proxy to a disposable PITR clone.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import pg from 'pg';
const [instance,port]=process.argv.slice(2);
assert.match(instance??'',/^quavi-restore-[a-z0-9-]+$/);
assert.match(port??'',/^\d{4,5}$/);
assert.notEqual(instance,'quavi-dev-db');
const metadata=JSON.parse(execFileSync('gcloud',['sql','instances','describe',instance,'--project=quavi-dev-dc824','--format=json'],{encoding:'utf8'}));
assert.equal(metadata.state,'RUNNABLE');
function poolFor(secret){
 const raw=execFileSync('gcloud',['secrets','versions','access','1','--secret='+secret,'--project=quavi-dev-dc824'],{encoding:'utf8'}).trim();
 const u=new URL(raw);u.hostname='127.0.0.1';u.port=port;u.searchParams.delete('host');u.searchParams.delete('sslmode');
 return new pg.Pool({connectionString:u.toString(),max:1,connectionTimeoutMillis:10000});
}
const admin=poolFor('quavi-migration-database-url'),runtime=poolFor('quavi-runtime-database-url');
try {
 const client=await admin.connect();
 let migrations=0;
 try {
  await client.query('BEGIN READ ONLY');
  const applied=await client.query('SELECT name,checksum FROM schema_migrations ORDER BY name');
  const files=await readdir(new URL('../migrations/',import.meta.url));
  for(const row of applied.rows){assert(files.includes(row.name));const sql=await readFile(new URL('../migrations/'+row.name,import.meta.url),'utf8');assert.equal(row.checksum,createHash('sha256').update(sql).digest('hex'));migrations++;}
  assert(migrations>0);
  const integrity=await client.query(`SELECT NOT EXISTS(SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND NOT convalidated) AS valid`);
  assert.equal(integrity.rows[0].valid,true);
  for(const table of ['user_state','outings','media_objects','account_deletions','reward_ledger','social_notifications','push_deliveries'])await client.query('SELECT 1 FROM '+table+' LIMIT 1');
  await client.query('ROLLBACK');
 }finally{client.release();}
 const result=await runtime.query(`SELECT current_user, has_table_privilege(current_user,'outings','SELECT') AS read_outings, has_table_privilege(current_user,'schema_migrations','SELECT') AS read_migrations, rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname=current_user`);
 const r=result.rows[0];assert.equal(r.current_user,'quavi_runtime');assert.equal(r.read_outings,true);assert.equal(r.read_migrations,false);assert.equal(r.rolsuper,false);assert.equal(r.rolcreatedb,false);assert.equal(r.rolcreaterole,false);
 console.log(JSON.stringify({instance,source:'quavi-dev-db',status:'verified',migrationsVerified:migrations,constraintsValidated:true,appTablesReadable:true,runtimePrivilegesRestricted:true,productionWrites:false},null,2));
}finally{await admin.end();await runtime.end();}
