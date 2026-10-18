import { useEffect, useState, type ImgHTMLAttributes } from 'react'
import { resolvePhoto } from './cloud'

export function Photo({ src = '', alt = '', ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const [result, setResult] = useState({ source: '', src: '', error: false })
  useEffect(() => {
    let active = true
    resolvePhoto(src).then((url) => { if (active) setResult({ source: src, src: url, error: false }) }).catch(() => { if (active) setResult({ source: src, src: '', error: true }) })
    return () => { active = false }
  }, [src])
  if (!src.startsWith('quavi-media:') && !src.startsWith('quavi-shared:') && !src.startsWith('quavi-moderation:')) return <img {...props} src={src} alt={alt} />
  return result.source === src && result.src ? <img {...props} src={result.src} alt={alt} /> : <span style={{ ...props.style, display: 'grid', placeItems: 'center', background: 'var(--soft)' }} role="img" aria-label={alt || 'Story photo'}>{result.source === src && result.error ? 'Photo needs a connection' : 'Loading photo…'}</span>
}
