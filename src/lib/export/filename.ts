// Export filenames: `pixmaler-<room>-<name>.png` on RESULTS, `pixmaler-paint-<source>.png` in Paint.

const SLUG_MAX = 40
const FALLBACK = 'drawing'

// Latin letters NFKD can't split into base + mark (lowercase; the slug lowercases first).
// The Catalan middle dot (col·legi) is dropped rather than read as a separator.
const LATIN_FOLD: Record<string, string> = {
  'ß': 'ss',
  'æ': 'ae',
  'œ': 'oe',
  'ø': 'o',
  'ł': 'l',
  'đ': 'd',
  'ð': 'd',
  'þ': 'th',
  'ı': 'i',
  'ħ': 'h',
  'ŋ': 'ng',
  'ŧ': 't',
  'ĸ': 'k',
  'ƀ': 'b',
  'ɓ': 'b',
  'ƈ': 'c',
  'ȼ': 'c',
  'ɗ': 'd',
  'ƌ': 'd',
  'ȡ': 'd',
  'ɇ': 'e',
  'ə': 'e',
  'ǝ': 'e',
  'ɛ': 'e',
  'ƒ': 'f',
  'ɠ': 'g',
  'ɨ': 'i',
  'ɉ': 'j',
  'ȷ': 'j',
  'ƙ': 'k',
  'ƚ': 'l',
  'ȴ': 'l',
  'ɲ': 'n',
  'ƞ': 'n',
  'ȵ': 'n',
  'ɔ': 'o',
  'ƥ': 'p',
  'ɋ': 'q',
  'ɍ': 'r',
  'ȿ': 's',
  'ƫ': 't',
  'ƭ': 't',
  'ʈ': 't',
  'ȶ': 't',
  'ⱦ': 't',
  'ʉ': 'u',
  'ʋ': 'v',
  'ƴ': 'y',
  'ɏ': 'y',
  'ƶ': 'z',
  'ȥ': 'z',
  'ɀ': 'z',
  'ⱥ': 'a',
  '·': '',
}
const LATIN_FOLD_RE = new RegExp(`[${Object.keys(LATIN_FOLD).join('')}]`, 'g')

// Lowercase ASCII, Latin accents and letters folded, every other run collapsed to one hyphen.
export function exportSlug(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(LATIN_FOLD_RE, c => LATIN_FOLD[c])
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, SLUG_MAX)
    .replace(/^-+|-+$/g, '')
}

// Raster image extensions the picker can be handed; anything else after a dot is part of the name.
const IMAGE_EXT_RE = /\.(?:png|jpe?g|jfif|gif|webp|avif|hei[cf]|bmp|tiff?|ico)$/i

export function drawingFilename(room: string, name: string): string {
  const parts = ['pixmaler', exportSlug(room), exportSlug(name) || FALLBACK].filter(Boolean)
  return `${parts.join('-')}.png`
}

// A sample's manifest id, else the uploaded file's name without its image extension.
export function paintFilename(source: { sample?: string | null, source: string } | null): string {
  const raw = source?.sample ?? source?.source.replace(IMAGE_EXT_RE, '') ?? ''
  return `pixmaler-paint-${exportSlug(raw) || FALLBACK}.png`
}
