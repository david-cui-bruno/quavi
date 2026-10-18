import {renderToStaticMarkup} from 'react-dom/server'
import {BODY_PLAIN, Persona, type AvatarSpec} from './brand/Persona'
import type {RealPin} from './RealMap'

const ink='#1E1B16', paper='#F7F4EC', yellow='#F9CB2F'
const sizes={quest:22,dest:30,current:32,done:26,locked:22,start:16}
const cache=new Map<string,Promise<{iconUrl:string;iconSize:{width:number;height:number}}>>()

/** Render our original vectors and type locally: the native map cannot display HTML markers. */
export function mapArt(pin: RealPin | 'you' | 'coin', avatar?:AvatarSpec, far=false){
 const key=JSON.stringify([pin,avatar,far],(k,v)=>k==='onClick'?undefined:v)
 const old=cache.get(key);if(old)return old
 const art=renderArt(pin,avatar,far).catch(e=>{cache.delete(key);throw e})
 if(cache.size>=96)cache.delete(cache.keys().next().value!)
 cache.set(key,art);return art
}
async function renderArt(pin:RealPin|'you'|'coin',avatar?:AvatarSpec,far=false){
 await document.fonts.load('700 12px "ABC Areal"')
 const you=pin==='you',coin=pin==='coin',p=typeof pin==='object'?pin:undefined
 const w=you?40:coin?16:Math.round(sizes[p!.kind]*(p!.selected?1.3:1))
 const h=you?50:coin||p?.kind==='start'?16:Math.round(w*1.42)
 const label=you?'You':p?.quest&&!p.selected&&far?'':p?.label??''
 const sub=label&&p?.sub?' '+p.sub:''
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d')!
 ctx.font='700 12px "ABC Areal"'
 let text=(label+sub).slice(0,100)
 while(ctx.measureText(text).width>192)text=text.slice(0,-2)+'…'
 const labelWidth=text?Math.ceil(ctx.measureText(text).width)+22:0
 const ring=you||p?.kind==='current'
 const width=Math.max(w+12,labelWidth+12,ring?80:0),height=h+(text?30:0)+12
 canvas.width=width*3;canvas.height=height*3;ctx.scale(3,3)
 const x=width/2
 if(ring){ctx.fillStyle='#F9CB2F55';ctx.beginPath();ctx.arc(x,8+h*.6,Math.min(35,h*.75),0,2*Math.PI);ctx.fill()}
 if(coin||p?.kind==='start'){
  ctx.fillStyle=coin?yellow:ink;ctx.strokeStyle=coin?ink:paper;ctx.lineWidth=coin?2.5:3
  ctx.beginPath();ctx.arc(x,14,6.5,0,Math.PI*2);ctx.fill();ctx.stroke()
 }else{
  const color=p?.selected?ink:p?.kind==='quest'?'#EE6A2C':p?.kind==='done'?ink:p?.kind==='locked'?'#B9B3A6':yellow
  const outlined=p?.kind==='current'||p?.kind==='dest'
  const shape=you?renderToStaticMarkup(<Persona spec={avatar??{color:'Yellow'}} size={40}/>):`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 24 144 205"><path d="${BODY_PLAIN}" fill="${color}" stroke="${outlined?ink:'none'}" stroke-width="7" stroke-linejoin="round"/>${p?.kind==='done'?'<path d="M50 104L68 122L100 84" fill="none" stroke="#F9CB2F" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>':''}</svg>`
  const image=new Image()
  const svg=shape.includes('xmlns=')?shape:shape.replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" ')
  image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)
  await image.decode();ctx.drawImage(image,x-w/2,6,w,h)
 }
 if(text){
  ctx.fillStyle=you?yellow:p?.selected?ink:paper
  ctx.beginPath();ctx.roundRect((width-labelWidth)/2,h+9,labelWidth,24,12);ctx.fill()
  ctx.font='700 12px "ABC Areal"';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=p?.selected?paper:ink
  ctx.fillText(text,x,h+21)
 }
 return {iconUrl:canvas.toDataURL('image/png'),iconSize:{width,height}}
}
