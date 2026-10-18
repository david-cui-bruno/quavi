import { useEffect, useState } from 'react'
import { accountError, api } from './cloud'
import { useStore } from './store'
import { useTracking } from './tracking'
import { useRuntime } from './runtime'
import { useSessionCheck } from './use-session-check'
import type { HoursCheck, Story, WalkingCheck } from './data'

/** Checks are transient; restoring or resuming an outing requires a new session. */
export function useOutingCheck(story:Story, chapter:number) {
  const {account,update}=useStore(),tracking=useTracking(),life=useRuntime()
  const [attempt,retry]=useState(0)
  const remaining=story.chapters.slice(chapter)
  const stopsKey=JSON.stringify(remaining.map(c=>[c.place,c.ll,c.mins]))
  const key=[account?.uid,story.id,chapter,stopsKey,life.epoch,tracking.mode,attempt].join(':')
  const enabled=Boolean(story.source&&account&&life.active&&life.online&&tracking.ready)
  useEffect(()=>{tracking.setWalking(false)},[key,enabled]) // stop simulation on interruptions; do not auto-resume it
  const result=useSessionCheck({sessionKey:key,enabled,
    request:async signal=>{
      if(!remaining.length||remaining.some(c=>!c.ll))throw Object.assign(new Error('Choose a detour with mapped stops.'),{publicMessage:true})
      const check=await api<WalkingCheck & {hours:HoursCheck[]}>(account!,'/detour-check','POST',{
        points:[tracking.pos,...remaining.map(c=>c.ll)],
        stops:remaining.map(c=>({name:c.place,ll:c.ll,mins:c.mins,googlePlaceId:c.googlePlaceId})),
      },signal)
      if(Math.ceil(check.duration/60)+remaining.reduce((sum,c)=>sum+c.mins,0)>(story.timeBudgetMinutes??120))throw Object.assign(new Error('The remaining outing now takes longer than this plan allows. Adjust the stops or choose another detour.'),{publicMessage:true})
      return check
    },
    onChecked:check=>update(st=>st.story?.id===story.id&&st.chapter===chapter?({...st,story:{...st.story,chapters:st.story.chapters.map((c,i)=>i<chapter?c:{...c,hours:check.hours[i-chapter],googlePlaceId:check.hours[i-chapter]?.googlePlaceId,googleRoute:true,walking:check.legs[i-chapter]})}}):st),
  })
  useEffect(()=>{
    if(result?.phase!=='ready')return
    const timer=window.setTimeout(()=>retry(n=>n+1),Math.max(0,300000-(Date.now()-result.at!)))
    return()=>window.clearTimeout(timer)
  },[result])
  const phase=!life.active?'paused':!life.online?'offline':!tracking.ready?'location':!story.source?'ready':!account?'sign-in':result?.phase??'checking'
  const message=result?.error instanceof Error&&(result.error as {publicMessage?:boolean}).publicMessage?result.error.message:result?.error?accountError(result.error):undefined
  return {phase,message,retry:()=>retry(n=>n+1),token:key,ready:phase==='ready'}
}
