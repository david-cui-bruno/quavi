import {readFile,writeFile} from 'node:fs/promises'
// @capacitor/google-maps 8.0.1 registers its readiness listener after native creation.
// On iOS the event can already have fired. Register first; fail loudly on dependency drift.
const file=new URL('../node_modules/@capacitor/google-maps/dist/esm/map.js',import.meta.url)
let source=await readFile(file,'utf8')
const marker='// Quavi: listen before creation so the native map-ready event cannot be missed.'
if(!source.includes(marker)){
 const start=source.indexOf('        if (callback) {\n            const onMapReadyListener')
 const end=source.indexOf('        return newMap;',start)
 const anchor='        // small delay to allow for iOS'
 if(start<0||end<start||!source.includes(anchor)||source.slice(start,end).split('if (callback)').length!==2)throw new Error('Google Maps readiness patch needs review for this SDK version')
 const listener=source.slice(start,end)
 source=source.slice(0,start)+source.slice(end)
 source=source.replace(anchor,'        '+marker+'\n'+listener+anchor)
 await writeFile(file,source)
}
console.log('Google Maps readiness patch applied')
