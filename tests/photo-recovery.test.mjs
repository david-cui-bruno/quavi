import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';import ts from 'typescript';import React from 'react';import {create,act} from 'react-test-renderer';
const require=createRequire(import.meta.url),url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
let code=ts.transpileModule(await readFile(new URL('../src/CloudPhoto.tsx',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;
for(const [from,to]of Object.entries({'react':pathToFileURL(require.resolve('react')).href,'react/jsx-runtime':pathToFileURL(require.resolve('react/jsx-runtime')).href,'./cloud':url('export const resolvePhoto=(...a)=>globalThis.__recoveryFetch(...a)'),'./runtime':url('export const useRuntime=()=>globalThis.__recoveryLife'),'./store':url('export const useStore=()=>({account:globalThis.__recoveryAccount})')}))code=code.replaceAll('from '+JSON.stringify(from),'from '+JSON.stringify(to)).replaceAll("from '"+from+"'",'from '+JSON.stringify(to));
const{Photo}=await import(url(code));
test('story photos retry failures, recover on reconnection and never retain another account’s image',async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.__recoveryAccount={uid:'a'};globalThis.__recoveryLife={active:true,online:true,epoch:0};const jobs=[];globalThis.__recoveryFetch=()=>new Promise((resolve,reject)=>jobs.push({resolve,reject}));let view;
 const render=()=>React.createElement(Photo,{src:'quavi-shared:post:photo',alt:'Bakery window',retryable:true});
 try{
  await act(async()=>{view=create(render())});await act(async()=>jobs[0].reject(new Error('offline')));
  assert.equal(view.root.findByType('button').props['aria-label'],'Retry photo: Bakery window');
  await act(async()=>view.root.findByType('button').props.onClick());assert.equal(jobs.length,2);
  await act(async()=>jobs[1].resolve('https://photo.test/a'));assert.equal(view.root.findByType('img').props.src,'https://photo.test/a');
  await act(async()=>view.root.findByType('img').props.onError({}));assert.equal(view.root.findAllByType('img').length,0);
  globalThis.__recoveryLife={active:true,online:false,epoch:1};await act(async()=>view.update(render()));assert.equal(view.root.findAllByType('button').length,0);
  globalThis.__recoveryLife={active:true,online:true,epoch:2};await act(async()=>view.update(render()));assert.equal(jobs.length,3);
  globalThis.__recoveryAccount={uid:'b'};await act(async()=>view.update(render()));assert.equal(jobs.length,4);
  await act(async()=>jobs[2].resolve('https://photo.test/stale-a'));assert.equal(view.root.findAllByType('img').length,0);
  await act(async()=>jobs[3].resolve('https://photo.test/b'));assert.equal(view.root.findByType('img').props.src,'https://photo.test/b');
  globalThis.__recoveryAccount=null;await act(async()=>view.update(render()));assert.equal(view.root.findAllByType('img').length,0);
 }finally{await act(async()=>view?.unmount());delete globalThis.__recoveryFetch;delete globalThis.__recoveryLife;delete globalThis.__recoveryAccount}
});
test('editable photo fallbacks do not add a nested retry button',async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.__recoveryAccount={uid:'a'};globalThis.__recoveryLife={active:true,online:true,epoch:0};globalThis.__recoveryFetch=()=>Promise.reject(new Error('unavailable'));let view;
 try{await act(async()=>{view=create(React.createElement('button',null,React.createElement(Photo,{src:'quavi-media:photo',alt:'My photo'})))});assert.equal(view.root.findAllByType('button').length,1)}finally{await act(async()=>view?.unmount());delete globalThis.__recoveryFetch;delete globalThis.__recoveryLife;delete globalThis.__recoveryAccount}
});
