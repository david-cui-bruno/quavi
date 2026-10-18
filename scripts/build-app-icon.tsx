import { renderToStaticMarkup } from 'react-dom/server'
import { Resvg } from '@resvg/resvg-js'
import { writeFileSync } from 'node:fs'
import { Logo } from '../src/brand/Persona'
// Render the existing brand vector, centered on the same ink background as the welcome badge.
const logo = renderToStaticMarkup(<Logo size={534} />)
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#1E1B16"/><g transform="translate(245 161)">${logo}</g></svg>`
writeFileSync('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png',new Resvg(svg).render().asPng())
