import { describe, expect, it } from 'vitest'
import { TYPE_COLOR } from './sprites'
import { contrastRatio, extractGlyph, INK_DARK, INK_LIGHT, typeInk } from './typeStyle'

describe('type badge ink', () => {
  it('computes WCAG contrast', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5)
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5)
  })

  it('keeps every badge readable (AA 4.5:1 for the text, outline when white is only 3:1+)', () => {
    for (const [type, bg] of Object.entries(TYPE_COLOR)) {
      const { ink, outline } = typeInk(type)
      if (outline) {
        expect(ink, type).toBe(INK_LIGHT)
        expect(contrastRatio(bg, INK_LIGHT), type).toBeGreaterThanOrEqual(3)
      } else {
        expect(contrastRatio(bg, ink), type).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('uses dark text on the light types', () => {
    for (const type of ['electric', 'ice', 'flying', 'normal', 'fairy']) expect(typeInk(type).ink).toBe(INK_DARK)
    for (const type of ['dragon', 'ghost', 'dark', 'poison', 'ground']) expect(typeInk(type)).toEqual({ ink: INK_LIGHT, outline: false })
  })
})

describe('extractGlyph', () => {
  const px = (cols: number[][]) => new Uint8ClampedArray(cols.flat())
  it('turns the background colour transparent and the glyph colour opaque white', () => {
    const bg = [250, 192, 0, 255]
    const fg = [255, 255, 255, 255]
    const half = [252, 223, 127, 255]
    const out = extractGlyph(px([bg, bg, bg, fg, fg, half, [0, 0, 0, 0]]))
    expect([...out.slice(0, 4)]).toEqual([255, 255, 255, 0])
    expect(out[3 * 4 + 3]).toBe(255)
    expect(out[5 * 4 + 3]).toBeGreaterThan(100)
    expect(out[5 * 4 + 3]).toBeLessThan(160)
    expect(out[6 * 4 + 3]).toBe(0)
  })
  it('works for a light background with a coloured glyph (stellar)', () => {
    const bg = [255, 255, 255, 255]
    const fg = [67, 111, 221, 255]
    const out = extractGlyph(px([bg, bg, fg]))
    expect(out[3]).toBe(0)
    expect(out[11]).toBe(255)
  })
})
