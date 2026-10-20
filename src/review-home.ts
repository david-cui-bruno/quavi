import type { Bg } from './ui'
export type HomeColor = 'orange-p' | 'yellow' | 'paper' | 'ink'
export function homeTone(preference?:HomeColor):Bg {
  const tone=preference??import.meta.env.VITE_REVIEW_HOME
  return tone==='yellow'||tone==='paper'||tone==='ink'||tone==='orange-p'?tone:'orange-p'
}
