import {renderToStaticMarkup} from 'react-dom/server'
import {BODY_PLAIN, Persona, type AvatarSpec} from './brand/Persona'
import type {RealPin} from './RealMap'

const ink='#1E1B16', paper='#F7F4EC', yellow='#F9CB2F'
const sizes={quest:22,dest:30,current:32,done:26,locked:22,start:16}
export type QuaviArtwork={key:string;kind:string;quest:boolean;selected:boolean;interactive:boolean;title:string;bodyUrl:string;labelUrl:string;width:number;height:number;anchorX:number;anchorY:number;labelWidth:number;labelHeight:number}
const cache=new Map<string,Promise<{iconUrl:string;iconSize:{width:number;height:number};iconAnchor:{x:number;y:number};quavi:QuaviArtwork}>>()
function surface(width:number,height:number){
 const canvas=document.createElement('canvas');canvas.width=Math.ceil(width*3);canvas.height=Math.ceil(height*3)
 const ctx=canvas.getContext('2d')!;ctx.scale(3,3);return{canvas,ctx}
}
/** Original brand vectors and font, rendered locally. Native animates the separate layers. */
export function mapArt(pin: RealPin | 'you' | 'coin', avatar?:AvatarSpec){
 const p=typeof pin==='object'?pin:undefined
 const key=JSON.stringify([p?{id:p.id,kind:p.kind,label:p.label,sub:p.sub,selected:p.selected,quest:p.quest,interactive:!!p.onClick}:pin,avatar])
 const old=cache.get(key);if(old)return old
 const art=renderArt(pin,avatar).catch(e=>{cache.delete(key);throw e})
 if(cache.size>=96)cache.delete(cache.keys().next().value!)
 cache.set(key,art);return art
}
async function renderArt(pin:RealPin|'you'|'coin',avatar?:AvatarSpec){
 await document.fonts.load('700 12px "ABC Areal"')
 const you=pin==='you',coin=pin==='coin',p=typeof pin==='object'?pin:undefined
 const w=you?40:coin?16:Math.round(sizes[p!.kind]*(p!.selected?1.3:1))
 const h=you?50:coin||p?.kind==='start'?16:Math.round(w*1.42)
 const body=surface(w+8,h+8)
 if(coin||p?.kind==='start'){
  body.ctx.fillStyle=coin?yellow:ink;body.ctx.strokeStyle=coin?ink:paper;body.ctx.lineWidth=coin?2.5:3
  body.ctx.beginPath();body.ctx.arc((w+8)/2,(h+8)/2,6.75,0,Math.PI*2);body.ctx.fill();body.ctx.stroke()
 }else{
  const color=p?.selected?ink:p?.kind==='quest'?'#EE6A2C':p?.kind==='done'?ink:p?.kind==='locked'?'#B9B3A6':yellow
  const outlined=p?.kind==='current'||p?.kind==='dest'
  const shape=you?renderToStaticMarkup(<Persona spec={avatar??{color:'Yellow'}} size={40}/>):`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 24 144 205"><path d="${BODY_PLAIN}" fill="${color}" stroke="${outlined?ink:'none'}" stroke-width="7" stroke-linejoin="round"/>${p?.kind==='done'?'<path d="M50 104L68 122L100 84" fill="none" stroke="#F9CB2F" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>':''}</svg>`
  const image=new Image(),svg=shape.includes('xmlns=')?shape:shape.replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" ')
  image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)
  await image.decode();body.ctx.drawImage(image,4,4,w,h)
 }
 const label=you?'You':p?.label??'',sub=label&&p?.sub?' '+p.sub:''
 body.ctx.font='700 12px "ABC Areal"'
 const words=(label+sub).slice(0,160).split(/\s+/),lines:string[]=[]
 let line=''
 for(const word of words){
  const candidate=line?line+' '+word:word
  if(body.ctx.measureText(candidate).width>170&&line){lines.push(line);line=word}else line=candidate
 }
 if(line)lines.push(line)
 if(lines.length>2){lines.length=2;lines[1]+='…'}
 for(let i=0;i<lines.length;i++)while(body.ctx.measureText(lines[i]).width>170)lines[i]=lines[i].slice(0,-2)+'…'
 const labelWidth=label?Math.ceil(Math.max(...lines.map(t=>body.ctx.measureText(t).width)))+22:0
 const labelHeight=label?lines.length*16+10:0
 const pill=surface(Math.max(1,labelWidth),Math.max(1,labelHeight))
 if(label){
  pill.ctx.fillStyle=you?yellow:p?.selected?ink:paper
  pill.ctx.beginPath();pill.ctx.roundRect(0,0,labelWidth,labelHeight,Math.min(13,labelHeight/2));pill.ctx.fill()
  pill.ctx.font='700 12px "ABC Areal"';pill.ctx.textAlign='center';pill.ctx.textBaseline='middle';pill.ctx.fillStyle=p?.selected?paper:ink
  lines.forEach((text,i)=>pill.ctx.fillText(text,labelWidth/2,13+i*16))
 }
 const anchorX=(w+8)/2,anchorY=coin||p?.kind==='start'?(h+8)/2:you?4+h*.92:4+h
 const quavi:QuaviArtwork={key:p?'pin-'+p.id:String(pin),kind:you?'you':coin?'coin':p!.kind,quest:!!p?.quest,selected:!!p?.selected,interactive:!!p?.onClick,title:label+sub,bodyUrl:body.canvas.toDataURL('image/png'),labelUrl:label?pill.canvas.toDataURL('image/png'):'',width:w+8,height:h+8,anchorX,anchorY,labelWidth,labelHeight}
 // Browser fallback uses the same artwork. All anchors are pixels, as required by the plugin.
 const width=Math.max(w+8,labelWidth),height=h+8+(label?labelHeight+3:0),composite=surface(width,height)
 composite.ctx.drawImage(body.canvas,(width-w-8)/2,0,w+8,h+8)
 if(label)composite.ctx.drawImage(pill.canvas,(width-labelWidth)/2,h+11,labelWidth,labelHeight)
 return {iconUrl:composite.canvas.toDataURL('image/png'),iconSize:{width,height},iconAnchor:{x:width/2,y:anchorY},quavi}
}
