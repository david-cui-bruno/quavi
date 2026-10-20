import { Icon } from './Icons'
import config from './cloud-config.json'
import { useState } from 'react'
import { AccountPanel } from './AccountPanel'
import { AppBuild } from './AppBuild'
import { PushSettings } from './PushSettings'
import { nativePush } from './push'
import { useStore } from './store'
import { Sheet, Btn, BG } from './ui'
import {homeTone,type HomeColor} from './review-home'
type Page='main'|'appearance'|'account'|'notifications'|'privacy'
export function SettingsSheet({onClose}:{onClose:()=>void}) {
 const {account,s,update,restart}=useStore(),[page,setPage]=useState<Page>('main'),[confirm,setConfirm]=useState(false)
 const titles:Record<Page,string>={main:'Settings.',appearance:'Make it yours.',account:'Your account.',notifications:'Notifications.',privacy:'Privacy & terms.'}
 const row=(title:string,subtitle:string,next:Page,icon:'settings'|'users'|'bell'|'shield')=><button className="settings-row" onClick={()=>setPage(next)}><Icon name={icon} size={22}/><span><b>{title}</b><span className="small muted">{subtitle}</span></span><Icon name="chevron" size={18}/></button>
 return <Sheet label={page==='main'?'Settings':titles[page]} onClose={onClose}>
  <div className="settings-page">
   <div className="settings-titlebar">{page!=='main'&&<button className="back" aria-label="Back to settings" onClick={()=>{setPage('main');setConfirm(false)}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 12H5m7-7-7 7 7 7"/></svg></button>}<h2 className="h1 h-m">{titles[page]}</h2></div>
   {page==='main'&&<>
    <div className="settings-rows">{row('Appearance','Your Home colour','appearance','settings')}{row('Account',account?.email??'Sign in and keep your stories','account','users')}{account&&nativePush()&&row('Notifications','Updates from your circle','notifications','bell')}{row('Privacy & terms','The practical details','privacy','shield')}</div>
    <div className="settings-build"><AppBuild/></div><Btn kind="soft" onClick={onClose}>Done</Btn>
   </>}
   {page==='appearance'&&<><p className="body muted">A little colour for your next plot twist.</p><div className="home-colours" role="radiogroup" aria-label="Home background colour">{([['orange-p','Orange'],['yellow','Yellow'],['paper','Paper'],['ink','Ink']] as [HomeColor,string][]).map(([tone,label])=><button key={tone} role="radio" aria-checked={homeTone(s.user.homeColor)===tone} onClick={()=>update(st=>({...st,user:{...st.user,homeColor:tone}}))}><span className="home-colour-swatch" style={{background:BG[tone]}}>{homeTone(s.user.homeColor)===tone&&<Icon name="check" size={24}/>}</span><b>{label}</b></button>)}</div><p className="small muted">Saved with your profile.</p></>}
   {page==='account'&&<div className="settings-account-page"><AccountPanel/>{!account&&<section className="settings-section">{confirm?<><p className="body">Clear this device’s demo stories and progress?</p><Btn kind="secondary" onClick={restart}>Clear & restart demo</Btn><button className="text-action" onClick={()=>setConfirm(false)}>Keep my demo</button></>:<button className="text-action" onClick={()=>setConfirm(true)}>Clear & restart demo</button>}</section>}</div>}
   {page==='notifications'&&<PushSettings heading={false}/>}
   {page==='privacy'&&<section className="settings-legal" aria-label="Privacy and terms">{(['privacy','terms'] as const).map(kind=><a key={kind} href={`${config.apiUrl}/legal/${kind}`} target="_blank" rel="noreferrer"><Icon name={kind==='privacy'?'shield':'book'}/><span>{kind==='privacy'?'Privacy policy':'Terms of use'}</span><Icon name="chevron" size={18}/></a>)}</section>}
  </div>
 </Sheet>
}
