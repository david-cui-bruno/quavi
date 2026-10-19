import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'
const url=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64')
async function compile(file,imports={}){
 let code=ts.transpileModule(await readFile(new URL(file,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.ESNext}}).outputText
 for(const[from,to]of Object.entries(imports))code=code.replaceAll(`from '${from}'`,`from '${to}'`).replaceAll(`from "${from}"`,`from "${to}"`)
 return url(code)
}
const geo=await compile('../src/geo.ts')
const rules=await compile('../server/src/reward-rules.ts')
const data=await compile('../src/data.ts',{'./geo':geo,'../server/src/reward-rules':rules,'./captions.mjs':new URL('../src/captions.mjs',import.meta.url).href})
const {replacePlannedStop,applyPlannedCheck}=await import(await compile('../src/route-edit.ts',{'./data':data,'./geo':geo}))
const ll={lat:40.73,lng:-74}
const chapter=(place,dx)=>({place,title:place,ll:{lat:ll.lat+dx,lng:ll.lng},mins:10,meta:'Old hours',walk:'1 min walk',persona:'Pip',color:'Orange',at:[0,0],alts:[],placeId:'catalog-'+place,googlePlaceId:'google-'+place,hours:{status:'open'},googleRoute:true})
const story=()=>({id:'outing',chapters:[chapter('Cafe',0),chapter('Books',.002),chapter('Park',.004)],origin:ll,timeBudgetMinutes:60,walking:{provider:'Google Maps'},estimatedMinutes:40,captions:['Old caption'],moments:{},taskNotes:{},taskPhotos:{}})
const choice={place:'New Gallery',ll:{lat:40.733,lng:-73.998},meta:'Art gallery',kind:'Art gallery',persona:'Juno',color:'Orange'}
const check=()=>({provider:'Google Maps',checkedAt:'now',duration:600,distance:700,legs:[{duration:200,distance:200},{duration:200,distance:250},{duration:200,distance:250}],hours:[0,1,2].map(i=>({status:'open',googlePlaceId:'new-'+i}))})
test('chosen stops invalidate old place identity and route checks before applying a full new check',()=>{
 const original=story(),next=replacePlannedStop(original,1,choice,false)
 assert.equal(next.chapters[1].place,'New Gallery')
 assert.equal(next.chapters[1].googlePlaceId,undefined)
 assert.equal(next.chapters[1].placeId,undefined)
 assert.equal(next.walking,undefined)
 assert.ok(next.chapters.every(c=>!c.hours))
 assert.equal(original.chapters[1].place,'Books','the old plan is untouched until validation succeeds')
 const applied=applyPlannedCheck(next,check())
 assert.equal(applied.estimatedMinutes,40)
 assert.equal(applied.chapters[1].googlePlaceId,'new-1')
 assert.deepEqual(applied.walking.legs,check().legs)
})
test('route editing rejects duplicate, adult, invalid, started and over-budget changes',()=>{
 assert.throws(()=>replacePlannedStop(story(),1,{...choice,ll},true),/already/)
 assert.throws(()=>replacePlannedStop(story(),1,{...choice,place:'Cocktail bar'},false),/age-restricted/)
 assert.throws(()=>replacePlannedStop(story(),1,{...choice,ll:{lat:999,lng:0}},true),/location/)
 assert.throws(()=>replacePlannedStop({...story(),status:'active'},1,choice,true),/before starting/)
 const next=replacePlannedStop(story(),1,choice,true)
 assert.throws(()=>applyPlannedCheck(next,{...check(),duration:4000}),/more time/)
 assert.throws(()=>applyPlannedCheck(next,{...check(),hours:[]}),/incomplete/)
 assert.throws(()=>applyPlannedCheck(next,{...check(),hours:check().hours.map(h=>({...h,status:'closed'}))}),/closed/)
})
