import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { distance, stepToward, type LatLng } from './geo'
import { useStore } from './store'
import { useRuntime } from './runtime'
import { beginLocationWatch, usableFix, locationMessage, type Fix } from './location-session.mjs'
import { currentLocation, locationAdapter } from './location'
export type TrackMode = 'demo' | 'live'
type Perm = 'unknown' | 'granted' | 'denied' | 'unsupported'
type Ctx = {
  pos: LatLng; accuracy?: number; fix?: Fix; ready:boolean; locationError:string
  mode: TrackMode; setMode:(m:TrackMode)=>void; retryLocation:()=>void; locate:()=>Promise<LatLng>
  perm:Perm; walking:boolean; setWalking:(w:boolean)=>void
  setTarget:(t:LatLng|null)=>void; setPath:(p:LatLng[]|null)=>void; teleport:(p:LatLng)=>void
  notify:(title:string,body:string)=>void
}
export const START:LatLng={lat:40.7329,lng:-74.0031}
const TrackCtx=createContext<Ctx>(null as unknown as Ctx)
export const useTracking=()=>useContext(TrackCtx)
const MODE_KEY='quavi.track.mode'
export function TrackingProvider({children}:{children:ReactNode}) {
  const {s,account,update}=useStore()
  const life=useRuntime()
  const [mode,setModeState]=useState<TrackMode>(()=>localStorage.getItem(MODE_KEY)==='live'?'live':'demo')
  const [pos,setPos]=useState<LatLng>(()=>s.story?.origin??START)
  const [fix,setFix]=useState<Fix>()
  const [perm,setPerm]=useState<Perm>('unknown')
  const [locationError,setLocationError]=useState('')
  const [walking,setWalking]=useState(false)
  const [retry,setRetry]=useState(0)
  const [clock,tick]=useState(Date.now)
  const prompt=useRef(false)
  const target=useRef<LatLng|null>(null),pathRef=useRef<LatLng[]|null>(null),posRef=useRef(pos)
  posRef.current=pos
  const identity=account?.uid??'demo'
  useEffect(()=>{setWalking(false);setFix(undefined);setPos(s.story?.origin??START)},[identity,s.story?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const accept=useCallback((p:Fix)=>{
    setPerm('granted');setFix(p);tick(Date.now())
    if(usableFix(p)){setPos({lat:p.coords.latitude,lng:p.coords.longitude});setLocationError('')}
    else setLocationError('GPS is not precise enough yet. Enable Precise Location for Quavi and try again outdoors.')
  },[])
  const setMode=useCallback((m:TrackMode)=>{
    setModeState(m);localStorage.setItem(MODE_KEY,m);setWalking(false);setFix(undefined);setLocationError('')
    prompt.current=m==='live';setRetry(n=>n+1)
  },[])
  const retryLocation=useCallback(()=>{prompt.current=true;setFix(undefined);setRetry(n=>n+1)},[])
  const locate=useCallback(async()=>{const p=await currentLocation();accept(p);setModeState('live');localStorage.setItem(MODE_KEY,'live');setWalking(false);return {lat:p.coords.latitude,lng:p.coords.longitude}},[accept])
  useEffect(()=>{
    if(mode!=='live'||!life.active){setFix(undefined);return}
    setFix(undefined);setLocationError('')
    const ask=prompt.current;prompt.current=false
    return beginLocationWatch(locationAdapter,ask,accept,error=>{
      setFix(undefined);setLocationError(locationMessage(error))
      if(['1','OS-PLUG-GLOC-0003'].includes(String((error as {code?:unknown})?.code)))setPerm('denied')
    })
  },[mode,life.active,retry,identity,s.story?.id,accept])
  useEffect(()=>{if(mode!=='live')return;const timer=window.setInterval(()=>tick(Date.now()),1000);return()=>window.clearInterval(timer)},[mode])
  useEffect(()=>{if(!life.active){setWalking(false);pathRef.current=null;update(st=>st.story?.outingPhase==='active'?{...st,story:{...st.story,outingPhase:'paused'}}:st)}},[life.active,update])
  useEffect(()=>{
    if(mode!=='demo'||!walking||!life.active)return
    const t=window.setInterval(()=>{
      const tg=target.current;if(!tg)return
      const pth=pathRef.current,goal=pth?.length?pth[0]:tg,far=distance(posRef.current,tg)>1500
      const next=stepToward(posRef.current,goal,pth?.length?(far?45:14):far?180:14)
      if(pth?.length&&distance(next,goal)<1.5)pth.shift()
      setPos(next);if(distance(next,tg)<6)setWalking(false)
    },120)
    return()=>window.clearInterval(t)
  },[mode,walking,life.active])
  const notify=useCallback((_title:string,_body:string)=>{try{navigator.vibrate?.(60)}catch{/* optional */}},[])
  const ready=mode==='demo'?life.active:life.active&&usableFix(fix,clock)
  const value=useMemo<Ctx>(()=>({pos,accuracy:fix?.coords.accuracy,fix,ready,locationError,mode,setMode,retryLocation,locate,perm,walking,setWalking:(w:boolean)=>{setWalking(w);if(w)update(st=>!st.story?st:{...st,story:{...st.story,outingPhase:'active'}})},
    setTarget:t=>{target.current=t},setPath:p=>{pathRef.current=p?[...p]:null},teleport:p=>{if(mode==='demo')setPos(p);setWalking(false)},notify,
  }),[pos,fix,ready,locationError,mode,setMode,retryLocation,locate,perm,walking,notify,update])
  return <TrackCtx.Provider value={value}>{children}</TrackCtx.Provider>
}
