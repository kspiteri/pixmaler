import type { PickerMeta, PickerSettings, PipelineResult } from '../canvas/pipeline'
import { TARGET_RATIOS } from '../canvas/aspect'
import { PIXELATION_STYLES } from '../canvas/quantisers'
import { readStored, removeStored, writeStored } from '../storage'

// The /paint sandbox remembers the chosen image, its settings and the canvas progress across
// reloads — it's solo practice with no server to hold them. One JSON blob per browser,
// module-level like the other prefs. An absent key means a fresh sandbox (the ImagePicker
// auto-loads its default sample). `clearAllData` wipes it with every other `pixmaler:*` key.

const KEY = 'pixmaler:paintSession'

export interface PaintSession {
  result: PipelineResult
  // `sample`/`settings` let the picker rebuild itself; a session saved before they existed
  // still loads, just with an empty picker.
  meta: PickerMeta
  // The editable canvas grid; -1 is an untouched cell. Same length as gridW * gridH.
  grid: number[]
}

function isNumberGrid(v: unknown, len: number): v is number[] {
  return Array.isArray(v) && v.length === len && v.every(n => typeof n === 'number')
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function parseSettings(v: unknown): PickerSettings | null {
  const s = v as Partial<PickerSettings> | null
  if (!s || typeof s !== 'object')
    return null
  const { scale, colorCount, pixelationStyle, ratio, crop, background } = s
  const valid = isFiniteNumber(scale) && isFiniteNumber(colorCount)
    && PIXELATION_STYLES.some(p => p.id === pixelationStyle)
    && typeof ratio === 'string' && Object.hasOwn(TARGET_RATIOS, ratio)
    && isFiniteNumber(crop?.cx) && isFiniteNumber(crop?.cy) && isFiniteNumber(crop?.zoom)
    && typeof background === 'string' && /^#[0-9a-f]{6}$/i.test(background)
  return valid ? { scale, colorCount, pixelationStyle, ratio, crop: { cx: crop.cx, cy: crop.cy, zoom: crop.zoom }, background } as PickerSettings : null
}

// Returns null for an absent, corrupt or dimension-mismatched blob rather than mounting a
// broken canvas — a stored session can outlive a code change to the pipeline shape. Bad
// picker settings only drop the settings: the drawing is still worth restoring.
export function parsePaintSession(raw: string | null): PaintSession | null {
  if (!raw)
    return null
  try {
    const s = JSON.parse(raw) as PaintSession
    const r = s?.result
    if (!r || !Number.isInteger(r.gridW) || !Number.isInteger(r.gridH))
      return null
    const cells = r.gridW * r.gridH
    if (cells <= 0 || !Array.isArray(r.palette) || !isNumberGrid(r.targetGrid, cells)
      || !isNumberGrid(s.grid, cells) || typeof s.meta?.source !== 'string') {
      return null
    }
    const settings = parseSettings(s.meta.settings)
    const meta: PickerMeta = settings
      ? { source: s.meta.source, sample: typeof s.meta.sample === 'string' ? s.meta.sample : null, settings }
      : { source: s.meta.source }
    return { result: r, meta, grid: s.grid }
  }
  catch {
    return null
  }
}

export function loadPaintSession(): PaintSession | null {
  return parsePaintSession(readStored(KEY))
}

export function savePaintSession(result: PipelineResult, meta: PickerMeta, grid: number[]): void {
  writeStored(KEY, JSON.stringify({ result, meta, grid } satisfies PaintSession))
}

export function clearPaintSession(): void {
  removeStored(KEY)
}

// Whether a drawing made against `current` stays valid on `next`: same grid and the same
// palette indices. The target may differ; the player's cells still mean the same colours.
export function keepsDrawing(current: PipelineResult, next: PipelineResult): boolean {
  return current.gridW === next.gridW && current.gridH === next.gridH
    && current.palette.length === next.palette.length
    && current.palette.every((hex, i) => hex === next.palette[i])
}
