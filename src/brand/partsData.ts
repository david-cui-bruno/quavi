// Quavi Persona Kit — parts, transcribed from the brand file (240 x 300 canvas).
// Color keys: K ink · O orange · Q orange-pressed · P paper · Y yellow · G ink-pressed

export const COLOR = {
  K: '#1E1B16',
  O: '#EE6A2C',
  Q: '#F18856',
  P: '#F7F4EC',
  Y: '#F9CB2F',
  G: '#4B4945',
} as const
export type ColorKey = keyof typeof COLOR

export type PathShape = {
  t: 'v'
  x: number
  y: number
  d: string
  fill?: ColorKey
  stroke?: ColorKey
  sw?: number
  round?: boolean
  a?: number
}
export type DotShape = {
  t: 'o'
  x: number
  y: number
  r: number
  fill?: ColorKey
  stroke?: ColorKey
  sw?: number
  a?: number
}
export type Shape = PathShape | DotShape

const v = (
  x: number,
  y: number,
  d: string,
  fill?: ColorKey | null,
  stroke?: ColorKey,
  sw?: number,
  cap?: 'R' | null,
  a?: number,
): Shape => ({ t: 'v', x, y, d, fill: fill ?? undefined, stroke, sw, round: cap === 'R', a })
const o = (
  x: number,
  y: number,
  dia: number,
  fill?: ColorKey,
  stroke?: ColorKey,
  sw?: number,
  a?: number,
): Shape => ({ t: 'o', x, y, r: dia / 2, fill, stroke, sw, a })

export const PARTS: Record<string, Shape[]> = {
  'Hair/Swoop': [v(53.1, 55.8, 'M 0.8 42.1 C -5.1 16.1 20.8 -1.8 52.8 0.1 C 78.8 2.1 92.8 20.1 88.8 36.1 C 76.8 22.1 60.8 20.1 42.8 26.1 C 26.8 32.1 14.8 44.1 0.8 42.1 Z', 'K')],
  'Hair/Top Bun': [v(56, 73.7, 'M 0 28.2 C 2 6.2 28 -1.7 54 0.2 C 80 2.2 94 14.2 92 28.2 C 74 16.2 22 14.2 0 28.2 Z', 'K'), o(101, 49, 30, 'K')],
  'Hair/Afro Puff': [o(58, 56, 48, 'K'), o(84, 44, 52, 'K'), o(116, 60, 44, 'K'), o(46, 82, 28, 'K'), o(142, 84, 28, 'K')],
  'Hair/Mohawk': [v(68, 44, 'M 0 46 L 4 10 L 18 34 L 28 0 L 42 32 L 56 6 L 64 34 L 78 18 L 74 50 C 50 36 22 38 0 46 Z', 'O')],
  'Hair/Long Waves/back': [v(23.4, 64, 'M 68.6 0 C 0.6 8 -9.3 114 6.6 162 C 18.6 146 32.6 142 46.6 124 C 58.6 104 58.6 66 62.6 36 L 68.6 0 Z', 'K')],
  'Hair/Long Waves': [v(54, 65.8, 'M 0 38.1 C 2 12.1 36 -1.8 64 0.1 C 84 2.1 96 16.1 94 30.1 C 80 18.1 58 18.1 40 26.1 C 26 32.1 14 44.1 0 38.1 Z', 'K')],
  'Hair/Ponytail/back': [v(18.2, 92.7, 'M 45.8 1.2 C 7.8 -8.7 -10.1 41.2 5.8 83.2 C 15.8 63.2 27.8 55.2 39.8 41.2 L 45.8 1.2 Z', 'K')],
  'Hair/Ponytail': [v(56, 73.7, 'M 0 28.2 C 2 6.2 28 -1.7 54 0.2 C 80 2.2 94 14.2 92 28.2 C 74 16.2 22 14.2 0 28.2 Z', 'K'), o(49, 97, 14, 'O')],
  'Hair/Curly Top': [o(53, 81, 26, 'K'), o(69, 65, 26, 'K'), o(89, 57, 26, 'K'), o(111, 59, 26, 'K'), o(129, 71, 26, 'K'), o(139, 87, 26, 'K'), o(41, 91, 26, 'K')],
  'Headwear/Beanie': [v(51.9, 59.8, 'M 0 42.1 C -1.9 14.1 28 -1.8 58 0.1 C 88 2.1 104 22.1 102 42.1 L 0 42.1 Z', 'O'), v(48, 94, 'M 8 0 L 102 0 C 106.4 0 110 3.5 110 8 C 110 12.4 106.4 16 102 16 L 8 16 C 3.5 16 0 12.4 0 8 C 0 3.5 3.5 0 8 0 Z', 'K'), o(101, 47, 22, 'P')],
  'Headwear/Cap': [v(56, 63.8, 'M 0 40.2 C 0 10.2 26 -1.7 56 0.2 C 84 2.2 96 20.2 96 40.2 L 0 40.2 Z', 'K'), v(134, 93.7, 'M 0 0.3 C 28 -1.6 54 6.3 60 16.3 C 40 18.3 14 16.3 0 12.3 L 0 0.3 Z', 'O'), o(108, 60, 8, 'O')],
  'Headwear/Bucket Hat': [v(41.9, 90, 'M 0.1 6 C 28.1 -2 102.1 -2 130.1 6 C 132.1 16 112.1 20 66.1 20 C 20.1 20 -1.8 16 0.1 6 Z', 'Q'), v(62, 64, 'M 0 34 C 0 10 20 0 48 0 C 76 0 92 12 94 34 L 0 34 Z', 'O'), v(62, 88, 'M 0 0 C 28 6 68 6 94 0 L 94 10 C 68 16 28 16 0 10 L 0 0 Z', 'K')],
  'Headwear/Beret': [v(53.9, 63.3, 'M 0 32.6 C -1.9 10.6 34 -3.3 68 0.6 C 96 4.6 104 20.6 90 30.6 C 72 40.6 16 42.6 0 32.6 Z', 'K'), v(118, 58, 'M 3 0 C 4.6 0 6 1.3 6 3 L 6 6 C 6 7.6 4.6 9 3 9 C 1.3 9 0 7.6 0 6 L 0 3 C 0 1.3 1.3 0 3 0 Z', 'K')],
  'Headwear/Cowboy Hat': [v(32, 98, 'M 0 4 C 12 12 42 0 78 0 C 114 0 144 12 156 2 C 150 18 112 18 78 18 C 44 18 6 18 0 4 Z', 'O'), v(65.1, 59.8, 'M 0.8 40.1 C -3.1 16.1 6.8 -1.8 22.8 0.1 C 32.8 2.1 36.8 12.1 44.8 12.1 C 52.8 12.1 58.8 2.1 68.8 0.1 C 84.8 -1.8 90.8 18.1 86.8 40.1 L 0.8 40.1 Z', 'Q'), v(66, 92, 'M 0 0 L 86 0 L 86 8 L 0 8 L 0 0 Z', 'K')],
  'Headwear/Top Hat': [v(56, 88, 'M 108 8 C 108 12.4 83.8 16 54 16 C 24.1 16 0 12.4 0 8 C 0 3.5 24.1 0 54 0 C 83.8 0 108 3.5 108 8 Z', 'K'), v(76, 42, 'M 4 0 L 64 0 C 66.2 0 68 1.7 68 4 L 68 50 C 68 52.2 66.2 54 64 54 L 4 54 C 1.7 54 0 52.2 0 50 L 0 4 C 0 1.7 1.7 0 4 0 Z', 'K'), v(76, 80, 'M 0 0 L 68 0 L 68 12 L 0 12 L 0 0 Z', 'O')],
  'Headwear/Chef Hat': [o(68, 48, 32, 'P', 'K', 2.5), o(92, 36, 36, 'P', 'K', 2.5), o(120, 48, 32, 'P', 'K', 2.5), v(70, 66, 'M 6 0 L 74 0 C 77.3 0 80 2.6 80 6 L 80 28 C 80 31.3 77.3 34 74 34 L 6 34 C 2.6 34 0 31.3 0 28 L 0 6 C 0 2.6 2.6 0 6 0 Z', 'P', 'K', 2.5)],
  'Headwear/Grad Cap': [v(78, 90, 'M 0 0 L 0 16 C 18 26 46 26 64 16 L 64 0 L 0 0 Z', 'G'), v(46, 58, 'M 0 22 L 64 0 L 128 22 L 64 44 L 0 22 Z', 'K'), v(166, 83, 'M 0 0 L 0 29', null, 'O', 3, 'R'), o(161, 109, 10, 'O')],
  'Headwear/Headphones': [v(53.9, 56.6, 'M 2 71.4 C -9.9 19.4 32 -6.5 66 1.4 C 92 7.4 102 27.4 102 45.4', null, 'K', 8, 'R'), v(38, 120, 'M 13 0 L 15 0 C 22.1 0 28 5.8 28 13 L 28 31 C 28 38.1 22.1 44 15 44 L 13 44 C 5.8 44 0 38.1 0 31 L 0 13 C 0 5.8 5.8 0 13 0 Z', 'O'), v(36, 128, 'M 4 0 C 6.2 0 8 1.7 8 4 L 8 24 C 8 26.2 6.2 28 4 28 C 1.7 28 0 26.2 0 24 L 0 4 C 0 1.7 1.7 0 4 0 Z', 'K')],
  'Eyewear/Round': [o(73.5, 110.4, 66, 'P', 'K', 5, 0.18), v(36, 128, 'M 38 8 L 0 0', null, 'K', 5, 'R'), v(140, 142, 'M 0 0 L 14 2', null, 'K', 5, 'R')],
  'Eyewear/Square': [v(72, 112, 'M 16 0 L 54 0 C 62.8 0 70 7.1 70 16 L 70 46 C 70 54.8 62.8 62 54 62 L 16 62 C 7.1 62 0 54.8 0 46 L 0 16 C 0 7.1 7.1 0 16 0 Z', 'P', 'K', 5, null, 0.18), v(36, 126, 'M 36 6 L 0 0', null, 'K', 5, 'R'), v(142, 142, 'M 0 0 L 12 2', null, 'K', 5, 'R')],
  'Eyewear/Shades': [v(72, 118, 'M 0 0 L 70 0 C 71 28 58 50 36 50 C 14 50 -0.9 28 0 0 Z', 'K'), v(82, 126, 'M 0 0 L 16 0 L 2 22 L 0 0 Z', 'P', undefined, undefined, null, 0.3), v(38, 116, 'M 34 6 L 0 0', null, 'K', 5, 'R'), v(142, 124, 'M 0 0 L 12 4', null, 'K', 5, 'R')],
  'Eyewear/Cat-eye': [v(58, 108, 'M 10 18 L 0 0 C 24 4 68 4 86 18 C 90 44 74 62 48 62 C 26 62 12 44 10 18 Z', 'P', 'O', 5, null, 0.18), v(40, 120, 'M 30 8 L 0 0', null, 'O', 5, 'R')],
  'Eyewear/Monocle': [o(77, 113, 62, 'P', 'O', 5, 0.18), v(114, 170, 'M 14 0 C 26 28 14 52 0 78', null, 'O', 2.5, 'R')],
  'Eyewear/Heart Shades': [v(71.3, 113.3, 'M 35.6 62.7 C -3.3 38.7 -9.3 6.7 12.6 0.7 C 24.6 -2.2 33.6 4.7 35.6 12.7 C 37.6 4.7 48.6 -2.2 60.6 1.7 C 82.6 8.7 74.6 40.7 35.6 62.7 Z', 'O'), o(83, 121, 10, 'P', undefined, undefined, 0.45), v(38, 120, 'M 34 6 L 0 0', null, 'O', 5, 'R')],
  'Eyewear/Half-moon': [v(74, 140, 'M 0 0 L 66 0 C 64 22 50 34 33 34 C 16 34 2 22 0 0 Z', 'P', 'K', 4, null, 0.2), v(38, 132, 'M 34 8 L 0 0', null, 'K', 4, 'R'), v(140, 140, 'M 0 0 L 12 2', null, 'K', 4, 'R')],
  'Face/Handlebar': [v(126, 141.5, 'M 0 8.5 C 8 -3.5 20 -1.5 30 6.5 C 40 -1.5 52 -1.5 60 8.5 C 50 12.5 38 12.5 30 8.5 C 20 14.5 8 14.5 0 8.5 Z', 'K')],
  'Face/Blush': [v(115, 164.5, 'M 26 7.5 C 26 11.6 20.1 15 13 15 C 5.8 15 0 11.6 0 7.5 C 0 3.3 5.8 0 13 0 C 20.1 0 26 3.3 26 7.5 Z', 'Q', undefined, undefined, null, 0.75)],
  'Face/Freckles': [o(115.4, 159.4, 5.1, 'O'), o(125.4, 165.4, 5.1, 'O'), o(135.4, 159.4, 5.1, 'O'), o(121.4, 173.4, 5.1, 'O'), o(133.4, 171.4, 5.1, 'O')],
  'Face/Lashes': [v(128, 113, 'M 0 9 L 10 0', null, 'K', 4, 'R'), v(118, 104, 'M 0 12 L 4 0', null, 'K', 4, 'R'), v(136, 126, 'M 0 6 L 12 0', null, 'K', 4, 'R')],
  'Face/Sleepy': [v(78.4, 115.3, 'M 0 28 C 0 20.6 2.9 13.5 8.2 8.2 C 13.5 2.9 20.6 0 28 0 C 35.5 0 42.6 2.9 47.9 8.2 C 53.2 13.5 56.1 20.6 56.1 28 L 0 28 Z', 'Y'), v(77, 143.4, 'M 0 0 L 59 0', null, 'K', 4, 'R')],
  'Face/Wink': [o(76.5, 113.4, 60, 'Y'), v(86, 144, 'M 0 0 C 10 14 32 14 42 0', null, 'K', 5, 'R')],
  'Neckwear/Scarf': [v(38, 188, 'M 4 4 C 42 26 98 26 134 0 L 140 20 C 100 48 38 48 0 24 L 4 4 Z', 'O'), v(126, 220, 'M 4 2 L 32 0 L 28 44 L 0 42 L 4 2 Z', 'O'), v(128, 240, 'M 0 2 L 28 0', null, 'P', 3.5, 'R'), v(128, 248, 'M 0 2 L 27 0', null, 'P', 3.5, 'R')],
  'Neckwear/Bowtie': [v(80, 188, 'M 28 14 L 0 0 L 0 28 L 28 14 Z', 'O'), v(108, 188, 'M 0 14 L 28 0 L 28 28 L 0 14 Z', 'O'), o(101, 195, 14, 'K')],
  'Neckwear/Necktie': [v(94, 196, 'M 4 0 L 24 0 L 28 14 L 0 14 L 4 0 Z', 'K'), v(90, 210, 'M 6 0 L 30 0 L 36 44 L 18 60 L 0 44 L 6 0 Z', 'K'), v(100, 226, 'M 0 0 L 18 6', null, 'O', 3.5, 'R'), v(98, 240, 'M 0 0 L 24 6', null, 'O', 3.5, 'R')],
  'Neckwear/Bandana': [v(42, 188, 'M 0 2 C 38 14 96 14 132 0 L 66 68 L 0 2 Z', 'O'), o(77.2, 199.2, 5.6, 'P'), o(105.2, 207.2, 5.6, 'P'), o(133.2, 199.2, 5.6, 'P'), o(105.2, 229.2, 5.6, 'P')],
  'Neckwear/Camera': [v(60, 180, 'M 0 0 C 4 60 88 60 94 0', null, 'K', 4, 'R'), v(84, 236, 'M 6 0 L 42 0 C 45.3 0 48 2.6 48 6 L 48 24 C 48 27.3 45.3 30 42 30 L 6 30 C 2.6 30 0 27.3 0 24 L 0 6 C 0 2.6 2.6 0 6 0 Z', 'K'), v(92, 231, 'M 2 0 L 10 0 C 11.1 0 12 0.8 12 2 L 12 4 C 12 5.1 11.1 6 10 6 L 2 6 C 0.8 6 0 5.1 0 4 L 0 2 C 0 0.8 0.8 0 2 0 Z', 'O'), o(99, 244, 18, 'P'), o(103.5, 248.5, 9, 'K')],
  'Neckwear/Backpack': [v(64.3, 180, 'M 1.7 0 C -4.2 34 5.7 64 23.7 82', null, 'O', 10, 'R'), v(126, 176, 'M 24 0 C 30 34 18 66 0 86', null, 'O', 10, 'R'), v(68, 210, 'M 0 0 L 78 0', null, 'K', 3.5, 'R'), v(100, 203, 'M 3 0 L 11 0 C 12.6 0 14 1.3 14 3 L 14 11 C 14 12.6 12.6 14 11 14 L 3 14 C 1.3 14 0 12.6 0 11 L 0 3 C 0 1.3 1.3 0 3 0 Z', 'G')],
}

export type Slot = 'hair' | 'headwear' | 'eyewear' | 'face' | 'neckwear'

export const SLOT_OPTIONS: Record<Slot, { id: string; label: string; back?: string }[]> = {
  hair: [
    { id: 'Hair/Swoop', label: 'Swoop' },
    { id: 'Hair/Top Bun', label: 'Top bun' },
    { id: 'Hair/Afro Puff', label: 'Afro puff' },
    { id: 'Hair/Mohawk', label: 'Mohawk' },
    { id: 'Hair/Long Waves', label: 'Long waves', back: 'Hair/Long Waves/back' },
    { id: 'Hair/Ponytail', label: 'Ponytail', back: 'Hair/Ponytail/back' },
    { id: 'Hair/Curly Top', label: 'Curly top' },
  ],
  headwear: [
    { id: 'Headwear/Beanie', label: 'Beanie' },
    { id: 'Headwear/Cap', label: 'Cap' },
    { id: 'Headwear/Bucket Hat', label: 'Bucket hat' },
    { id: 'Headwear/Beret', label: 'Beret' },
    { id: 'Headwear/Cowboy Hat', label: 'Cowboy hat' },
    { id: 'Headwear/Top Hat', label: 'Top hat' },
    { id: 'Headwear/Chef Hat', label: 'Chef hat' },
    { id: 'Headwear/Grad Cap', label: 'Grad cap' },
    { id: 'Headwear/Headphones', label: 'Headphones' },
  ],
  eyewear: [
    { id: 'Eyewear/Round', label: 'Round' },
    { id: 'Eyewear/Square', label: 'Square' },
    { id: 'Eyewear/Shades', label: 'Shades' },
    { id: 'Eyewear/Cat-eye', label: 'Cat-eye' },
    { id: 'Eyewear/Monocle', label: 'Monocle' },
    { id: 'Eyewear/Heart Shades', label: 'Hearts' },
    { id: 'Eyewear/Half-moon', label: 'Half-moon' },
  ],
  face: [
    { id: 'Face/Handlebar', label: 'Handlebar' },
    { id: 'Face/Blush', label: 'Blush' },
    { id: 'Face/Freckles', label: 'Freckles' },
    { id: 'Face/Lashes', label: 'Lashes' },
    { id: 'Face/Sleepy', label: 'Sleepy' },
    { id: 'Face/Wink', label: 'Wink' },
  ],
  neckwear: [
    { id: 'Neckwear/Scarf', label: 'Scarf' },
    { id: 'Neckwear/Bowtie', label: 'Bowtie' },
    { id: 'Neckwear/Necktie', label: 'Necktie' },
    { id: 'Neckwear/Bandana', label: 'Bandana' },
    { id: 'Neckwear/Camera', label: 'Camera' },
    { id: 'Neckwear/Backpack', label: 'Backpack' },
  ],
}
