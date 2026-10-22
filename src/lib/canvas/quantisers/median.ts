import type { Quantiser } from './types'
import { derivePalette } from '../palette'

// Priority median-cut - the "Bold" colour style: fewer, punchier, deeper colours. Near-duplicate
// merging is applied uniformly to every style in the pipeline, not here, so this returns the raw
// derived palette like the other two quantisers.
export const medianCutQuantiser: Quantiser = derivePalette
