import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import ts from 'typescript';
const moduleURL=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
let code=ts.transpileModule(await readFile(new URL('../src/places.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.ESNext}}).outputText;
code=code.replace(/from ['"]\.\/data['"]/, 'from '+JSON.stringify(moduleURL('export const isDrinkPlace=()=>false'))).replace(/from ['"]\.\/geo['"]/, 'from '+JSON.stringify(moduleURL('export const distance=(a,b)=>Math.hypot(a.lat-b.lat,a.lng-b.lng)*111000')));
const {searchPlace}=await import(moduleURL(code));
const hit=(id,name,x=41.8,extra={})=>({properties:{osm_type:'N',osm_id:String(id),name,city:'Providence',street:'Thayer Street',housenumber:'10',...extra},geometry:{coordinates:[-71.4,x]}});
test('place results collapse duplicate representations of the same nearby venue and ignore invalid geometry',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>({ok:true,json:async()=>({features:[hit(1,'Brown University'),hit(2,'Brown University',41.80001),hit(3,'Brown University',42),hit(4,'Invalid',NaN),hit(5,'Other place')]})});
 try{const r=await searchPlace('Brown University',{lat:41.8,lng:-71.4});assert.deepEqual(r.map(x=>x.id),['N1','N3','N5']);assert.equal(r[0].address,'10 Thayer Street, Providence')}finally{globalThis.fetch=old}
});
test('a stalled place provider times out and an external cancellation propagates',async(t)=>{
 const old=globalThis.fetch;t.mock.timers.enable({apis:['setTimeout']});globalThis.fetch=(_u,{signal})=>new Promise((_ok,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));
 try {const check=assert.rejects(searchPlace('coffee',{lat:41.8,lng:-71.4}),e=>e.name==='AbortError');t.mock.timers.tick(8001);await check;const ac=new AbortController();const cancelled=assert.rejects(searchPlace('coffee',{lat:41.8,lng:-71.4},ac.signal),e=>e.name==='AbortError');ac.abort();await cancelled}finally{globalThis.fetch=old;t.mock.timers.reset()}
});
