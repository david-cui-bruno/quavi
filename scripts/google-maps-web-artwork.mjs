// Browser equivalent of QuaviMapArtwork.swift. Google's Advanced Marker owns projection;
// the original brand artwork and motion remain DOM layers, never zoom-dependent bitmaps.
export function quaviWebMarker(AdvancedMarkerElement, record, options, existing){
 const m=options.quavi
 const marker=existing??new AdvancedMarkerElement({map:record.map,position:options.coordinate})
 marker.position=options.coordinate;marker.title=options.title;marker.zIndex=options.zIndex
 marker.__quaviKey=m.key;marker.__quavi=m
 const signature=JSON.stringify(m)
 if(marker.__quaviSignature!==signature){
  const root=document.createElement('div');root.className='quavi-map-art quavi-art-'+m.kind
  root.style.cssText='position:relative;width:0;height:0;overflow:visible'
  const body=document.createElement('img');body.className='quavi-art-body';body.src=m.bodyUrl;body.alt=''
  Object.assign(body.style,{position:'absolute',width:m.width+'px',height:m.height+'px',left:-m.anchorX+'px',top:-m.anchorY+'px'})
  if(m.kind==='you'||m.kind==='current'){
   const ring=document.createElement('span');ring.className='quavi-art-pulse'
   const d=m.kind==='you'?74:70
   Object.assign(ring.style,{position:'absolute',left:(m.width/2-m.anchorX-d/2)+'px',top:(-m.anchorY+(m.kind==='you'?38:20)-d/2)+'px',width:d+'px',height:d+'px'})
   root.append(ring)
  }
  root.append(body)
  const label=document.createElement('img');label.className='quavi-art-label';label.alt='';label.src=m.labelUrl
  Object.assign(label.style,{position:'absolute',width:m.labelWidth+'px',height:m.labelHeight+'px'})
  root.append(label);root.style.pointerEvents=m.interactive?'auto':'none'
  marker.content=root;marker.__quaviRoot=root;marker.__quaviLabel=label;marker.__quaviSignature=signature
 }
 if(!record.__quaviListeners){
  record.__quaviListeners=['bounds_changed','idle'].map(event=>record.map.addListener(event,()=>refreshWebArtwork(record)))
 }
 refreshWebArtwork(record);return marker
}
export function refreshWebArtwork(record){
 cancelAnimationFrame(record.__quaviFrame)
 record.__quaviFrame=requestAnimationFrame(()=>{
  const bounds=record.map.getDiv().getBoundingClientRect(),padding=record.__quaviPadding??{top:0,bottom:0}
  const safe={left:bounds.left+10,right:bounds.right-10,top:bounds.top+padding.top+4,bottom:bounds.bottom-Math.max(36,padding.bottom+24)}
  const priority=m=>m.kind==='you'?100:m.selected?90:m.kind==='current'?80:m.kind==='dest'?70:m.kind==='coin'?0:20
  const items=Object.values(record.markers).filter(m=>m.__quaviRoot).sort((a,b)=>priority(b.__quavi)-priority(a.__quavi)||a.__quaviKey.localeCompare(b.__quaviKey))
  const bodyRects=items.map(marker=>{
   const point=marker.__quaviRoot.getBoundingClientRect(),m=marker.__quavi
   return{marker,x:point.left-m.anchorX,y:point.top-m.anchorY,w:m.width,h:m.height,point}
  })
  const overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y
  const occupied=[]
  for(const b of bodyRects){
   const m=b.marker.__quavi,label=b.marker.__quaviLabel,root=b.marker.__quaviRoot
   const visible=b.x+b.w>bounds.left&&b.x<bounds.right&&b.y+b.h>bounds.top&&b.y<bounds.bottom
   root.classList.toggle('quavi-art-paused',!visible||document.hidden)
   root.style.zIndex=String(priority(m))
   label.hidden=!visible||!m.labelUrl||(m.quest&&!m.selected&&record.map.getZoom()<16.25)
   if(label.hidden)continue
   const w=m.labelWidth,h=m.labelHeight
   const candidates=[{x:b.x+b.w/2-w/2,y:b.y+b.h+3,w,h},{x:b.x+b.w+7,y:b.y+b.h/2-h/2,w,h},{x:b.x-w-7,y:b.y+b.h/2-h/2,w,h},{x:b.x+b.w/2-w/2,y:b.y-h-5,w,h}]
   const target=candidates.map(r=>({...r,x:Math.max(safe.left,Math.min(r.x,safe.right-w))})).find(r=>r.y>=safe.top&&r.y+h<=safe.bottom&&!bodyRects.some(other=>other.marker.__quavi.kind!=='coin'&&overlaps(r,other))&&!occupied.some(other=>overlaps(r,other)))
   if(target){label.style.left=target.x-b.point.left+'px';label.style.top=target.y-b.point.top+'px';occupied.push({...target,x:target.x-3,y:target.y-3,w:w+6,h:h+6})}else label.hidden=true
  }
 })
}
export function disposeWebArtwork(record){
 cancelAnimationFrame(record.__quaviFrame)
 record.__quaviListeners?.forEach(listener=>listener.remove())
 for(const marker of Object.values(record.markers))if(marker.__quaviRoot)marker.map=null
}
