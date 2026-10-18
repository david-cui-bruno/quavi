import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'
import { usableFix, type LocationAdapter } from './location-session.mjs'
const options = { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
export const locationAdapter: LocationAdapter = {
  async permission(prompt) {
    if (Capacitor.isNativePlatform()) {
      let permission = await Geolocation.checkPermissions()
      if (prompt && permission.location !== 'granted' && permission.location !== 'denied') permission = await Geolocation.requestPermissions({permissions:['location']})
      return permission.location
    }
    if (!navigator.geolocation) return 'denied'
    try { const p = await navigator.permissions.query({name:'geolocation'}); return p.state === 'prompt' && prompt ? 'granted' : p.state }
    catch { return prompt ? 'granted' : 'denied' }
  },
  watch: callback => Geolocation.watchPosition(options, callback),
  clear: id => Geolocation.clearWatch({id}),
}
export async function currentLocation() {
  if (await locationAdapter.permission(true) !== 'granted') throw Object.assign(new Error('Location access is off'),{code:'1'})
  const fix = await Geolocation.getCurrentPosition(options)
  if (!usableFix(fix)) throw new Error('GPS is not precise enough yet. Enable Precise Location for Quavi and try again outdoors.')
  return fix
}
