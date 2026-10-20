import {isDrinkPlace, type Alt, type Story, type WalkingCheck, type HoursCheck} from './data'
import {distance} from './geo'

/** Editing is only allowed before the walk starts; old checks must not follow a new stop. */
export function replacePlannedStop(story: Story, index: number, place: Alt, age21?: boolean): Story {
  if (story.status || story.outingPhase && story.outingPhase !== 'planned') throw new Error('Stops can be customized before starting the walk. Start a new plan to choose different places.')
  if (!story.chapters[index]) throw new Error('Choose a stop to replace.')
  if (!place.ll || !Number.isFinite(place.ll.lat) || !Number.isFinite(place.ll.lng) || Math.abs(place.ll.lat)>85 || Math.abs(place.ll.lng)>180) throw new Error('Choose a search result with a map location.')
  if (age21 !== true && isDrinkPlace(`${place.place} ${place.kind??''}`)) throw new Error('Choose a place without an age-restricted drinking venue.')
  if (story.chapters.some((c,i)=>i!==index&&(c.place.trim().toLowerCase()===place.place.trim().toLowerCase() || c.ll&&distance(c.ll,place.ll!)<40))) throw new Error('That place is already in this opening. Choose a different stop.')
  const chapters=story.chapters.map((chapter,i)=>{
    const {hours:_hours,googlePlaceId:_id,placeId:_catalogId,googleRoute:_google,walk:_walk,...original}=chapter
    if(i!==index)return {...chapter,hours:undefined,walk:'Check walking route'}
    return {...original,title:place.place,place:place.place,placeId:place.placeId,meta:place.meta,persona:place.persona,color:place.color,ll:place.ll,kind:place.kind,aliases:place.aliases,desc:`Your chosen stop: ${place.place}. Check entry requirements and prices.`,walk:'Check walking route'}
  })
  return {...story,chapters,walking:undefined,estimatedMinutes:undefined,captions:[]}
}

export function applyPlannedCheck(story: Story, check: WalkingCheck & {hours:HoursCheck[]}): Story {
  if(check.hours.length!==story.chapters.length || check.legs.length!==story.chapters.length) throw new Error('The route check is incomplete. Try again.')
  const estimatedMinutes=Math.ceil(check.duration/60)+story.chapters.reduce((sum,c)=>sum+c.mins,0)
  if(estimatedMinutes>(story.timeBudgetMinutes??120)) throw new Error('These stops need more time than your plan allows. Choose a closer place or generate a longer opening.')
  if(check.hours.some(h=>h.venueStatus==='unsuitable')) throw new Error('A stop does not match a suitable visit venue. Choose another place.')
  const {hours,...walking}=check
  return {...story,walking,estimatedMinutes,chapters:story.chapters.map((c,i)=>({...c,hours:hours[i],googlePlaceId:hours[i].googlePlaceId,googleRoute:true,walk:`${Math.max(1,Math.ceil(walking.legs[i].duration/60))} min walk`}))}
}

/** A saved plan is a template; starting it again gets a separate outing journal. */
export function reopenSavedPlan(plan: Story): Story {
  return {...plan,id:crypto.randomUUID(),status:undefined,outingPhase:'planned',walking:undefined,
    chapters:plan.chapters.map(c=>({...c,hours:undefined,googleRoute:undefined})),
    moments:{},captions:[],taskNotes:{},taskPhotos:{},arrivedStops:[],rating:undefined,loved:undefined,shared:false,
    date:new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'})}
}
