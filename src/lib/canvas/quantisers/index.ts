// The three colour-style quantisers and the GM-facing registry that names them. Imported by the
// pipeline (the default), the picker's Pixelation style control, and the /quantise comparison page.
// `metrics.ts` is deliberately NOT re-exported here, so it stays out of the production bundle.

import type { PixelationStyle, Quantiser } from './types'
import { kmeansQuantiser } from './kmeans'
import { medianCutQuantiser } from './median'
import { wuQuantiser } from './wu'

export type { PixelationStyle, Quantiser } from './types'
export { kmeansQuantiser, medianCutQuantiser, wuQuantiser }

export interface PixelationStyleMeta {
  id: PixelationStyle
  label: string
  // Plain-language explanation (no jargon) for the disclosure, and the accessible name.
  blurb: string
  quantise: Quantiser
  // Near-duplicate merge distance (RGB units) the pipeline applies after this style's quantiser.
  // Higher flattens to punchy colours (Bold); lower keeps the fine shades that make Faithful subtle.
  mergeUnit: number
}

// GM-facing, outcome-first — the order is the segmented control's order. Bold = median-cut,
// Balanced = Wu, Faithful = k-means; the GM picks by the live preview, not the algorithm.
export const PIXELATION_STYLES: PixelationStyleMeta[] = [
  { id: 'bold', label: 'Bold', blurb: 'Fewer, stronger colours and big flat areas, the easiest to copy.', quantise: medianCutQuantiser, mergeUnit: 16 },
  { id: 'balanced', label: 'Balanced', blurb: 'Fuller mix of colours. Good all-rounder for most images.', quantise: wuQuantiser, mergeUnit: 12 },
  { id: 'faithful', label: 'Faithful', blurb: 'Closest to your source image, softer and subtle shades. Hardest to copy.', quantise: kmeansQuantiser, mergeUnit: 8 },
]

export const DEFAULT_PIXELATION_STYLE: PixelationStyle = 'balanced'

export function pixelationStyleFor(style: PixelationStyle): PixelationStyleMeta {
  return PIXELATION_STYLES.find(s => s.id === style) ?? PIXELATION_STYLES[1]
}
