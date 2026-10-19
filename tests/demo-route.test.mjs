import test from 'node:test'
import assert from 'node:assert/strict'
import {demoWalk,resumeDemoWalk} from '../src/demo-route.mjs'
import legs from '../src/demo-walks.json' with {type:'json'}
test('every authored demo leg uses its network geometry and unmatched stops draw no made-up route',()=>{
 for(const l of legs){assert.deepEqual(demoWalk([l.from,l.to]),l.geometry);assert.ok(l.geometry.length>2);for(const [a,b] of [[l.from,l.geometry[0]],[l.to,l.geometry.at(-1)]])assert.ok(Math.hypot((a.lat-b.lat)*111000,(a.lng-b.lng)*84000)<100)}
 assert.deepEqual(demoWalk([legs[0].from,{lat:41,lng:-73}]),[])
})
test('a resumed demo walk starts at the current street segment and retains future corners',()=>{
 const path=[{lat:40,lng:-74},{lat:40,lng:-73.999},{lat:40.001,lng:-73.999},{lat:40.001,lng:-73.998}]
 const pos={lat:40.0005,lng:-73.999}
 const rest=resumeDemoWalk(path,pos)
 assert.ok(Math.abs(rest[0].lat-pos.lat)<.000001);assert.deepEqual(rest.slice(1),path.slice(2));assert.ok(!rest.includes(path[0]));assert.deepEqual(resumeDemoWalk([],pos),[])
})
