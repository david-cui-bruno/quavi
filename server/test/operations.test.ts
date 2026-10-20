import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
const sha='0123456789012345678901234567890123456789';
async function deployment(mode:string){
 const dir=await mkdtemp(join(tmpdir(),'quavi-deploy-test-'));
 const log=join(dir,'calls');
 try{
  const commands:{[key:string]:string}={
   git:`case "$*" in *status*) ;; *--short=12*) echo 012345678901;; *rev-parse*) echo ${sha};; esac`,
   gcloud:`echo "$*" >> "$OPS_CALLS"\nif [[ "$*" == *'jobs execute quavi-migrate'* && "$OPS_MODE" == migration-fail ]]; then exit 1; fi\nif [[ "$*" == *'services describe'* ]]; then if [[ "$*" == *'latestReadyRevisionName'* ]]; then echo previous-good; else echo https://quavi.test; fi; fi`,
   curl:`if [[ "$*" == *readyz* ]]; then [[ "$OPS_MODE" != readiness-fail ]] || exit 22; echo '{"status":"ready"}'; else if [[ "$OPS_MODE" == auth-fail ]]; then echo 200; else echo 401; fi; fi`,
  };
  for(const [name,body]of Object.entries(commands))await writeFile(join(dir,name),'#!/usr/bin/env bash\nset -e\n'+body+'\n',{mode:0o700});
  let failed=false;
  try{await run('bash',[new URL('../scripts/deploy-dev.sh',import.meta.url).pathname],{env:{...process.env,PATH:dir+':'+process.env.PATH,OPS_CALLS:log,OPS_MODE:mode,QUAVI_IMAGE:`us-central1-docker.pkg.dev/quavi-dev-dc824/quavi/api:${sha}`}})}catch{failed=true}
  return{failed,calls:await readFile(log,'utf8')};
 }finally{await rm(dir,{recursive:true,force:true})}
}
test('dev deployment migrates before API and updates workers only after smoke checks',async()=>{
 const {failed,calls}=await deployment('success');assert.equal(failed,false);
 assert(calls.indexOf('jobs execute quavi-migrate')<calls.indexOf('run deploy quavi-api'));
 assert(calls.indexOf('run deploy quavi-api')<calls.indexOf('jobs update quavi-maintenance'));
 assert(!calls.includes('update-traffic'));
});
for(const mode of ['readiness-fail','auth-fail'])test(`dev deployment rolls back API traffic and leaves workers untouched on ${mode}`,async()=>{
 const {failed,calls}=await deployment(mode);assert(failed);assert(calls.includes('--to-revisions=previous-good=100'));
 assert(!calls.includes('jobs update quavi-maintenance'));assert(!calls.includes('jobs update quavi-push'));
});
test('failed migrations prevent API rollout and background worker updates',async()=>{
 const {failed,calls}=await deployment('migration-fail');assert(failed);assert(!calls.includes('run deploy quavi-api'));assert(!calls.includes('jobs update quavi-maintenance'));
});
