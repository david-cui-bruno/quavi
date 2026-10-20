import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import ts from 'typescript'
import React from 'react'
import {create,act} from 'react-test-renderer'
const require=createRequire(import.meta.url),url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64')
const source=await readFile(new URL('../src/screens/story.tsx',import.meta.url),'utf8')
const react=pathToFileURL(require.resolve('react')).href
const prefix=`import React,{useState,useRef,useEffect} from '${react}';
const useStore=()=>globalThis.__swap.store;
const useStory=()=>[structuredClone(globalThis.__swap.story),fn=>{globalThis.__swap.saves++;globalThis.__swap.story=fn(globalThis.__swap.story)}];
const auth={get currentUser(){return globalThis.__swap.store.account}};
const api=(...args)=>globalThis.__swap.api(...args);
const accountError=()=> 'Generic failure';
const replacePlannedStop=(story,i,place)=>({...story,chapters:story.chapters.map((c,k)=>k===i?{...c,place:place.place,ll:place.ll}:c)});
const applyPlannedCheck=story=>story;
const Screen$=({children})=>React.createElement('main',null,children),BackBtn=()=>React.createElement('button',null,'Back');
const Btn=props=>React.createElement('button',props),Persona=()=>null,Check=()=>null;
const flock=()=>({}),safeSurface=()=> 'paper',BG={paper:'white'};
const PlaceSearch=props=>React.createElement('input',{value:props.value,onChange:e=>props.onChange(e.target.value),'aria-label':'Search places'});
`
const code=ts.transpileModule(prefix+source.slice(source.indexOf('export function Swap()'),source.indexOf('\nexport function Complete()')),{compilerOptions:{target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText.replaceAll('from "react/jsx-runtime"',`from '${pathToFileURL(require.resolve('react/jsx-runtime')).href}'`)
const {Swap}=await import(url(code))
test('typing clears the old stop choice and cloned autosaves preserve the selected suggestion; failed checks keep the plan',async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true
 const alt={place:'Gallery',meta:'Art gallery',persona:'Juno',color:'Orange',ll:{lat:40.733,lng:-73.998},kind:'Art gallery'}
 const c={place:'Cafe',ll:{lat:40.73,lng:-74},alts:[alt],mins:10}
 globalThis.__swap={story:{id:'plan',origin:c.ll,source:{provider:'Overture Maps'},chapters:[c]},saves:0,store:{route:{params:{i:0}},account:{uid:'qa'},s:{user:{age21:false}},back:()=>{},say:()=>{}},api:async()=>{throw new Error('No walking route connects these stops.')}}
 let view
 const text=node=>node.children.filter(x=>typeof x==='string').join('')
 const swapButton=()=>view.root.findAllByType('button').find(b=>text(b)==='Swap this stop')
 const suggestion=()=>view.root.findAllByType('button').find(b=>b.props['aria-pressed']!==undefined)
 try{
  await act(async()=>{view=create(React.createElement(Swap))})
  await act(async()=>view.root.findByType('input').props.onChange({target:{value:'My specific place'}}))
  assert.equal(swapButton().props.disabled,true,'typing must not silently apply the previous suggestion')
  await act(async()=>suggestion().props.onClick())
  assert.equal(suggestion().props['aria-pressed'],true,'selected state survives fresh chapter objects from autosave')
  await act(async()=>swapButton().props.onClick())
  assert.equal(globalThis.__swap.saves,0)
  assert.equal(globalThis.__swap.story.chapters[0].place,'Cafe')
  assert.match(JSON.stringify(view.toJSON()),/No walking route connects/)
 }finally{await act(async()=>view?.unmount());delete globalThis.__swap}
})
