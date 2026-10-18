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
