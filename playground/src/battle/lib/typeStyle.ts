// ─── 타입 배지 글자색 (명도 대비) + 기술 분류 아이콘 ─────
// 배지 바탕은 공식 타입 색 그대로 두고, 글자·문양 색을 대비로 고른다:
//   흰 글자가 4.5:1 이상 → 흰 글자, 3:1 이상 → 흰 글자 + 어두운 외곽선(대비는 글자 ↔ 외곽선),
//   그보다 밝은 색(전기·얼음·비행·노말 …) → 어두운 글자.
import type { MessageKey } from './messages'
import { TYPE_COLOR } from './sprites'

const luminance = (hex: string): number => {
  const v = hex.replace('#', '')
  const ch = [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!
}

/** WCAG 명도 대비 (1~21) */
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x! + 0.05) / (y! + 0.05)
}

export const INK_LIGHT = '#ffffff'
export const INK_DARK = '#16171a'
/** 흰 글자 외곽선 색 */
export const INK_OUTLINE = 'rgba(0, 0, 0, .55)'

export interface TypeInk { ink: string; outline: boolean }

const inkCache = new Map<string, TypeInk>()

/** 타입 색 바탕 위의 글자·문양 색 */
export function typeInk(type: string): TypeInk {
  const hit = inkCache.get(type)
  if (hit) return hit
  const bg = TYPE_COLOR[type] ?? '#888888'
  const white = contrastRatio(bg, INK_LIGHT)
  const out = white >= 4.5 ? { ink: INK_LIGHT, outline: false } : white >= 3 ? { ink: INK_LIGHT, outline: true } : { ink: INK_DARK, outline: false }
  inkCache.set(type, out)
  return out
}

// ─── 기술 분류 아이콘: PokéRogue images/categories.png (84×11 = 28×11 세 칸: 물리·특수·변화, CC BY-NC-SA 4.0) ─────
export const CATEGORY_SHEET = 'https://raw.githubusercontent.com/pagefaultgames/pokerogue-assets/beta/images/categories.png'
export const CATEGORY_INDEX: Record<string, number> = { physical: 0, special: 1, status: 2 }
export const CAT_KEY: Record<string, MessageKey> = { physical: 'catPhysical', special: 'catSpecial', status: 'catStatus' }
