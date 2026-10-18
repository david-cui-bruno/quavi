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
if(!swift.includes(trailMarker)&&!swift.includes('// Quavi: round walking dots, stable in screen pixels while zooming.')){
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

// Separate native artwork follows Google's projection; only the artwork animates.
const sdkRoot=new URL('../node_modules/@capacitor/google-maps/ios/Sources/CapacitorGoogleMapsPlugin/',import.meta.url)
await writeFile(new URL('QuaviMapArtwork.swift',sdkRoot),await readFile(new URL('../ios/MapArtwork/QuaviMapArtwork.swift',import.meta.url),'utf8'))
const modelFile=new URL('Marker.swift',sdkRoot)
let model=await readFile(modelFile,'utf8')
if(!model.includes('let quavi: JSObject?')){
 if(!model.includes('    let coordinate: LatLng'))throw new Error('Quavi marker model patch needs review')
 model=model.replace('    let coordinate: LatLng','    let quavi: JSObject?\n    let coordinate: LatLng').replace('        self.coordinate = LatLng','        self.quavi = fromJSObject["quavi"] as? JSObject\n        self.coordinate = LatLng')
 await writeFile(modelFile,model)
}
const artworkMarker='// Quavi: stable projected artwork, separate from SDK marker bitmaps.'
if(!swift.includes(artworkMarker)){
 const anchor='        let newMarker = GMSMarker()'
 if(swift.split(anchor).length!==2)throw new Error('Quavi projected artwork patch needs review')
 swift=swift.replace('    var markerIcons = [String: UIImage]()','    var quaviArtwork: QuaviMapArtwork?\n    var markerIcons = [String: UIImage]()')
 swift=swift.replace(anchor,`        ${artworkMarker}
        let key = marker.quavi?["key"] as? String
        let newMarker = key.flatMap { name in self.markers.values.first { ($0.userData as? JSObject)?["key"] as? String == name } } ?? GMSMarker()`)
 const iconAnchor='        // cache and reuse marker icon uiimages'
 if(!swift.includes(iconAnchor))throw new Error('Quavi artwork image hook needs review')
 swift=swift.replace(iconAnchor,`        if let metadata = marker.quavi {
            newMarker.userData = metadata
            newMarker.opacity = 0
            newMarker.icon = UIGraphicsImageRenderer(size: CGSize(width: 1, height: 1)).image { _ in }
            if self.quaviArtwork == nil { self.quaviArtwork = QuaviMapArtwork(map: self.mapViewController.GMapView) }
            self.quaviArtwork?.upsert(newMarker, metadata: metadata) { [weak self, weak newMarker] in
                guard let self, let newMarker else { return }
                _ = self.delegate.mapView(self.mapViewController.GMapView, didTap: newMarker)
            }
            return newMarker
        }

${iconAnchor}`)
 swift=swift.replace('                    marker.map = nil','                    self.quaviArtwork?.remove(marker)\n                    marker.map = nil')
 swift=swift.replace('            self.mapViewController.GMapView = nil','            self.quaviArtwork?.removeFromSuperview()\n            self.quaviArtwork = nil\n            self.mapViewController.GMapView = nil')
 // The original short opaque spans look like diagonal hatching. A round sprite keeps pixel spacing at every zoom.
 const start=swift.indexOf('        // Quavi: dotted future trail; route geometry is unchanged.')
 const end=swift.indexOf('        return newPolyline',start)
 if(start<0||end<0)throw new Error('Quavi dotted sprite patch needs review')
 swift=swift.slice(0,start)+`        // Quavi: round walking dots, stable in screen pixels while zooming.
        if line.tag == "quavi-future-route" {
            let image = UIGraphicsImageRenderer(size: CGSize(width: 12, height: 5)).image { context in
                line.strokeColor.setFill()
                context.cgContext.fillEllipse(in: CGRect(x: 0, y: 0, width: 5, height: 5))
            }
            let stroke: GMSStrokeStyle
            if self.mapViewController.GMapView.mapCapabilities.contains(.spritePolylines) {
                stroke = GMSStrokeStyle.transparentStroke(withStamp: GMSSpriteStyle(image: image))
            } else {
                stroke = GMSStrokeStyle.solidColor(.clear)
                stroke.stampStyle = GMSTextureStyle(image: image)
            }
            newPolyline.spans = [GMSStyleSpan(style: stroke)]
        }

`+swift.slice(end)
 await writeFile(swiftFile,swift)
}
const delegateFile=new URL('CapacitorGoogleMapsPlugin.swift',sdkRoot)
let delegate=await readFile(delegateFile,'utf8')
if(!delegate.includes('// Quavi: project the original artwork on each native camera frame.')){
 const anchor='    // onCameraIdle'
 if(delegate.split(anchor).length!==2)throw new Error('Quavi camera projection patch needs review')
 delegate=delegate.replace(anchor,`    // Quavi: project the original artwork on each native camera frame.
    public func mapView(_ mapView: GMSMapView, didChange position: GMSCameraPosition) {
        self.maps[self.findMapIdByMapView(mapView)]?.quaviArtwork?.layoutArtwork()
    }

${anchor}`)
 await writeFile(delegateFile,delegate)
}
if(!delegate.includes('// Quavi: resolve artwork taps after Google resolves the gesture.')){
 const anchor='    public func mapView(_ mapView: GMSMapView, didTapAt coordinate: CLLocationCoordinate2D) {'
 if(delegate.split(anchor).length!==2)throw new Error('Quavi artwork tap patch needs review')
 delegate=delegate.replace(anchor,anchor+`
        // Quavi: resolve artwork taps after Google resolves the gesture.
        if self.maps[self.findMapIdByMapView(mapView)]?.quaviArtwork?.handleTap(at: mapView.projection.point(for: coordinate)) == true { return }`)
 await writeFile(delegateFile,delegate)
}
console.log('Quavi stable native artwork patch applied')

// The SDK's 200%-height WebKit placeholder only locates the native view. It is not a scroll surface.
if(!swift.includes('// Quavi: the map container never scrolls or bounces.')){
 const anchor='                    (item as? UIScrollView)?.isScrollEnabled = true'
 if(swift.split(anchor).length!==2)throw new Error('Quavi map scroll-container patch needs review')
 swift=swift.replace(anchor,`                    // Quavi: the map container never scrolls or bounces.
                    (item as? UIScrollView)?.isScrollEnabled = false
                    (item as? UIScrollView)?.bounces = false
                    (item as? UIScrollView)?.alwaysBounceHorizontal = false
                    (item as? UIScrollView)?.alwaysBounceVertical = false`)
 await writeFile(swiftFile,swift)
}

if(!swift.includes('// Quavi: preserve the original north-up, flat map gestures.')){
 const anchor='            self.mapViewController.GMapView.delegate = self.delegate'
 if(swift.split(anchor).length!==2)throw new Error('Quavi map gesture patch needs review')
 swift=swift.replace(anchor,anchor+`
            // Quavi: preserve the original north-up, flat map gestures.
            self.mapViewController.GMapView.settings.rotateGestures = false
            self.mapViewController.GMapView.settings.tiltGestures = false`)
 await writeFile(swiftFile,swift)
}

const webFile=new URL('../node_modules/@capacitor/google-maps/dist/esm/web.js',import.meta.url)
let web=await readFile(webFile,'utf8')
await writeFile(new URL('./quavi-web-artwork.js',webFile),await readFile(new URL('./google-maps-web-artwork.mjs',import.meta.url),'utf8'))
if(!web.includes('// Quavi: stable browser artwork.')){
 web=`import {quaviWebMarker,refreshWebArtwork,disposeWebArtwork} from './quavi-web-artwork.js';\n`+web
 const anchor='        for (const markerArgs of _args.markers) {'
 if(web.split(anchor).length!==2)throw new Error('Quavi browser marker patch needs review')
 web=web.replace(anchor,anchor+`
            // Quavi: stable browser artwork.
            if (markerArgs.quavi) {
                const old = Object.entries(map.markers).find(([, marker]) => marker.__quaviKey === markerArgs.quavi.key);
                const id = old ? old[0] : String(this.currMarkerId++);
                const marker = quaviWebMarker(this.AdvancedMarkerElement, map, markerArgs, old?.[1]);
                map.markers[id] = marker;
                if (!old) await this.setMarkerListeners(_args.id, id, marker);
                markerIds.push(id);
                continue;
            }`)
 web=web.replace('        const bounds = this.maps[_args.id].map.getBounds();','        this.maps[_args.id].__quaviPadding = _args.padding;\n        const bounds = this.maps[_args.id].map.getBounds();')
 web=web.replace("        mapItem.element.innerHTML = '';","        disposeWebArtwork(mapItem);\n        mapItem.element.innerHTML = '';")
 await writeFile(webFile,web)
}

// The web SDK emulates padding by fitting the existing bounds, which zooms on every
// measurement and is overwritten by location following. Apply a stable camera offset.
if(!web.includes('// Quavi: stable web camera padding.')){
 const start=web.indexOf('    async setPadding(_args) {')
 const end=web.indexOf('    async getMapBounds',start)
 if(start<0||end<0)throw new Error('Quavi browser padding patch needs review')
 web=web.slice(0,start)+`    async setPadding(_args) {
        // Quavi: stable web camera padding.
        this.maps[_args.id].__quaviPadding = _args.padding;
        refreshWebArtwork(this.maps[_args.id]);
    }
`+web.slice(end)
 const camera='            zoom: _args.config.zoom,\n        });'
 if(web.split(camera).length!==2)throw new Error('Quavi browser camera offset patch needs review')
 web=web.replace(camera,camera+`
        const p = this.maps[_args.id].__quaviPadding;
        if (p) this.maps[_args.id].map.panBy((p.right-p.left)/2,(p.bottom-p.top)/2);`)
 web=web.replace('        map.fitBounds(bounds, _args.padding);',`        const p = this.maps[_args.id].__quaviPadding;
        const extra = _args.padding ?? 0;
        map.fitBounds(bounds, p ? {top:p.top+extra,bottom:p.bottom+extra,left:p.left+extra,right:p.right+extra} : extra);`)
 await writeFile(webFile,web)
}
