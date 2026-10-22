import type { Rgb } from '../palette'

// A palette strategy: the downscaled grid as a flat RGBA buffer (stride 4, alpha skipped) + the
// requested count -> the image-derived palette. Swapping it is how the GM's "Pixelation style" and
// the /quantise comparison pit the quantisers against each other.
export type Quantiser = (rgba: Uint8ClampedArray, count: number) => Rgb[]

// The GM-facing "Pixelation style" choice; each id maps to a quantiser in ./index.
export type PixelationStyle = 'bold' | 'balanced' | 'faithful'
