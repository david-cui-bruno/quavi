import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import ts from 'typescript'
import React from 'react'
import {create,act} from 'react-test-renderer'
const require=createRequire(import.meta.url)
const moduleURL=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64')

async function loadStore(){
 const input=await readFile(new URL('../src/store.tsx',import.meta.url),'utf8')
 let code=ts.transpileModule(input,{compilerOptions:{target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText
 const adapters={
  'firebase/auth':moduleURL(`export const onAuthStateChanged=(_auth,callback)=>{globalThis.__accountProbe.auth=callback;return()=>{}};export const signOut=async()=>{}`),
  './cloud':moduleURL(`export const auth={};export const clearPhotoCache=()=>{};export const photoUploader=()=>async s=>s;export const api=async(_user,path)=>{if(globalThis.__accountProbe.fail)throw new Error("offline");return path==='/outings'?{outings:[]}:globalThis.__accountProbe.remote};`),
  './runtime':moduleURL(`export const runtime={get:()=>({active:true,online:globalThis.__accountProbe.online!==false}),subscribe:()=>()=>{}}`),
  './data':moduleURL(`export const DEFAULT_LISTS=[]`),
  './outing-sync.mjs':moduleURL(`export {OutingSync,profileOnly} from ${JSON.stringify(new URL('../src/outing-sync.mjs',import.meta.url).href)};export const outingStorage=()=>{const disk=new Map();return {read:async k=>disk.get(k),write:async(k,v)=>disk.set(k,structuredClone(v)),remove:async k=>disk.delete(k)}}`),
  './sync-engine.mjs':new URL('../src/sync-engine.mjs',import.meta.url).href,
  './google-retention.mjs':new URL('../src/google-retention.mjs',import.meta.url).href,
  'react':pathToFileURL(require.resolve('react')).href,
  'react/jsx-runtime':pathToFileURL(require.resolve('react/jsx-runtime')).href,
 }
 for(const [name,url]of Object.entries(adapters))code=code.replaceAll('from '+JSON.stringify(name),'from '+JSON.stringify(url)).replaceAll("from '"+name+"'",'from '+JSON.stringify(url))
 const dir=await mkdtemp('/tmp/quavi-account-test-'),file=dir+'/store.mjs';await writeFile(file,code)
 return {...await import(pathToFileURL(file).href),cleanup:()=>rm(dir,{recursive:true,force:true})}
}
test('a fresh account starts its own onboarding instead of inheriting demo or another account',async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.window=globalThis
 const disk=new Map([['quavi.v1',JSON.stringify({user:{name:'Demo Person',age21:true,avatar:{color:'Orange'}}})]])
 globalThis.localStorage={getItem:k=>disk.get(k)??null,setItem:(k,v)=>disk.set(k,v),removeItem:k=>disk.delete(k)}
 globalThis.__accountProbe={remote:{state:null,revision:0}}
 const {StoreProvider,useStore,cleanup}=await loadStore();let state,renderer
 function Observe(){state=useStore();return null}
 try{
  await act(async()=>{renderer=create(React.createElement(StoreProvider,null,React.createElement(Observe)))})
  await act(async()=>{globalThis.__accountProbe.auth({uid:'brand-new'});await new Promise(r=>setImmediate(r))})
  assert.equal(state.route.name,'about','new account must not skip onboarding')
  assert.equal(state.s.user.name,'','new account must not inherit a demo or placeholder name')
  assert.equal(state.s.user.age21,undefined)
  assert.equal(state.s.game.xp,0,'real accounts must not start with demo XP')
  assert.equal(state.s.game.coins,0,'real accounts must not start with demo coins')
  assert.equal(state.s.game.streak,0)
  assert.deepEqual(state.s.game.badges,[])
  await act(async()=>state.update(st=>({...st,user:{...st.user,name:'First',age21:false,onboarding:'interests'}})))
  const first=structuredClone(state.s)
  await act(async()=>{globalThis.__accountProbe.auth({uid:'second-new'});await new Promise(r=>setImmediate(r))})
  assert.equal(state.route.name,'about');assert.equal(state.s.user.name,'')
  globalThis.__accountProbe.remote={state:first,revision:0}
  await act(async()=>{globalThis.__accountProbe.auth({uid:'brand-new'});await new Promise(r=>setImmediate(r))})
  assert.equal(state.route.name,'interests','interrupted setup resumes at its saved step')
  assert.equal(state.s.user.name,'First')
  globalThis.__accountProbe.remote={state:{...first,user:{...first.user,onboarding:'complete'}},revision:2}
  await act(async()=>{globalThis.__accountProbe.auth({uid:'completed'});await new Promise(r=>setImmediate(r))})
  assert.equal(state.route.name,'home','completed accounts must not repeat onboarding')
  disk.set('quavi.account.v1.stale-device',JSON.stringify({state:first,revision:0,dirty:false}))
  await act(async()=>{globalThis.__accountProbe.auth({uid:'stale-device'});await new Promise(r=>setImmediate(r))})
  assert.equal(state.route.name,'home','a stale device must use the completed cloud profile before choosing its entry screen')
  const legacy={...first,user:{...first.user}};delete legacy.user.onboarding
  globalThis.__accountProbe.remote={state:legacy,revision:3}
  await act(async()=>{globalThis.__accountProbe.auth({uid:'legacy'});await new Promise(r=>setImmediate(r))})
  assert.equal(state.route.name,'home','existing profiles without a new marker stay completed')
  globalThis.__accountProbe.fail=true;globalThis.__accountProbe.online=false
  await act(async()=>{globalThis.__accountProbe.auth({uid:'legacy'});await new Promise(r=>setImmediate(r))})
  assert.equal(state.route.name,'home','a known account can open offline')
  await act(async()=>{globalThis.__accountProbe.auth({uid:'unknown-offline'});await new Promise(r=>setImmediate(r))})
  assert.match(JSON.stringify(renderer.toJSON()),/Connect to load your account/,'an unknown offline account must not be mistaken for a new profile')
  globalThis.__accountProbe.fail=false;globalThis.__accountProbe.online=true
  await act(async()=>{await renderer.root.findAllByType('button').find(b=>b.props.children==='Try again').props.onClick();await new Promise(r=>setImmediate(r))})
  assert.equal(state.route.name,'home','retry uses the returning cloud profile')
 }finally{await act(async()=>renderer?.unmount());delete globalThis.__accountProbe;await cleanup()}
})
