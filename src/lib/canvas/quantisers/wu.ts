// Wu's colour quantiser (Xiaolin Wu, 1992) - the 'Balanced' colour style (see ./index).
import type { Rgb } from '../palette'

// ── Wu's colour quantiser (Xiaolin Wu, 1992) ────────────────────────────────────
// A variance-minimising cut over a 33³ 5-bit-per-channel histogram of cumulative moments.
// Deterministic, and stronger than median-cut on real photos for the same colour count. Ported
// from the canonical reference; the moment maths (the 8-corner inclusion-exclusion in `vol`, and
// the marginals in `bottom`/`top`) is load-bearing — don't "simplify" without a golden test.

const SIDE = 33

function wuIndex(r: number, g: number, b: number): number {
  return (r * SIDE + g) * SIDE + b
}

interface WuBox {
  r0: number
  r1: number
  g0: number
  g1: number
  b0: number
  b1: number
  vol: number
}

export function wuQuantiser(pixels: Rgb[], count: number): Rgb[] {
  if (pixels.length === 0)
    return []
  const target = Math.max(1, count)
  const size = SIDE * SIDE * SIDE

  const wt = new Float64Array(size)
  const mr = new Float64Array(size)
  const mg = new Float64Array(size)
  const mb = new Float64Array(size)
  const m2 = new Float64Array(size)

  // Histogram, binned to 5 bits and shifted to 1..32 so the cumulative below has a zero margin.
  for (let p = 0; p < pixels.length; p++) {
    const r = pixels[p][0]
    const g = pixels[p][1]
    const b = pixels[p][2]
    const i = wuIndex((r >> 3) + 1, (g >> 3) + 1, (b >> 3) + 1)
    wt[i] += 1
    mr[i] += r
    mg[i] += g
    mb[i] += b
    m2[i] += r * r + g * g + b * b
  }

  // Convert the histogram into cumulative moments (3D prefix sums).
  for (let r = 1; r < SIDE; r++) {
    const area = new Float64Array(SIDE)
    const areaR = new Float64Array(SIDE)
    const areaG = new Float64Array(SIDE)
    const areaB = new Float64Array(SIDE)
    const area2 = new Float64Array(SIDE)
    for (let g = 1; g < SIDE; g++) {
      let line = 0
      let lineR = 0
      let lineG = 0
      let lineB = 0
      let line2 = 0
      for (let b = 1; b < SIDE; b++) {
        const i = wuIndex(r, g, b)
        line += wt[i]
        lineR += mr[i]
        lineG += mg[i]
        lineB += mb[i]
        line2 += m2[i]
        area[b] += line
        areaR[b] += lineR
        areaG[b] += lineG
        areaB[b] += lineB
        area2[b] += line2
        const ir = wuIndex(r - 1, g, b)
        wt[i] = wt[ir] + area[b]
        mr[i] = mr[ir] + areaR[b]
        mg[i] = mg[ir] + areaG[b]
        mb[i] = mb[ir] + areaB[b]
        m2[i] = m2[ir] + area2[b]
      }
    }
  }

  const vol = (c: Float64Array, x: WuBox): number =>
    c[wuIndex(x.r1, x.g1, x.b1)] - c[wuIndex(x.r1, x.g1, x.b0)]
    - c[wuIndex(x.r1, x.g0, x.b1)] + c[wuIndex(x.r1, x.g0, x.b0)]
    - c[wuIndex(x.r0, x.g1, x.b1)] + c[wuIndex(x.r0, x.g1, x.b0)]
    + c[wuIndex(x.r0, x.g0, x.b1)] - c[wuIndex(x.r0, x.g0, x.b0)]

  // The base (bottom face) of a box's marginal along one axis.
  const bottom = (x: WuBox, dir: 0 | 1 | 2, c: Float64Array): number => {
    if (dir === 0)
      return -c[wuIndex(x.r0, x.g1, x.b1)] + c[wuIndex(x.r0, x.g1, x.b0)] + c[wuIndex(x.r0, x.g0, x.b1)] - c[wuIndex(x.r0, x.g0, x.b0)]
    if (dir === 1)
      return -c[wuIndex(x.r1, x.g0, x.b1)] + c[wuIndex(x.r1, x.g0, x.b0)] + c[wuIndex(x.r0, x.g0, x.b1)] - c[wuIndex(x.r0, x.g0, x.b0)]
    return -c[wuIndex(x.r1, x.g1, x.b0)] + c[wuIndex(x.r1, x.g0, x.b0)] + c[wuIndex(x.r0, x.g1, x.b0)] - c[wuIndex(x.r0, x.g0, x.b0)]
  }

  // The marginal up to `pos` along one axis, so a candidate cut is base + top(pos).
  const top = (x: WuBox, dir: 0 | 1 | 2, pos: number, c: Float64Array): number => {
    if (dir === 0)
      return c[wuIndex(pos, x.g1, x.b1)] - c[wuIndex(pos, x.g1, x.b0)] - c[wuIndex(pos, x.g0, x.b1)] + c[wuIndex(pos, x.g0, x.b0)]
    if (dir === 1)
      return c[wuIndex(x.r1, pos, x.b1)] - c[wuIndex(x.r1, pos, x.b0)] - c[wuIndex(x.r0, pos, x.b1)] + c[wuIndex(x.r0, pos, x.b0)]
    return c[wuIndex(x.r1, x.g1, pos)] - c[wuIndex(x.r1, x.g0, pos)] - c[wuIndex(x.r0, x.g1, pos)] + c[wuIndex(x.r0, x.g0, pos)]
  }

  const variance = (x: WuBox): number => {
    const w = vol(wt, x)
    if (w === 0)
      return 0
    const dr = vol(mr, x)
    const dg = vol(mg, x)
    const db = vol(mb, x)
    return vol(m2, x) - (dr * dr + dg * dg + db * db) / w
  }

  // Best cut position along one axis: the one that most reduces the two halves' summed variance.
  const maximize = (x: WuBox, dir: 0 | 1 | 2, first: number, last: number, wr: number, wg: number, wb: number, ww: number) => {
    const bR = bottom(x, dir, mr)
    const bG = bottom(x, dir, mg)
    const bB = bottom(x, dir, mb)
    const bW = bottom(x, dir, wt)
    let max = 0
    let cut = -1
    for (let i = first; i < last; i++) {
      const halfR = bR + top(x, dir, i, mr)
      const halfG = bG + top(x, dir, i, mg)
      const halfB = bB + top(x, dir, i, mb)
      const halfW = bW + top(x, dir, i, wt)
      if (halfW === 0)
        continue
      let temp = (halfR * halfR + halfG * halfG + halfB * halfB) / halfW
      const otherW = ww - halfW
      if (otherW === 0)
        break
      const otherR = wr - halfR
      const otherG = wg - halfG
      const otherB = wb - halfB
      temp += (otherR * otherR + otherG * otherG + otherB * otherB) / otherW
      if (temp > max) {
        max = temp
        cut = i
      }
    }
    return { max, cut }
  }

  const cutBox = (a: WuBox, b: WuBox): boolean => {
    const wr = vol(mr, a)
    const wg = vol(mg, a)
    const wb = vol(mb, a)
    const ww = vol(wt, a)
    const mR = maximize(a, 0, a.r0 + 1, a.r1, wr, wg, wb, ww)
    const mG = maximize(a, 1, a.g0 + 1, a.g1, wr, wg, wb, ww)
    const mB = maximize(a, 2, a.b0 + 1, a.b1, wr, wg, wb, ww)

    let dir: 0 | 1 | 2
    if (mR.max >= mG.max && mR.max >= mB.max) {
      dir = 0
      if (mR.cut < 0)
        return false // this box can no longer be split
    }
    else if (mG.max >= mR.max && mG.max >= mB.max) {
      dir = 1
    }
    else {
      dir = 2
    }

    b.r1 = a.r1
    b.g1 = a.g1
    b.b1 = a.b1
    if (dir === 0) {
      b.r0 = a.r1 = mR.cut
      b.g0 = a.g0
      b.b0 = a.b0
    }
    else if (dir === 1) {
      b.g0 = a.g1 = mG.cut
      b.r0 = a.r0
      b.b0 = a.b0
    }
    else {
      b.b0 = a.b1 = mB.cut
      b.r0 = a.r0
      b.g0 = a.g0
    }
    a.vol = (a.r1 - a.r0) * (a.g1 - a.g0) * (a.b1 - a.b0)
    b.vol = (b.r1 - b.r0) * (b.g1 - b.g0) * (b.b1 - b.b0)
    return true
  }

  const cubes: WuBox[] = [{ r0: 0, r1: SIDE - 1, g0: 0, g1: SIDE - 1, b0: 0, b1: SIDE - 1, vol: 0 }]
  const vv = new Float64Array(target)
  let boxes = target
  let next = 0
  for (let i = 1; i < target; i++) {
    cubes[i] = { r0: 0, r1: 0, g0: 0, g1: 0, b0: 0, b1: 0, vol: 0 }
    if (cutBox(cubes[next], cubes[i])) {
      vv[next] = cubes[next].vol > 1 ? variance(cubes[next]) : 0
      vv[i] = cubes[i].vol > 1 ? variance(cubes[i]) : 0
    }
    else {
      vv[next] = 0 // give up on this box
      i--
    }
    next = 0
    let temp = vv[0]
    for (let k = 1; k <= i; k++) {
      if (vv[k] > temp) {
        temp = vv[k]
        next = k
      }
    }
    if (temp <= 0) {
      boxes = i + 1
      break
    }
  }

  const out: Rgb[] = []
  for (let k = 0; k < boxes; k++) {
    const w = vol(wt, cubes[k])
    if (w > 0)
      out.push([Math.round(vol(mr, cubes[k]) / w), Math.round(vol(mg, cubes[k]) / w), Math.round(vol(mb, cubes[k]) / w)])
  }
  return out
}
