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

const TAGLINES: (string | (() => string))[] = [
  'draw pixels, have fun, win nothing',
  'ruin a masterpiece with friends',
  'pixels in, chaos out',
  'draw badly, vote honestly',
  'great art, two-minute deadline',
  'recreate art. poorly.',
  () => `${pick(PAINTINGS)}, but horrible`,
  () => `${pick(ARTISTS)}, hates you right now`,
]

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function randomTagline(): string {
  const choice = pick(TAGLINES)
  return typeof choice === 'function' ? choice() : choice
}
