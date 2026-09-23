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
}

// GM-facing, outcome-first — the order is the segmented control's order. Bold = median-cut,
// Balanced = Wu, Faithful = k-means; the GM picks by the live preview, not the algorithm.
export const PIXELATION_STYLES: PixelationStyleMeta[] = [
  { id: 'bold', label: 'Bold', blurb: 'Fewer, stronger colours and big flat areas. The boldest look, and the easiest to copy.', quantise: medianCutQuantiser },
  { id: 'balanced', label: 'Balanced', blurb: 'A fuller mix of colours. A good all-rounder for most pictures.', quantise: wuQuantiser },
  { id: 'faithful', label: 'Faithful', blurb: 'Closest to the original, with softer, more subtle shades. The prettiest, but the hardest to copy.', quantise: kmeansQuantiser },
]

export const DEFAULT_PIXELATION_STYLE: PixelationStyle = 'balanced'

export function quantiserFor(style: PixelationStyle): Quantiser {
  return (PIXELATION_STYLES.find(s => s.id === style) ?? PIXELATION_STYLES[1]).quantise
}
