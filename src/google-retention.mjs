/** Google responses live only in memory. Keep independent venue data, allowed place IDs and the user's own content. */
export function scrubGoogleContent(value) {
  if (Array.isArray(value)) return value.map(scrubGoogleContent)
  if (!value || typeof value !== 'object') return value
  const googleRoute=value.walking?.provider==='Google Maps'
  const out={}
  for(const [key,item] of Object.entries(value)) {
    if(['hours','googleRoute','venuePhoto','photos','photoUri'].includes(key))continue
    if(googleRoute&&['walking','estimatedMinutes'].includes(key))continue
    if(value.googleRoute&&['walking','walk'].includes(key))continue
    out[key]=scrubGoogleContent(item)
  }
  if(value.googleRoute){out.walk='Check walking route';out.meta=(value.kind??'Stop')+' · hours not checked'}
  return out
}
