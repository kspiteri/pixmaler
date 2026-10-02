// Curated word lists for room code generation.
// ~60 adjectives × ~60 nouns ≈ 3,600 combos — enough for coworker scale.
// Doubles as a profanity filter (nothing gross in here).

import { uniqueNamesGenerator } from 'unique-names-generator'

export const adjectives = [
  'abstract',
  'ancient',
  'angry',
  'azure',
  'blobby',
  'blurry',
  'bold',
  'broken',
  'chonky',
  'chunky',
  'classic',
  'cloudy',
  'cobalt',
  'cosmic',
  'crispy',
  'crooked',
  'crusty',
  'curvy',
  'damp',
  'dark',
  'digital',
  'dripping',
  'dusty',
  'epic',
  'feral',
  'fishy',
  'flat',
  'fluffy',
  'foggy',
  'fragile',
  'funky',
  'fuzzy',
  'gloomy',
  'golden',
  'greasy',
  'gritty',
  'haunted',
  'hazy',
  'hollow',
  'icy',
  'itchy',
  'janky',
  'jazzy',
  'jolly',
  'juicy',
  'lumpy',
  'mad',
  'melted',
  'messy',
  'moody',
  'mossy',
  'muddy',
  'mystic',
  'neon',
  'noisy',
  'odd',
  'pastel',
  'pixel',
  'pointy',
  'purple',
  'retro',
  'round',
  'rusty',
]

export const nouns = [
  'artist',
  'blob',
  'brush',
  'bucket',
  'canvas',
  'chalk',
  'chisel',
  'collage',
  'color',
  'crayon',
  'cubist',
  'doodle',
  'drip',
  'easel',
  'eraser',
  'exhibit',
  'fresco',
  'gallery',
  'glaze',
  'gouache',
  'graffiti',
  'impasto',
  'ink',
  'kiln',
  'layer',
  'lino',
  'mallet',
  'maquette',
  'marker',
  'matte',
  'medium',
  'mural',
  'museum',
  'oil',
  'palette',
  'panel',
  'pastel',
  'patron',
  'pencil',
  'pigment',
  'pixel',
  'plaster',
  'portrait',
  'poster',
  'primer',
  'print',
  'resin',
  'sculptor',
  'sketch',
  'smear',
  'smudge',
  'spatula',
  'spray',
  'stencil',
  'stipple',
  'stroke',
  'study',
  'tempera',
  'texture',
  'tint',
  'varnish',
  'wash',
  'watercolor',
]

// A random adjective-noun pair, e.g. "feral-crayon". Shared by the room-code
// generator (Entry) and the random-name fallback (App / Lobby).
export function wordPair(): string {
  return uniqueNamesGenerator({
    dictionaries: [adjectives, nouns],
    separator: '-',
    length: 2,
    style: 'lowerCase',
  })
}

// A well-formed room code: an adjective-noun pair from the word lists, exactly what `wordPair()`
// emits. Checked against the lists, not just the `{word}-{word}` shape, so a typo or guess can't
// mint a room. The server creates only on it; Entry uses it to refuse a code that can't be live
// before probing. A shared room link still joins on existence alone.
export function isRoomCode(code: string): boolean {
  const parts = code.split('-')
  return parts.length === 2 && adjectives.includes(parts[0]) && nouns.includes(parts[1])
}

// Tidies a typed or pasted room code: a pasted room link yields its `room` param, then lowercase,
// whitespace/underscores to hyphens, anything else dropped. A trailing hyphen survives so typing
// "feral " can still reach "feral-crayon".
export function formatRoomInput(raw: string): string {
  const fromLink = raw.includes('?') ? new URLSearchParams(raw.slice(raw.indexOf('?') + 1).split('#')[0]).get('room') : null
  return (fromLink ?? raw)
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-/, '')
}
