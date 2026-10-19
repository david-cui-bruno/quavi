import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import ts from 'typescript'
import React from 'react'
import {create,act} from 'react-test-renderer'
const require=createRequire(import.meta.url),url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64')
let code=ts.transpileModule(await readFile(new URL('../src/CityPicker.tsx',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText
for(const[from,to]of Object.entries({
 react:pathToFileURL(require.resolve('react')).href,
 'react/jsx-runtime':pathToFileURL(require.resolve('react/jsx-runtime')).href,
 './cloud':url('export const api=(...a)=>globalThis.__openings.api(...a);export const accountError=e=>e.message;export const auth={get currentUser(){return globalThis.__openings.account}}'),
 './store':url('export const useStore=()=>({account:globalThis.__openings.account,s:{user:{interests:["cozy"],age21:false}},update:fn=>globalThis.__openings.updates++})'),
 './tracking':url('export const START={lat:40.73,lng:-74};export const useTracking=()=>({locate:async()=>START})'),
 './places':url('export const searchPlace=async()=>[]'),
 './ui':url(`import React from ${JSON.stringify(pathToFileURL(require.resolve('react')).href)};export const Btn=props=>React.createElement('button',props)`),
}))code=code.replaceAll(`from '${from}'`,`from '${to}'`).replaceAll(`from "${from}"`,`from "${to}"`)
const {CityPicker}=await import(url(code))
const result=id=>({openings:id?[{chapters:[0,1,2].map(i=>({placeId:id+i,place:'Place '+i}))}]:[],notes:[]})
test('different openings makes a fresh request, avoids repeats, preserves current choices on no result and ignores stale accounts',async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.window=globalThis
 const requests=[],results=[],jobs=[]
 globalThis.__openings={account:{uid:'a'},updates:0,api:(_a,_path,_method,body)=>{requests.push(body);return new Promise(resolve=>jobs.push(resolve))}}
 let view
 const onResults=r=>results.push(r),onBusy=()=>{}
 const render=refreshKey=>React.createElement(CityPicker,{refreshKey,onResults,onBusy})
 try{
  await act(async()=>{view=create(render(0))})
  await act(async()=>{void view.root.findAllByType('button').find(b=>b.props.children==='Use my location').props.onClick();await Promise.resolve()})
  await act(async()=>jobs[0](result('first')))
  assert.equal(results.length,1)
  await act(async()=>view.update(render(1)))
  assert.notEqual(requests[0].variant,requests[1].variant)
  assert.deepEqual(requests[1].avoidRoutes,[['first0','first1','first2']])
  await act(async()=>jobs[1](result(null)))
  assert.equal(results.length,1,'no fresh result must not clear current options')
  assert.match(JSON.stringify(view.toJSON()),/current options are still available/)
  await act(async()=>view.update(render(2)))
  globalThis.__openings.account={uid:'b'}
  await act(async()=>jobs[2](result('stale')))
  assert.equal(results.length,1,'previous account response cannot update the planner')
 }finally{await act(async()=>view?.unmount());delete globalThis.__openings}
})
