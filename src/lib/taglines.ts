// Cosmetic Entry-screen taglines. Purely client-side flavour — a fresh one is
// picked on each page load. Some are templated against famous paintings /
// artists for variety. British English, lowercase, dry.

const PAINTINGS = [
  'mona lisa',
  'the scream',
  'girl with a pearl earring',
  'starry night',
  'the night watch',
  'american gothic',
  'the kiss',
  'water lilies',
  'the birth of venus',
  'a sunday afternoon',
]

const ARTISTS = [
  'da vinci',
  'munch',
  'vermeer',
  'van gogh',
  'rembrandt',
  'picasso',
  'monet',
  'klimt',
  'michelangelo',
  'frida kahlo',
]

// A templated tagline: a `suffix` appended to a randomly-picked option. Modelled
// as data (not an opaque closure) so it can be both *sampled* (randomTagline) and
// *enumerated* (taglineGroups) from one definition — no duplicated format strings.
interface Template {
  options: readonly string[]
  suffix: string
}

const TEMPLATES: Template[] = [
  { options: PAINTINGS, suffix: ', but horrible' },
  { options: ARTISTS, suffix: ', hates you right now' },
]

const FIXED = [
  'draw pixels, have fun, win nothing',
  'ruin a masterpiece with friends',
  'pixels in, chaos out',
  'draw badly, vote honestly',
  'great art, two-minute deadline',
  'recreate art. poorly.',
]

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// Pick uniformly over the *slots* — each fixed line and each template category
// is equally likely (a template then fills a random option). Matches the
// original weighting, where a template counts as one slot regardless of how many
// options it has.
export function randomTagline(): string {
  const slot = Math.floor(Math.random() * (FIXED.length + TEMPLATES.length))
  if (slot < FIXED.length)
    return FIXED[slot]
  const t = TEMPLATES[slot - FIXED.length]
  return `${pick(t.options)}${t.suffix}`
}

// Structured view of the tagline set for the /taglines debug page: the fixed
// lines, plus each template as its own group (pattern label + expanded lines).
// Same FIXED/TEMPLATES source as randomTagline, so it can't drift from what
// players see.
export interface TaglineGroups {
  fixed: string[]
  templates: { pattern: string, expanded: string[] }[]
}

export function taglineGroups(): TaglineGroups {
  return {
    fixed: [...FIXED],
    templates: TEMPLATES.map(t => ({
      pattern: `{}${t.suffix}`,
      expanded: t.options.map(o => `${o}${t.suffix}`),
    })),
  }
}
