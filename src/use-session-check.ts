import {useEffect,useRef,useState} from 'react'
/** A check belongs to one active session. Autosave cloning must not create a new request. */
export function useSessionCheck<T>({sessionKey,enabled,request,onChecked}:{sessionKey:string;enabled:boolean;request:(signal:AbortSignal)=>Promise<T>;onChecked:(value:T)=>void}) {
  const latest=useRef({request,onChecked});latest.current={request,onChecked}
  const [result,setResult]=useState<{key:string;phase:'checking'|'ready'|'error';error?:unknown;at?:number}>()
  useEffect(()=>{
    if(!enabled)return
    const ac=new AbortController(),current=latest.current
    setResult({key:sessionKey,phase:'checking'})
    void current.request(ac.signal).then(value=>{
      if(ac.signal.aborted)return
      current.onChecked(value)
      setResult({key:sessionKey,phase:'ready',at:Date.now()})
    }).catch(error=>{if(!ac.signal.aborted)setResult({key:sessionKey,phase:'error',error})})
    return()=>ac.abort()
  },[sessionKey,enabled])
  return enabled&&result?.key===sessionKey?result:undefined
}
