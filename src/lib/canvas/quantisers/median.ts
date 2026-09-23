import type { Quantiser } from './types'
import { derivePalette, mergeNearDuplicates } from '../palette'

// Priority median-cut + near-duplicate merge - the "Bold" colour style: fewer, punchier, deeper
// colours. The pipeline's original quantiser (the merge collapses near-duplicates that median-cut
// clusters in shadows), kept as one of the three styles.
export const medianCutQuantiser: Quantiser = (pixels, count) => mergeNearDuplicates(derivePalette(pixels, count))
