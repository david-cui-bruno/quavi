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

// iOS only supports bundled/remote images upstream. Allow bounded, locally generated PNGs
// so custom avatars and place labels never need to be uploaded to an image service.
const swiftFile=new URL('../node_modules/@capacitor/google-maps/ios/Sources/CapacitorGoogleMapsPlugin/Map.swift',import.meta.url)
let swift=await readFile(swiftFile,'utf8')
const pngMarker='// Quavi: local PNG marker art (no network or persistent cache).'
if(!swift.includes(pngMarker)){
 const anchor='            if let iconImage = self.markerIcons[iconUrl] {'
 if(swift.split(anchor).length!==2)throw new Error('Google Maps local PNG patch needs review for this SDK version')
 swift=swift.replace(anchor,`            ${pngMarker}
            if iconUrl.hasPrefix("data:image/png;base64,"), iconUrl.utf8.count < 524288 {
                let encoded = String(iconUrl.dropFirst(22))
                if let data = Data(base64Encoded: encoded), let image = UIImage(data: data),
                   image.size.width <= 1024, image.size.height <= 1024 {
                    newMarker.icon = getResizedIcon(image, marker)
                }
                return newMarker
            }
${anchor}`)
 await writeFile(swiftFile,swift)
}
console.log('Google Maps local PNG patch applied')

// Google supports repeating stroke styles natively; retain the original dotted walk trail.
const trailMarker='// Quavi: dotted future trail; route geometry is unchanged.'
if(!swift.includes(trailMarker)){
 const anchor='        return newPolyline'
 if(swift.split(anchor).length!==2)throw new Error('Google Maps trail patch needs review for this SDK version')
 swift=swift.replace(anchor,`        ${trailMarker}
        if line.tag == "quavi-future-route" {
            let latitude = path.coordinate(at: 0).latitude
            let metersPerPoint = 156543.03392 * cos(latitude * .pi / 180) / pow(2, Double(self.mapViewController.GMapView.camera.zoom))
            newPolyline.spans = GMSStyleSpans(path,
                [GMSStrokeStyle.solidColor(line.strokeColor), GMSStrokeStyle.solidColor(.clear)],
                [NSNumber(value: metersPerPoint), NSNumber(value: metersPerPoint * 11)], GMSLengthKind.rhumb)
        }
${anchor}`)
 await writeFile(swiftFile,swift)
}
console.log('Google Maps dotted trail patch applied')
