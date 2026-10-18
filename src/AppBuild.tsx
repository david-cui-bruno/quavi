import {useEffect,useState} from 'react'
import {Capacitor} from '@capacitor/core'
import {App} from '@capacitor/app'

export function AppBuild(){
 const [label,setLabel]=useState('Quavi · Web preview')
 useEffect(()=>{
  if(!Capacitor.isNativePlatform())return
  let canceled=false
  void App.getInfo().then(info=>{if(!canceled)setLabel(`Quavi ${info.version} · Build ${info.build} · Development beta`)}).catch(()=>{})
  return ()=>{canceled=true}
 },[])
 return <p className="small muted" style={{margin:'8px 4px 16px'}}>{label}</p>
}
