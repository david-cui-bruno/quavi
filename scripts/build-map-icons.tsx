import {writeFileSync} from 'node:fs'
import {Resvg} from '@resvg/resvg-js'
import {BODY_PLAIN} from '../src/brand/Persona'
const colors={quest:'#EE6A2C',dest:'#1E1B16',current:'#F9CB2F',done:'#1E1B16',locked:'#E8E1CC',start:'#1E1B16',you:'#F9CB2F'}
for(const [kind,color]of Object.entries(colors)){
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-8 18 160 220" width="80" height="110"><path d="${BODY_PLAIN}" fill="${color}" stroke="#1E1B16" stroke-width="5"/>${kind==='done'?'<path d="M44 105L66 125L102 80" fill="none" stroke="#F9CB2F" stroke-width="13"/>':''}${kind==='you'?'<circle cx="72" cy="95" r="27" fill="#F7F4EC"/><circle cx="82" cy="98" r="16" fill="#1E1B16"/>':''}</svg>`
 writeFileSync(`public/map-icons/${kind}.png`,new Resvg(svg).render().asPng())
}
