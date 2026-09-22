// Inbound validation: parse a raw client frame into a ClientMsg, or null. Server-only — the
// client never validates its own outbound messages, so this and its bounds stay out of the
// client bundle. Constructs each message rather than narrowing, so unknown properties can't
// ride into room state and back out over a broadcast.

import type { ClientMsg, VoteCategory } from './types'
import { clampDrawSeconds, normaliseShape, VOTE_CATEGORIES } from './types'

// Bounds for anything a client can put on the wire, derived from what the UI can actually
// produce: the largest legitimate grid side is round(768 * 50 * 0.01) = 384.
export const GRID_MAX_SIDE = 512 // headroom over 384, without admitting a million cells
export const GRID_MAX_CELLS = GRID_MAX_SIDE * GRID_MAX_SIDE
export const PALETTE_MAX_LEN = 64 // the picker offers 8/16/24/32; headroom over 32

const isStr = (v: unknown): v is string => typeof v === 'string'
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)
const isSide = (v: unknown): v is number => isInt(v) && v >= 1 && v <= GRID_MAX_SIDE
// Identifiers are Map keys and, for clientId, echoed to the room in every `state`. Cap the
// length so a crafted client can't push a broadcast past the Workers 1 MiB message limit.
const isId = (v: unknown): v is string => isStr(v) && v.length > 0 && v.length <= 64

// Palette entries reach the DOM as CSS values and the canvas as fill styles, so the shape
// is checked rather than trusted.
const HEX_COLOUR = /^#[0-9a-f]{6}$/i
function isPalette(v: unknown): v is string[] {
  return Array.isArray(v) && v.length >= 1 && v.length <= PALETTE_MAX_LEN
    && v.every(c => isStr(c) && HEX_COLOUR.test(c))
}

// Cells are palette indices; the upper bound depends on the live palette, so this is only
// the structural half — an integer array inside the hard cap.
function isCells(v: unknown, maxLen: number): v is number[] {
  return Array.isArray(v) && v.length <= maxLen && v.every(isInt)
}

// A fully quantised target grid, validated in one pass: exact length, integer cells, every
// index in [0, paletteLen). One loop rather than an isInt pass then a separate range pass —
// the grid runs up to GRID_MAX_CELLS long, on the server hot path.
function isTargetGrid(v: unknown, expectedLen: number, paletteLen: number): v is number[] {
  return Array.isArray(v) && v.length === expectedLen
    && v.every(c => isInt(c) && c >= 0 && c < paletteLen)
}

export function parseClientMsg(raw: string): ClientMsg | null {
  let parsed: unknown
  try { parsed = JSON.parse(raw) }
  catch { return null }
  if (typeof parsed !== 'object' || parsed === null)
    return null
  const m = parsed as Record<string, unknown>

  switch (m.type) {
    case 'join':
      return isId(m.clientId) && isStr(m.name)
        ? { type: 'join', clientId: m.clientId, name: m.name, shape: normaliseShape(m.shape), create: m.create === true, secret: isId(m.secret) ? m.secret : undefined }
        : null

    case 'rename':
      return isStr(m.name) ? { type: 'rename', name: m.name } : null

    // `normaliseShape` clamps rather than rejects, so this cannot fail.
    case 'shape':
      return { type: 'shape', shape: normaliseShape(m.shape) }

    case 'gm:configure': {
      const { gridW, gridH, palette, targetGrid, drawSeconds } = m
      if (!isSide(gridW) || !isSide(gridH) || !isPalette(palette))
        return null
      // Clamped, not rejected — a number out of range is a typo, and dropping the whole
      // config over it leaves the GM with a Start button that does nothing. Still requires
      // a finite number: `"120"` or `NaN` is a broken client, not a typo.
      if (typeof drawSeconds !== 'number' || !Number.isFinite(drawSeconds))
        return null
      // The target is a fully quantised image: no `-1` holes, length exact, indices in range.
      if (!isTargetGrid(targetGrid, gridW * gridH, palette.length))
        return null
      return { type: 'gm:configure', gridW, gridH, palette, targetGrid, drawSeconds: clampDrawSeconds(drawSeconds) }
    }

    case 'draw:submit':
      return isCells(m.grid, GRID_MAX_CELLS) ? { type: 'draw:submit', grid: m.grid } : null

    case 'vote:cast':
      return isId(m.submissionId) && VOTE_CATEGORIES.some(c => c.id === m.category)
        ? { type: 'vote:cast', category: m.category as VoteCategory, submissionId: m.submissionId }
        : null

    case 'gm:transfer':
      return isId(m.toClientId) ? { type: 'gm:transfer', toClientId: m.toClientId } : null

    case 'gm:remove':
      return isId(m.toClientId) ? { type: 'gm:remove', toClientId: m.toClientId } : null

    // Bodiless: the type is the whole payload, so there is nothing left to check.
    case 'gm:start':
    case 'draw:done':
    case 'gm:stopVoting':
    case 'gm:extendTime':
    case 'gm:playAgain':
    case 'gm:cancelRound':
    case 'gm:endSession':
    case 'gm:clear':
      return { type: m.type }

    default:
      return null
  }
}
