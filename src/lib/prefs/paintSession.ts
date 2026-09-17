import type { PickerMeta, PipelineResult } from '@/lib'
import { readStored, removeStored, writeStored } from '../storage'

// The /paint sandbox remembers the chosen image, its settings and the canvas progress across
// reloads — it's solo practice with no server to hold them. One JSON blob per browser,
// module-level like the other prefs. An absent key means a fresh sandbox (the ImagePicker
// auto-loads its default sample). `clearAllData` wipes it with every other `pixmaler:*` key.

const KEY = 'pixmaler:paintSession'

export interface PaintSession {
  result: PipelineResult
  meta: PickerMeta
  // The editable canvas grid; -1 is an untouched cell. Same length as gridW * gridH.
  grid: number[]
}

function isNumberGrid(v: unknown, len: number): v is number[] {
  return Array.isArray(v) && v.length === len && v.every(n => typeof n === 'number')
}

// Returns null for an absent, corrupt or dimension-mismatched blob rather than mounting a
// broken canvas — a stored session can outlive a code change to the pipeline shape.
export function loadPaintSession(): PaintSession | null {
  const raw = readStored(KEY)
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
    return s
  }
  catch {
    return null
  }
}

export function savePaintSession(result: PipelineResult, meta: PickerMeta, grid: number[]): void {
  writeStored(KEY, JSON.stringify({ result, meta, grid } satisfies PaintSession))
}

export function clearPaintSession(): void {
  removeStored(KEY)
}
