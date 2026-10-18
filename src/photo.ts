import { resolvePhoto } from './cloud'
import type { Story } from './data'

/** Read an image file and shrink it so it's cheap to keep in localStorage and to share (max 1000px, JPEG). */
export function photoFromFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Unsupported image'))
      img.onload = () => {
        const k = Math.min(1, 1000 / Math.max(img.width, img.height))
        const c = document.createElement('canvas')
        c.width = Math.round(img.width * k)
        c.height = Math.round(img.height * k)
        c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height)
        resolve(c.toDataURL('image/jpeg', 0.82))
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

/** The story's photos as File objects, for the native share sheet. */
export async function photoFiles(s: Story): Promise<File[]> {
  const urls = Object.values(s.taskPhotos ?? {})
  return Promise.all(urls.map(async (u, i) => new File([await (await fetch(await resolvePhoto(u))).blob()], `quavi-${i + 1}.jpg`, { type: 'image/jpeg' })))
}
