import { useEffect, useState, type ImgHTMLAttributes } from 'react'
import { resolvePhoto } from './cloud'
import { useRuntime } from './runtime'
import { useStore } from './store'

type PhotoProps = ImgHTMLAttributes<HTMLImageElement> & { retryable?: boolean }
/** Reading views may offer retry; editable thumbnails keep their existing parent action. */
export function Photo({ src = '', alt = '', retryable = false, ...props }: PhotoProps) {
  const { account } = useStore()
  const life = useRuntime()
  const accountId = account?.uid
  const managed = /^quavi-(media|shared|moderation):/.test(src)
  const key = (managed ? accountId ?? 'signed-out' : 'local') + ':' + src
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState({ key: '', src: '', error: false })
  useEffect(() => {
    let active = true
    if (!managed || !life.active || !life.online || !accountId) return
    // Keep an already resolved image visible while refreshing; a new account/source
    // never renders the old result. Reconnection also retries previous failures.
    resolvePhoto(src).then(url => {
      if (active) setResult({ key, src: url, error: false })
    }).catch(() => {
      if (active) setResult({ key, src: '', error: true })
    })
    return () => { active = false }
  }, [key, src, accountId, managed, life.active, life.online, life.epoch, attempt])
  if (!managed) return <img {...props} src={src} alt={alt} />
  const failed = result.key === key && result.error
  if (account && result.key === key && result.src) return <img {...props} src={result.src} alt={alt} onError={event => {
    setResult({ key, src: '', error: true })
    props.onError?.(event)
  }} />
  const message = !account ? 'Sign in to see photo' : !life.online ? 'Photo needs a connection' : failed ? 'Photo couldn’t load' : 'Loading photo…'
  return <span className="photo-fallback" style={props.style}>
    <span role="img" aria-label={alt || 'Story photo'}>{message}</span>
    {retryable && account && failed && life.online && <button className="text-action" aria-label={`Retry photo${alt ? ': ' + alt : ''}`} onClick={() => {
      setResult({ key, src: '', error: false })
      setAttempt(n => n + 1)
    }}>Retry photo</button>}
  </span>
}
