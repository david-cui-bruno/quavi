import test from 'node:test';import assert from 'node:assert/strict';
import {evaluateHours,matchPlace,googlePlace,type GooglePlace} from '../src/google-hours.js';
import {parseGoogleRoute} from '../src/google-geo.js';
import {scrubGoogleContent as scrub} from '../src/google-retention.js';
const ll={lat:40.73,lng:-74};
const base=()=>googlePlace.parse({id:'test-id',displayName:{text:'Corner Café'},location:{latitude:40.73,longitude:-74},businessStatus:'OPERATIONAL',attributions:[]});
const m=(day:number,date:number,hour:number,minute=0)=>({day,hour,minute,date:{year:2026,month:10,day:date}});
const hour=(p:GooglePlace,a:string,b:string,now='2026-10-18T00:00:00Z')=>evaluateHours(p,ll,new Date(a),new Date(b),new Date(now)).status;
test('venue identity rejects similarly named, distant and ambiguous matches',()=>{assert.equal(matchPlace([base()],'Corner Cafe',ll)?.id,'test-id');assert.equal(matchPlace([base()],'Other Cafe',ll),undefined);assert.equal(matchPlace([base()],'Corner Cafe',{lat:41,lng:-74}),undefined);assert.equal(matchPlace([base(),{...base(),id:'other'}],'Corner Cafe',ll),undefined)});
test('local dated hours cover the entire visit and support overnight intervals',()=>{
 const p={...base(),currentOpeningHours:{periods:[{open:m(6,17,18),close:m(0,18,2)}]}};
 assert.equal(hour(p,'2026-10-18T03:00Z','2026-10-18T04:00Z'),'open');
 assert.equal(hour(p,'2026-10-18T05:50Z','2026-10-18T06:10Z'),'closed');
});
test('holiday-specific periods override optimistic openNow and closed business status wins',()=>{
 const p={...base(),currentOpeningHours:{openNow:true,periods:[{open:m(0,18,10),close:m(0,18,12)}]}};
 assert.equal(hour(p,'2026-10-18T14:00Z','2026-10-18T16:00Z'),'open');assert.equal(hour(p,'2026-10-18T15:50Z','2026-10-18T16:10Z'),'closed');assert.equal(hour({...p,businessStatus:'CLOSED_TEMPORARILY'},'2026-10-18T14:00Z','2026-10-18T15:00Z'),'closed');
});
test('missing or truncated hours and ambiguous DST times stay unknown',()=>{
 assert.equal(hour(base(),'2026-10-18T14:00Z','2026-10-18T15:00Z'),'unknown');
 const p={...base(),currentOpeningHours:{periods:[{open:{...m(0,18,10),truncated:true},close:m(0,18,12)}]}};assert.equal(hour(p,'2026-10-18T14:00Z','2026-10-18T15:00Z'),'unknown');
 const dst={...base(),currentOpeningHours:{periods:[{open:{day:0,hour:1,minute:30,date:{year:2026,month:11,day:1}},close:{day:0,hour:3,minute:0,date:{year:2026,month:11,day:1}}}]}};
 assert.equal(hour(dst,'2026-11-01T06:00Z','2026-11-01T07:00Z','2026-10-31T12:00Z'),'unknown');
});
test('24/7 and exact next-change timestamps are handled without guessing',()=>{
 const p={...base(),currentOpeningHours:{periods:[{open:{day:0,hour:0,minute:0}}]}};assert.equal(hour(p,'2026-10-18T14:00Z','2026-10-18T15:00Z'),'open');
 assert.equal(hour({...base(),currentOpeningHours:{openNow:false,nextOpenTime:'2026-10-18T15:00:00Z'}},'2026-10-18T14:00Z','2026-10-18T14:30Z'),'closed');
});
const points=[ll,{lat:40.731,lng:-74}];
const route=()=>({routes:[{distanceMeters:140,duration:'140s',warnings:['Watch local conditions'],polyline:{geoJsonLinestring:{coordinates:[[-74,40.73],[-74,40.731]]}},legs:[{distanceMeters:140,duration:'140s',startLocation:{latLng:{latitude:40.73,longitude:-74}},endLocation:{latLng:{latitude:40.731,longitude:-74}},steps:[{distanceMeters:140,staticDuration:'140s',polyline:{geoJsonLinestring:{coordinates:[[-74,40.73],[-74,40.731]]}},navigationInstruction:{maneuver:'DEPART',instructions:'Head north'}}]}]}]});
test('Google walking parsing keeps instructions and warnings and rejects remote snaps or invalid geometry',()=>{
 const r=parseGoogleRoute(route(),points);assert.equal(r?.provider,'Google Maps');assert.equal(r?.steps[0].maneuver.instruction,'Head north');assert.ok(r?.warnings.includes('Watch local conditions'));
 const remote=route();remote.routes[0].legs[0].endLocation.latLng.latitude=41;assert.equal(parseGoogleRoute(remote,points),null);
 const missing=route();missing.routes[0].legs=[];assert.equal(parseGoogleRoute(missing,points),null);
 assert.equal(parseGoogleRoute({routes:[]},points),null);
});
test('Google content never reaches durable state while independent data, identifiers and personal notes survive',async()=>{
 const input={story:{source:{provider:'Overture Maps'},walking:{provider:'Google Maps',distance:42},estimatedMinutes:60,timeBudgetMinutes:60,chapters:[{kind:'Cafe',place:'Independent venue name',ll,googlePlaceId:'id',googleRoute:true,hours:{status:'open'},meta:'reported open for your visit',walk:'3 min walk',walking:{distance:42}}],moments:{0:{note:'My own note',img:'quavi-media:example'}}}};
 const expected=scrub(input);assert.ok(!JSON.stringify(expected).includes('reported open'));assert.ok(!JSON.stringify(expected).includes('"hours"'));assert.equal(expected.story.chapters[0].googlePlaceId,'id');assert.equal(expected.story.moments[0].note,'My own note');assert.equal(expected.story.source.provider,'Overture Maps');assert.equal(expected.story.timeBudgetMinutes,60);
 const client=await import('../../src/google-retention.mjs');assert.deepEqual(client.scrubGoogleContent(input),expected);
});

test('a closed stop is replaced with a nearby available alternative rather than discarding the whole outing',async()=>{
 const {checkedDetours}=await import('../src/checked-detours.js');const {detourInput}=await import('../src/detours.js');
 const input=detourInput.parse({origin:ll,label:'Test',interests:['cozy'],minutes:60});
 const raw={updatedAt:new Date().toISOString(),venues:['coffee_shop','bookstore','park','bakery','arcade','art_gallery'].map((kind,i)=>({id:String(i),name:'Place '+i,kind,ll:{lat:40.7305+i*.0006,lng:-74},confidence:.99,status:'open'}))};
 let calls=0;const closed=raw.venues[0].name;
 const geo={async check(){calls++;return {provider:'Google Maps',checkedAt:new Date().toISOString(),legs:Array(3).fill({distance:200,duration:180}),distance:600,duration:540}},async navigate(){return null},async place(name:string,point:typeof ll){return googlePlace.parse({id:name,displayName:{text:name},location:{latitude:point.lat,longitude:point.lng},businessStatus:name===closed?'CLOSED_TEMPORARILY':'OPERATIONAL',currentOpeningHours:{periods:[{open:{day:0,hour:0,minute:0}}]}})}};
 const result=await checkedDetours(raw,input,geo,geo);assert.ok(result.openings.length);assert.ok(result.openings.every(o=>o.chapters.every(c=>c.place!==closed)));assert.ok(calls<=6);assert.equal(new Set(result.openings.map(o=>o.id)).size,result.openings.length)
});

test('venue photo URLs keep author/source credit and reject unsafe media locations',async()=>{
 const {photoResult}=await import('../src/google-geo.js');
 const p=googlePlace.parse({...base(),photos:[{name:'places/test-id/photos/photo1',googleMapsUri:'https://www.google.com/maps/place/?photo=1',authorAttributions:[{displayName:'Venue owner',uri:'//maps.google.com/maps/contrib/123',photoUri:'https://lh3.googleusercontent.com/avatar'}]}]});
 const photo=p.photos![0],r=photoResult(p,photo,{photoUri:'https://lh3.googleusercontent.com/place-image'});
 assert.equal(r?.placeName,'Corner Café');assert.equal(r?.authors[0].url,'https://maps.google.com/maps/contrib/123');assert.equal(r?.mapsUrl,photo.googleMapsUri);
 assert.equal(photoResult(p,photo,{photoUri:'javascript:alert(1)'}),null);
 assert.equal(photoResult(p,photo,{photoUri:'https://attacker.example/place.jpg'}),null);
 assert.equal(photoResult(p,{...photo,googleMapsUri:undefined},{photoUri:'https://lh3.googleusercontent.com/place-image'}),null);
 const ephemeral={...p,venuePhoto:r,photoUri:r?.url};
 assert.equal(scrub(ephemeral).photos,undefined);assert.equal(scrub(ephemeral).venuePhoto,undefined);assert.equal(scrub(ephemeral).photoUri,undefined);
});
