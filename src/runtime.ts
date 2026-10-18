import { useSyncExternalStore } from 'react'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { Network } from '@capacitor/network'
type Runtime = {active:boolean;online:boolean;epoch:number}
let value:Runtime = {active:!document.hidden,online:navigator.onLine,epoch:0}
const listeners = new Set<()=>void>()
function update(patch:Partial<Runtime>) {
  const next = {...value,...patch}
  if (next.active===value.active && next.online===value.online) return
  next.epoch=value.epoch+1
  value=next; listeners.forEach(fn=>fn())
}
export const runtime = {get:()=>value,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn)}}}
export const useRuntime = () => useSyncExternalStore(runtime.subscribe,runtime.get)
/** Called once by the root. Register before reading initial native state to avoid lost events. */
export function observeRuntime() {
  let closed=false
  const handles: {remove():Promise<void>}[]=[]
  const visibility=()=>update({active:!document.hidden})
  const online=()=>update({online:navigator.onLine})
  document.addEventListener('visibilitychange',visibility)
  window.addEventListener('online',online);window.addEventListener('offline',online)
  if(Capacitor.isNativePlatform()) {
    let appEvent=false,networkEvent=false
    void (async()=>{
      for(const pending of [App.addListener('appStateChange',state=>{appEvent=true;if(!closed)update({active:state.isActive})}),Network.addListener('networkStatusChange',state=>{networkEvent=true;if(!closed)update({online:state.connected})})]) {
        const handle=await pending
        if(closed)await handle.remove();else handles.push(handle)
      }
      const [app,network]=await Promise.all([App.getState(),Network.getStatus()])
      if(!closed)update({...(!appEvent?{active:app.isActive}:{}),...(!networkEvent?{online:network.connected}:{})})
    })().catch(()=>{})
  }
  return()=>{closed=true;handles.forEach(h=>void h.remove());document.removeEventListener('visibilitychange',visibility);window.removeEventListener('online',online);window.removeEventListener('offline',online)}
}
