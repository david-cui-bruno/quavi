import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { api, accountError, auth } from './cloud'
import { PlaceSearch } from './PlaceSearch'
import { useStore } from './store'
import { useTracking, START } from './tracking'
import type { Opening } from './data'
import { Btn, Chip } from './ui'
import { Persona, flock } from './brand/Persona'
export type PlannerStage = 'location' | 'time' | 'options'
type Results = {openings:Opening[];notes:string[];provider:string;updatedAt:string}
type Origin = {point:{lat:number;lng:number};label:string;live:boolean}
export function CityPicker({onResults,refreshKey=0,onBusy,onStage,backKey=0}:{
 onResults:(result:Results,live:boolean)=>void;refreshKey?:number;onBusy?:(busy:boolean)=>void;onStage?:(stage:PlannerStage)=>void;backKey?:number
}) {
 const {account,s,update}=useStore(),tracking=useTracking()
 const [stage,setStage]=useState<PlannerStage>('location'),[manual,setManual]=useState(false),[query,setQuery]=useState('')
 const [origin,setOrigin]=useState<Origin|null>(null),[minutes,setMinutes]=useState(60),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const mounted=useRef(true),sequence=useRef(0),previous=useRef<string[][]>([]),lastSearch=useRef<{origin:Origin;minutes:number}|null>(null)
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;sequence.current++}},[])
 useEffect(()=>{onBusy?.(busy)},[busy,onBusy])
 useEffect(()=>{onStage?.(stage)},[stage,onStage])
 const change=(next:PlannerStage)=>{setError('');setStage(next)}
 const back=useEffectEvent(()=>{if(!busy)change(stage==='options'?'time':'location')})
 useEffect(()=>{if(backKey)back()},[backKey])
 const find=async(place:Origin,duration:number,refresh=false)=>{
  if(!account)return
  const ticket=++sequence.current;setBusy(true);setError('');lastSearch.current={origin:place,minutes:duration}
  if(!refresh)previous.current=[]
  try {
   const result=await api<Results>(account,'/detours','POST',{origin:place.point,label:place.label,interests:s.user.interests,mood:s.mood,minutes:duration,age21:s.user.age21,variant:crypto.randomUUID(),avoidRoutes:previous.current})
   if(!mounted.current||ticket!==sequence.current||auth.currentUser?.uid!==account.uid)return
   if(refresh&&!result.openings.length){setError('No new openings fit here right now. Your current choices are still here.');return}
   previous.current=[...previous.current,...result.openings.map(o=>o.chapters.map(c=>c.placeId??c.place))].slice(-6)
   if(result.openings.length){update(st=>({...st,user:{...st.user,neighborhood:place.label}}));setStage('options')}
   onResults(result,place.live)
   if(!result.openings.length)setError('No routes fit yet. Try more time or a different starting point.')
  }catch(e){if(mounted.current&&ticket===sequence.current&&auth.currentUser?.uid===account.uid)setError(accountError(e))}
  finally{if(mounted.current&&ticket===sequence.current)setBusy(false)}
 }
 const refresh=useEffectEvent(()=>{const last=lastSearch.current;if(last&&!busy)void find(last.origin,last.minutes,true)})
 useEffect(()=>{if(refreshKey)refresh()},[refreshKey])
 const locate=async()=>{
  setBusy(true);setError('');const ticket=++sequence.current
  try {const point=await tracking.locate();if(mounted.current&&ticket===sequence.current){setOrigin({point,label:'your location',live:true});setStage('time')}}
  catch(e){if(mounted.current&&ticket===sequence.current){setError(e instanceof Error?e.message:'Location is unavailable. Choose a city instead.');setManual(true)}}
  finally{if(mounted.current&&ticket===sequence.current)setBusy(false)}
 }
 return <section className={`city-picker planner-setup planner-${stage}`} aria-label={stage==='options'?'Detour starting point':'Plan your detour'}>
  {stage==='location'&&<>
   <p className="body muted">Start nearby, or choose somewhere you’d like to explore.</p>
   {!manual&&<div className="planner-duck" aria-hidden="true"><Persona spec={flock('Pip','Orange')} size={160}/></div>}
   {manual?<div className="planner-manual"><PlaceSearch inline value={query} onChange={setQuery} near={tracking.mode==='live'?tracking.pos:START} onChoose={place=>{setOrigin({point:place.ll,label:place.name,live:false});change('time')}}/><button className="text-action" disabled={busy} onClick={()=>{setManual(false);setError('')}}>Use my location instead</button></div>:<div className="planner-entry-actions"><Btn disabled={busy} kind="secondary" onClick={()=>void locate()}>{busy?'Finding you…':'Continue with my location'}</Btn><button className="text-action" disabled={busy} onClick={()=>setManual(true)}>Choose a city instead</button></div>}
  </>}
  {stage==='time'&&<>
   <button className="planner-area" disabled={busy} onClick={()=>change('location')} aria-label="Change starting point"><span>{origin?.label}</span><span>Change</span></button>
   <p className="body muted">Leave a little room for the unexpected.</p>
   <div className="planner-duration-choices" role="group" aria-label="Time for your detour">{([30,60,120] as const).map(n=><Chip key={n} on={minutes===n} onClick={()=>setMinutes(n)}>{n===30?'30 min':n===60?'1 hour':'2 hours'}</Chip>)}</div>
   <div className="planner-duck" aria-hidden="true"><Persona spec={flock('Maple','Yellow')} size={160}/></div>
   <Btn kind="secondary" disabled={busy||!origin} onClick={()=>origin&&void find(origin,minutes)}>{busy?'Finding your openings…':'Find my openings'}</Btn>
  </>}
  {stage==='options'&&<button className="planner-area" disabled={busy} onClick={()=>change('time')} aria-label="Change detour starting point"><span>{origin?.label} · {minutes===60?'1 hour':minutes===120?'2 hours':'30 min'}</span><span>Change</span></button>}
  {error&&<p className="planner-error body" role="alert">{error}</p>}
 </section>
}
