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
 assert.throws(()=>replacePlannedStop(story(),1,{...choice,place:'Cafe',ll},true),/already/)
 assert.throws(()=>replacePlannedStop(story(),1,{...choice,place:'Cocktail bar'},false),/age-restricted/)
 assert.throws(()=>replacePlannedStop(story(),1,{...choice,ll:{lat:999,lng:0}},true),/location/)
 assert.throws(()=>replacePlannedStop({...story(),status:'active'},1,choice,true),/before starting/)
 const next=replacePlannedStop(story(),1,choice,true)
 assert.throws(()=>applyPlannedCheck(next,{...check(),duration:4000}),/more time/)
 assert.throws(()=>applyPlannedCheck(next,{...check(),hours:[]}),/incomplete/)
 assert.equal(applyPlannedCheck(next,{...check(),hours:check().hours.map(h=>({...h,status:'closed'}))}).chapters.length,3,'a plan for later accepts currently closed stops')
 assert.throws(()=>applyPlannedCheck(next,{...check(),hours:check().hours.map(h=>({...h,venueStatus:'unsuitable'}))}),/suitable/)
})

test('reopening a saved route creates an independent planned outing without stale checks or progress',async()=>{
 const {reopenSavedPlan}=await import(await compile('../src/route-edit.ts',{'./data':data,'./geo':geo}))
 const saved={...story(),moments:{0:{note:'Original'}},taskNotes:{'0:x':'original'},arrivedStops:[0],rating:5}
 const reopened=reopenSavedPlan(saved)
 assert.notEqual(reopened.id,saved.id)
 assert.equal(reopened.outingPhase,'planned')
 assert.equal(reopened.walking,undefined)
 assert.ok(reopened.chapters.every(c=>!c.hours))
 assert.deepEqual(reopened.taskNotes,{})
 assert.equal(saved.taskNotes['0:x'],'original')
 assert.equal(saved.chapters[0].hours.status,'open')
})

test('rough spend ranges use stop categories, include free outings and remain explicitly USD',async()=>{
 const {estimateSpend}=await import(await compile('../src/spend-estimate.ts'))
 assert.deepEqual(estimateSpend({chapters:[{kind:'Park'},{kind:'Library'}]}),{low:0,high:0,currency:'USD',label:'Free'})
 const cafeBook=estimateSpend({chapters:[{kind:'Café'},{kind:'Bookshop'},{kind:'Park'}]})
 assert.deepEqual(cafeBook,{low:5,high:40,currency:'USD',label:'$5–40'})
 assert.ok(estimateSpend({chapters:[{kind:'Unknown'}]}).high>0)
})

test('swapping accepts a distinct business next door to another route stop',()=>{
 const selected={...choice,place:'Next Door Gallery',placeId:'catalog-gallery',ll:{lat:ll.lat+.0001,lng:ll.lng}}
 assert.doesNotThrow(()=>replacePlannedStop(story(),1,selected,true))
})
test('swapping accepts a different branch of the same named business',()=>{
 const selected={...choice,place:'Cafe',placeId:'catalog-cafe-other-branch',ll:{lat:40.74,lng:-74}}
 assert.doesNotThrow(()=>replacePlannedStop(story(),1,selected,true))
})

test('the same catalog venue or a nearby spelling alias still cannot be added twice',()=>{
 assert.throws(()=>replacePlannedStop(story(),1,{...choice,placeId:'catalog-Cafe'},true),/already/)
 assert.throws(()=>replacePlannedStop(story(),1,{...choice,place:'Café!',ll:{lat:ll.lat+.00001,lng:ll.lng}},true),/already/)
})
