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

// Exercise the actual map component and effect ordering, substituting only SDK/DOM adapters.
async function loadMap(){
 const input=await readFile(new URL('../src/RealMap.tsx',import.meta.url),'utf8')
 let code=ts.transpileModule(input,{compilerOptions:{target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText
 const adapters={
  './demo-walks':moduleURL('export function DemoRouteCredit(){return null}'),
  '@capacitor/google-maps':moduleURL(`export class LatLngBounds{constructor(v){Object.assign(this,v)}}; export const GoogleMap={create:async(options,ready)=>{queueMicrotask(ready);return globalThis.__quaviMapProbe.map}}`),
  '@capacitor/core':moduleURL('export const Capacitor={isNativePlatform:()=>false}'),
  './runtime':moduleURL('export function useRuntime(){return {active:true,online:true,epoch:0}}'),
  './map-art':moduleURL(`export async function mapArt(pin){return {iconUrl:'art.png',iconSize:{width:40,height:60},iconAnchor:{x:20,y:40},quavi:{key:typeof pin==='string'?pin:pin.id}}}`),
  './geo':new URL('../src/geo.ts',import.meta.url).href,
  'react':pathToFileURL(require.resolve('react')).href,
  'react/jsx-runtime':pathToFileURL(require.resolve('react/jsx-runtime')).href,
 }
 code=code.replace(/import mapsConfig from [^;]+;/,'const mapsConfig={iosKey:"test",webKey:"test"};')
 for(const [name,url]of Object.entries(adapters))code=code.replaceAll('from '+JSON.stringify(name),'from '+JSON.stringify(url)).replaceAll("from '"+name+"'",'from '+JSON.stringify(url))
 const base=new URL('../node_modules/.tmp/map-tests/',import.meta.url);await mkdir(base,{recursive:true})
 const dir=await mkdtemp(base.pathname+'run-'),file=dir+'/RealMap.mjs';await writeFile(file,code)
 return {...await import(pathToFileURL(file).href),cleanup:()=>rm(dir,{recursive:true,force:true})}
}
const settle=()=>new Promise(resolve=>setImmediate(resolve))
test('zoom in/out, autosave clones and stop changes preserve existing map pins and trails',async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true
 globalThis.ResizeObserver=class{observe(){}disconnect(){}}
 globalThis.MutationObserver=class{observe(){}disconnect(){}}
 globalThis.requestAnimationFrame=()=>0;globalThis.cancelAnimationFrame=()=>{}
 const callbacks={},removed=[],paths=[],native=new Map();let seq=0,renderer
 const map={setOnCameraMoveStartedListener:async f=>{callbacks.move=f},setOnCameraIdleListener:async f=>{callbacks.idle=f},setOnMarkerClickListener:async()=>{},setPadding:async()=>{},destroy:async()=>{},setCamera:async()=>{},
  addMarkers:async list=>list.map(p=>{if(!native.has(p.quavi.key))native.set(p.quavi.key,String(++seq));return native.get(p.quavi.key)}),
  removeMarkers:async ids=>{removed.push(...ids)},addPolylines:async list=>{paths.push(list);return ['path']},removePolylines:async()=>{assert.fail('unchanged geometry must not be removed during zoom or a pin update')},
 }
 globalThis.__quaviMapProbe={map}
 const {RealMap,cleanup}=await loadMap()
 const root={querySelectorAll:()=>[],getAnimations:()=>[],addEventListener(){},removeEventListener(){}}
 const element={clientHeight:844,closest:()=>root,parentElement:{getBoundingClientRect:()=>({width:390,height:844,top:0,bottom:844})}}
 const pins=[{id:'cafe',ll:{lat:40.73,lng:-74},kind:'quest',label:'Cafe'},{id:'park',ll:{lat:40.74,lng:-74},kind:'dest',label:'Park'}]
 const route=pins.map(p=>p.ll)
 try{
  await act(async()=>{renderer=create(React.createElement(RealMap,{pins,route}),{createNodeMock:()=>element});await settle();await settle()})
  assert.equal(native.size,2);assert.equal(paths.length,1);assert.equal(paths[0][0].strokeColor,'#EE6A2C');assert.equal(paths[0][0].icons,undefined,'street routes must remain a continuous line')
  const first=native.get('cafe')
  for(const zoom of [17,14,18,16])await act(async()=>{callbacks.idle({zoom});await settle()})
  assert.deepEqual(removed,[],'zoom must not remove and recreate pins')
  assert.equal(paths.length,1,'zoom must not rebuild walking geometry')
  await act(async()=>{renderer.update(React.createElement(RealMap,{pins:pins.map(p=>({...p})),route:[...route]}));await settle()})
  assert.deepEqual(removed,[],'autosave clones retain marker identity');assert.equal(native.get('cafe'),first)
  await act(async()=>{renderer.update(React.createElement(RealMap,{pins:[pins[0]],route}));await settle()})
  assert.deepEqual(removed,[native.get('park')],'only the deleted stop is removed')
 }finally{await act(async()=>{renderer?.unmount();await settle()});delete globalThis.__quaviMapProbe;await cleanup()}
})
