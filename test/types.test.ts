// The wire's trust boundary. `parseClientMsg` is the only thing standing between
// a raw socket frame and the room's state machine, and it replaced a
// `JSON.parse(raw) as ClientMsg` that checked nothing: an unguarded `grid` made
// `endDrawing` throw *after* it had moved `phase`, so the alarm retry resolved the
// round with an empty gallery and silently discarded every submission.
//
// Two properties matter beyond "does it accept good input":
//   - it must never throw, whatever arrives;
//   - it must CONSTRUCT its result, so unknown properties cannot ride along into
//     room state and back out over a broadcast.

import { describe, expect, it } from 'vitest'
import {
  AVATAR_SHAPES,
  clampDrawSeconds,
  DEFAULT_AVATAR_SHAPE,
  DRAW_SECONDS_MAX,
  DRAW_SECONDS_MIN,
  GRID_MAX_SIDE,
  normaliseShape,
  PALETTE_MAX_LEN,
  parseClientMsg,
  VOTE_CATEGORIES,
} from '../src/lib/types'

// Every assertion parses a raw frame; the short name keeps them readable.
const parse = parseClientMsg

// A minimal valid configure payload, so each test varies one field.
function configure(over: Record<string, unknown> = {}) {
  return JSON.stringify({
    type: 'gm:configure',
    gridW: 2,
    gridH: 2,
    palette: ['#000000', '#ffffff'],
    targetGrid: [0, 1, 1, 0],
    drawSeconds: 120,
    ...over,
  })
}

describe('normaliseShape', () => {
  it('passes through every declared shape', () => {
    for (const shape of AVATAR_SHAPES)
      expect(normaliseShape(shape)).toBe(shape)
  })

  it('falls back for anything undeclared', () => {
    for (const bad of [undefined, null, '', 'triangle', 42, {}, []])
      expect(normaliseShape(bad)).toBe(DEFAULT_AVATAR_SHAPE)
  })

  it('does not treat prototype keys as shapes', () => {
    // A shape reaches the DOM as a class name, so an inherited property name
    // must not survive the check just because it exists on Object.prototype.
    for (const key of ['__proto__', 'constructor', 'toString', 'hasOwnProperty'])
      expect(normaliseShape(key)).toBe(DEFAULT_AVATAR_SHAPE)
  })
})

describe('clampDrawSeconds', () => {
  it('clamps to the advertised range', () => {
    // The floor exists because a GM testing with 20s had the whole config
    // rejected server-side and saw a Start button that did nothing.
    expect(clampDrawSeconds(20)).toBe(DRAW_SECONDS_MIN)
    expect(clampDrawSeconds(9999)).toBe(DRAW_SECONDS_MAX)
    expect(clampDrawSeconds(120)).toBe(120)
  })

  it('rounds to whole seconds', () => {
    expect(clampDrawSeconds(45.6)).toBe(46)
    expect(clampDrawSeconds(45.4)).toBe(45)
  })
})

describe('parseClientMsg — rejection', () => {
  it('returns null rather than throwing on non-JSON', () => {
    for (const raw of ['', 'not json', '{', '[1,2', 'undefined'])
      expect(parse(raw)).toBeNull()
  })

  it('returns null for JSON that is not an object', () => {
    for (const raw of ['1', '"join"', 'null', 'true'])
      expect(parse(raw)).toBeNull()
  })

  it('returns null for an unknown or missing type', () => {
    expect(parse('{}')).toBeNull()
    expect(parse('{"type":"gm:selfDestruct"}')).toBeNull()
    expect(parse('{"type":123}')).toBeNull()
  })

  it('never throws, whatever the payload', () => {
    const nasty = [
      '{"type":"join"}',
      '{"type":"join","clientId":null,"name":[]}',
      '{"type":"gm:configure"}',
      '{"type":"draw:submit","grid":"nope"}',
      '{"type":"vote:cast","category":{},"submissionId":0}',
      '{"type":"rename","name":{"toString":"boom"}}',
      `{"type":"gm:configure","palette":${JSON.stringify(Array.from({ length: 5 }).fill('#zzzzzz'))}}`,
    ]
    for (const raw of nasty)
      expect(() => parse(raw)).not.toThrow()
  })
})

describe('parseClientMsg — join, rename, shape', () => {
  it('accepts a join and normalises the shape', () => {
    expect(parse('{"type":"join","clientId":"c1","name":"ray","shape":"hexagon"}'))
      .toEqual({ type: 'join', clientId: 'c1', name: 'ray', shape: 'hexagon' })
    expect(parse('{"type":"join","clientId":"c1","name":"ray","shape":"nope"}'))
      .toEqual({ type: 'join', clientId: 'c1', name: 'ray', shape: DEFAULT_AVATAR_SHAPE })
  })

  it('requires clientId and name to be strings', () => {
    expect(parse('{"type":"join","clientId":"c1"}')).toBeNull()
    expect(parse('{"type":"join","name":"ray"}')).toBeNull()
    expect(parse('{"type":"join","clientId":1,"name":"ray"}')).toBeNull()
  })

  it('drops unknown properties instead of letting them into room state', () => {
    const msg = parse('{"type":"join","clientId":"c1","name":"ray","isGm":true,"votes":99}')
    expect(msg).not.toBeNull()
    expect(Object.keys(msg!).sort()).toEqual(['clientId', 'name', 'shape', 'type'])
  })

  it('accepts a bare shape message, since the shape clamps rather than rejects', () => {
    expect(parse('{"type":"shape"}')).toEqual({ type: 'shape', shape: DEFAULT_AVATAR_SHAPE })
    expect(parse('{"type":"shape","shape":"leaf"}')).toEqual({ type: 'shape', shape: 'leaf' })
  })

  it('requires a name to rename', () => {
    expect(parse('{"type":"rename","name":"ray"}')).toEqual({ type: 'rename', name: 'ray' })
    expect(parse('{"type":"rename"}')).toBeNull()
  })
})

describe('parseClientMsg — gm:configure', () => {
  it('accepts a well-formed config', () => {
    expect(parse(configure())).toEqual({
      type: 'gm:configure',
      gridW: 2,
      gridH: 2,
      palette: ['#000000', '#ffffff'],
      targetGrid: [0, 1, 1, 0],
      drawSeconds: 120,
    })
  })

  it('rejects grid sides outside 1..GRID_MAX_SIDE', () => {
    for (const side of [0, -1, GRID_MAX_SIDE + 1, 2.5, Number.NaN]) {
      expect(parse(configure({ gridW: side, targetGrid: [0, 1] }))).toBeNull()
      expect(parse(configure({ gridH: side, targetGrid: [0, 1] }))).toBeNull()
    }
  })

  it('rejects a palette that is empty, oversized, or not six-digit hex', () => {
    expect(parse(configure({ palette: [] }))).toBeNull()
    expect(parse(configure({ palette: Array.from({ length: PALETTE_MAX_LEN + 1 }).fill('#000000') }))).toBeNull()
    for (const bad of ['#fff', 'red', '#gggggg', '000000', 1])
      expect(parse(configure({ palette: [bad, '#ffffff'] }))).toBeNull()
  })

  it('accepts uppercase hex', () => {
    expect(parse(configure({ palette: ['#00FF00', '#ffffff'] }))).not.toBeNull()
  })

  it('rejects a targetGrid whose length disagrees with the grid', () => {
    // The exact failure that lost a round: a grid the renderer cannot index.
    expect(parse(configure({ targetGrid: [0, 1, 1] }))).toBeNull()
    expect(parse(configure({ targetGrid: [0, 1, 1, 0, 0] }))).toBeNull()
    expect(parse(configure({ targetGrid: [] }))).toBeNull()
  })

  it('rejects cells outside the palette, including the unpainted sentinel', () => {
    // Unlike a player's grid, a target is fully quantised — no -1 holes.
    expect(parse(configure({ targetGrid: [0, 1, 1, -1] }))).toBeNull()
    expect(parse(configure({ targetGrid: [0, 1, 1, 2] }))).toBeNull()
    expect(parse(configure({ targetGrid: [0, 1, 1, 1.5] }))).toBeNull()
  })

  it('rejects a non-finite drawSeconds but clamps an out-of-range one', () => {
    // A number out of range is a typo worth saving; a string or NaN is a broken
    // client, and clamping it would put a nonsense round on the wire.
    for (const bad of ['120', null, Number.NaN])
      expect(parse(configure({ drawSeconds: bad }))).toBeNull()
    expect(parse(configure({ drawSeconds: 1 }))).toMatchObject({ drawSeconds: DRAW_SECONDS_MIN })
    expect(parse(configure({ drawSeconds: 99999 }))).toMatchObject({ drawSeconds: DRAW_SECONDS_MAX })
  })
})

describe('parseClientMsg — draw, vote, transfer', () => {
  it('accepts a submitted grid, including unpainted cells', () => {
    // -1 is legitimate here: a player's canvas has holes.
    expect(parse('{"type":"draw:submit","grid":[0,-1,3]}')).toEqual({ type: 'draw:submit', grid: [0, -1, 3] })
  })

  it('rejects a grid that is not an integer array', () => {
    for (const bad of ['"0,1"', '[0,"1"]', '[0,1.5]', '[[0],[1]]', 'null'])
      expect(parse(`{"type":"draw:submit","grid":${bad}}`)).toBeNull()
  })

  it('accepts every declared vote category and rejects the rest', () => {
    for (const { id } of VOTE_CATEGORIES) {
      expect(parse(`{"type":"vote:cast","category":"${id}","submissionId":"s1"}`))
        .toEqual({ type: 'vote:cast', category: id, submissionId: 's1' })
    }
    expect(parse('{"type":"vote:cast","category":"prettiest","submissionId":"s1"}')).toBeNull()
    expect(parse('{"type":"vote:cast","category":"best"}')).toBeNull()
  })

  it('requires a target for a GM transfer', () => {
    expect(parse('{"type":"gm:transfer","toClientId":"c2"}')).toEqual({ type: 'gm:transfer', toClientId: 'c2' })
    expect(parse('{"type":"gm:transfer"}')).toBeNull()
  })
})

describe('parseClientMsg — bodiless messages', () => {
  const bodiless = [
    'gm:start',
    'draw:done',
    'gm:stopVoting',
    'gm:extendTime',
    'gm:playAgain',
    'gm:cancelRound',
    'gm:endSession',
  ]

  it('carries the type and nothing else', () => {
    for (const type of bodiless) {
      const msg = parseClientMsg(`{"type":"${type}","extra":"ignored"}`)
      expect(msg).toEqual({ type })
    }
  })
})
