import { initializeApp } from 'firebase/app'
import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, type User } from 'firebase/auth'
import config from './cloud-config.json'

export const auth = initializeAuth(initializeApp(config.firebase), { persistence: [indexedDBLocalPersistence, browserLocalPersistence] })
export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}
export async function api<T>(user: User, path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  const token = await user.getIdToken()
  const response = await fetch(`${config.apiUrl}/v1/me${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'X-Quavi-Maps': 'google', 'X-Quavi-Outings':'1', 'X-Quavi-Rewards':'1', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: signal ? AbortSignal.any([signal,AbortSignal.timeout(path === '/detours' ? 60000 : 30000)]) : AbortSignal.timeout(path === '/detours' ? 60000 : 30000),
  })
  const data = await response.json()
  if (!response.ok) throw new ApiError(response.status, data.error || 'Could not connect. Try again.')
  return data as T
}
const photos = new Map<string, Promise<string>>()
export function clearPhotoCache() { photos.clear() }
export function resolvePhoto(src: string): Promise<string> {
  const shared=/^quavi-shared:([0-9a-f-]{36}):([0-9a-f-]{36})$/.exec(src)
  if (!src.startsWith('quavi-media:') && !shared) return Promise.resolve(src)
  const user = auth.currentUser
  if (!user) return Promise.reject(new Error('Sign in to see this photo.'))
  if(shared)return api<{url:string}>(user,`/social/posts/${shared[1]}/media/${shared[2]}`).then(({url})=>url)
  const key = user.uid + ':' + src
  if (!photos.has(key)) {
    const job = api<{ url: string }>(user, '/media/' + src.slice(12)).then(async ({ url }) => {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) })
      if (!response.ok) throw new Error('Photo unavailable. Try again online.')
      const blob = await response.blob()
      return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob) })
    }).catch((e) => { photos.delete(key); throw e })
    photos.set(key, job)
  }
  return photos.get(key)!
}
export function photoUploader(user: User) {
  const uploaded = new Map<string, string>()
  async function walk(value: unknown): Promise<unknown> {
    if (typeof value === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(value)) {
      if (uploaded.has(value)) return uploaded.get(value)
      const blob = await (await fetch(value)).blob()
      if (blob.size > 8 * 1024 * 1024) throw new Error('Photo exceeds 8 MiB. Choose a smaller photo.')
      const grant = await api<{ id: string; upload: { url: string; fields: Record<string, string> } }>(user, '/media', 'POST', { contentType: blob.type, bytes: blob.size })
      const form = new FormData()
      Object.entries(grant.upload.fields).forEach(([key, val]) => form.append(key, val))
      form.append('file', blob)
      const response = await fetch(grant.upload.url, { method: 'POST', body: form, signal: AbortSignal.timeout(60000) })
      if (!response.ok) throw new Error('Photo upload failed. Your changes remain on this device.')
      await api(user, '/media/' + grant.id + '/complete', 'POST')
      const ref = 'quavi-media:' + grant.id
      uploaded.set(value, ref); photos.set(user.uid + ':' + ref, Promise.resolve(value))
      return ref
    }
    if (Array.isArray(value)) { const result = []; for (const item of value) result.push(await walk(item)); return result }
    if (value && typeof value === 'object') {
      const result: Record<string, unknown> = {}
      for (const [key, item] of Object.entries(value)) result[key] = await walk(item)
      return result
    }
    return value
  }
  return walk
}
export function accountError(error: unknown): string {
  const code = (error as { code?: string }).code
  if (code === 'auth/invalid-credential' || code === 'auth/user-not-found' || code === 'auth/wrong-password') return 'Email or password is incorrect. Try again or reset your password.'
  if (code === 'auth/email-already-in-use') return 'This email already has an account. Log in instead.'
  if (code === 'auth/too-many-requests') return 'Too many attempts. Please wait a few minutes.'
  if (code === 'auth/network-request-failed') return 'You’re offline. Connect and try again.'
  return error instanceof ApiError ? error.message : 'Could not finish. Check your connection and try again.'
}
