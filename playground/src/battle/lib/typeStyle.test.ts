import { describe, expect, it } from 'vitest'
import { TYPE_COLOR } from './sprites'
import { contrastRatio, INK_DARK, INK_LIGHT, typeInk } from './typeStyle'

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
