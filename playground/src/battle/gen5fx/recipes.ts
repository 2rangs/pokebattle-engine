// ─── 5세대풍 기술 연출: 기술 → 연출 레시피 (순수 함수, 모든 기술에 대해 결정적) ─────
// 기술 데이터(타입·분류·위력·대상·Showdown 플래그·능력치 변화·이름)로 템플릿을 고르고 타입 팔레트·도트로 색을 입힌다.
// 대표 기술은 OVERRIDES 로 따로 다듬는다. 시간 단위는 30fps 프레임.
import { paletteOf, TYPE_PALETTE, type Palette, type TexName } from './art'

export type Anchor = 'att' | 'def' | 'mid' | 'sky' | 'screen' | 'ground'
export type Who = 'att' | 'def'

/** [최소, 최대] */
type Range = readonly [number, number]

export interface ParticleSpec {
  tex: TexName
  /** 0~1: 팔레트 대신 쓸 색 (heal, white 등). 없으면 기술 팔레트 */
  pal?: Palette
  count: number
  /** 방출 반경 (px) */
  spread?: number
  /** 속도 (px/프레임) */
  speed?: Range
  /** 방향 각도 범위 (도, 0 = 오른쪽, 90 = 아래) */
  angle?: Range
  gravity?: number
  drag?: number
  life: Range
  /** 시작 → 끝 크기 배율 */
  scale?: readonly [number, number]
  /** 끝에서 사라지기 시작하는 지점 (0~1) */
  fade?: number
  spin?: number
  /** 공격자 → 대상 방향으로 각도를 돌린다 */
  aim?: boolean
}

export type Step =
  | { kind: 'burst'; at: number; anchor: Anchor; p: ParticleSpec; dur?: number; every?: number }
  | { kind: 'shot'; at: number; from: Anchor; to: Anchor; tex: TexName; pal?: Palette; count: number; interval: number; travel: number; arc?: number; jitter?: number; scale?: number; spin?: number; trail?: ParticleSpec; impact?: ParticleSpec }
  | { kind: 'beam'; at: number; from: Anchor; to: Anchor; dur: number; width: number }
  | { kind: 'bolt'; at: number; from: Anchor; to: Anchor; dur: number }
  | { kind: 'ring'; at: number; anchor: Anchor; dur: number; r0: number; r1: number; thick: number; count?: number; interval?: number; pal?: Palette }
  | { kind: 'slash'; at: number; anchor: Anchor; dur: number; count: number; len: number; angle: number }
  | { kind: 'orbit'; at: number; anchor: Anchor; dur: number; tex: TexName; pal?: Palette; count: number; radius: number; turns: number; rise?: number }
  | { kind: 'lunge' | 'hop' | 'shake' | 'blink' | 'squash'; at: number; dur: number; who: Who; amp?: number }
  | { kind: 'flash' | 'tint'; at: number; dur: number; color: 'light' | 'mid' | 'dark' | 'white' | 'black'; alpha: number }
  | { kind: 'quake'; at: number; dur: number; amp: number }

export interface Recipe {
  /** 어떤 템플릿을 골랐는지 (테스트·디버그용) */
  template: string
  pal: Palette
  frames: number
  steps: Step[]
}

/** 레시피를 고르는 데 필요한 기술 정보 (엔진의 MoveData 와 호환) */
export interface MoveInfo {
  name: string
  type: string
  category: 'physical' | 'special' | 'status' | string
  power?: number | null
  priority?: number
  target?: string
  flags?: string[]
  stat_changes?: { stat: string; change: number }[]
}

const SELF = new Set(['user', 'users-field', 'user-and-allies', 'all-allies', 'ally', 'user-or-ally'])
const FIELD = new Set(['entire-field', 'users-field', 'opponents-field'])
const SPREAD = new Set(['all-opponents', 'all-other-pokemon', 'all-pokemon'])

/** 타입별 투사체·파편 도트 */
const TYPE_TEX: Record<string, TexName> = {
  normal: 'star', fire: 'flame', water: 'drop', electric: 'spark', grass: 'leaf', ice: 'shard', fighting: 'star',
  poison: 'bubble', ground: 'rock', flying: 'feather', psychic: 'orb', bug: 'dot', rock: 'rock', ghost: 'orb',
  dragon: 'orb', dark: 'orb', steel: 'shard', fairy: 'star', stellar: 'star',
}
const texOf = (type: string): TexName => TYPE_TEX[type] ?? 'star'

const has = (m: MoveInfo, f: string) => !!m.flags?.includes(f)

/** 위력 → 연출 세기 (0.8 ~ 1.6) */
function intensity(m: MoveInfo): number {
  const p = m.power ?? 0
  if (p >= 150) return 1.6
  if (p >= 110) return 1.35
  if (p >= 80) return 1.15
  if (p >= 50) return 1
  return 0.85
}

// ─── 공통 조각 ─────────────────────────────────────────────
const impact = (at: number, type: string, k: number, tex: TexName = texOf(type)): Step[] => [
  { kind: 'burst', at, anchor: 'def', p: { tex, count: Math.round(8 * k), spread: 4, speed: [1.5, 3.5 * k], life: [8, 14], scale: [1, 0.6], gravity: type === 'ground' || type === 'rock' ? 0.25 : 0, drag: 0.9, spin: 0.3 } },
  { kind: 'burst', at, anchor: 'def', p: { tex: 'spark', pal: TYPE_PALETTE.white, count: 4, spread: 2, speed: [2, 4], life: [4, 7] } },
  { kind: 'shake', at, dur: 8, who: 'def', amp: 3 * k },
  { kind: 'blink', at: at + 1, dur: 8, who: 'def' },
]

// ─── 템플릿 ───────────────────────────────────────────────
function contact(m: MoveInfo, k: number): Recipe {
  const tex: TexName = has(m, 'punch') ? 'fist' : has(m, 'bite') ? 'fang' : texOf(m.type)
  const steps: Step[] = [{ kind: 'lunge', at: 0, dur: 10, who: 'att', amp: 1 }]
  const hit = 6
  if (has(m, 'slicing')) steps.push({ kind: 'slash', at: hit, anchor: 'def', dur: 8, count: m.type === 'normal' ? 1 : 2, len: 34 * k, angle: -35 })
  else if (has(m, 'punch') || has(m, 'bite')) steps.push({ kind: 'burst', at: hit, anchor: 'def', p: { tex, count: 1, spread: 0, speed: [0, 0], life: [10, 10], scale: [2.2, 1.6], fade: 0.5 } })
  steps.push(...impact(hit, m.type, k))
  if (k >= 1.35) steps.push({ kind: 'flash', at: hit, dur: 3, color: 'white', alpha: 0.35 }, { kind: 'quake', at: hit, dur: 8, amp: 2 })
  return { template: has(m, 'punch') ? 'punch' : has(m, 'bite') ? 'bite' : has(m, 'slicing') ? 'slash' : 'contact', pal: paletteOf(m.type), frames: hit + 18, steps }
}

function projectile(m: MoveInfo, k: number): Recipe {
  const tex: TexName = has(m, 'bullet') ? 'bigOrb' : texOf(m.type)
  const n = has(m, 'bullet') ? 1 : Math.round(3 * k)
  const travel = 10
  const steps: Step[] = [
    { kind: 'hop', at: 0, dur: 6, who: 'att' },
    { kind: 'shot', at: 2, from: 'att', to: 'def', tex, count: n, interval: 3, travel, arc: m.category === 'physical' ? 18 : 6, jitter: 6, scale: has(m, 'bullet') ? 1.2 : 1, spin: 0.25,
      trail: { tex: 'dot', count: 1, spread: 2, life: [5, 8], scale: [1, 0.4] } },
  ]
  const hit = 2 + (n - 1) * 3 + travel
  steps.push(...impact(hit, m.type, k))
  return { template: has(m, 'bullet') ? 'ball' : 'projectile', pal: paletteOf(m.type), frames: hit + 16, steps }
}

function beam(m: MoveInfo, k: number): Recipe {
  const dur = Math.round(16 * k)
  const steps: Step[] = [
    { kind: 'burst', at: 0, anchor: 'att', p: { tex: 'spark', count: 6, spread: 14, speed: [0.5, 1], angle: [0, 360], life: [6, 10], scale: [1, 0.4] }, dur: 6, every: 2 },
    { kind: 'beam', at: 6, from: 'att', to: 'def', dur, width: Math.round(5 * k) },
    { kind: 'tint', at: 4, dur: dur + 6, color: 'black', alpha: 0.3 },
    ...impact(10, m.type, k),
    { kind: 'burst', at: 10, anchor: 'def', p: { tex: texOf(m.type), count: 3, spread: 6, speed: [1, 3], life: [6, 10] }, dur: dur - 4, every: 3 },
  ]
  if (k >= 1.35) steps.push({ kind: 'flash', at: 8, dur: 5, color: 'light', alpha: 0.5 }, { kind: 'quake', at: 10, dur: dur, amp: 2 })
  return { template: 'beam', pal: paletteOf(m.type), frames: 6 + dur + 10, steps }
}

function pulse(m: MoveInfo, k: number): Recipe {
  const steps: Step[] = [
    { kind: 'ring', at: 0, anchor: 'att', dur: 10, r0: 4, r1: 26, thick: 2, count: 3, interval: 3 },
    { kind: 'shot', at: 4, from: 'att', to: 'def', tex: 'orb', count: 3, interval: 3, travel: 10, jitter: 0, scale: 1 },
    { kind: 'ring', at: 14, anchor: 'def', dur: 10, r0: 6, r1: 30 * k, thick: 2, count: 2, interval: 3 },
    ...impact(16, m.type, k),
  ]
  return { template: 'pulse', pal: paletteOf(m.type), frames: 34, steps }
}

function sound(m: MoveInfo, k: number): Recipe {
  const status = m.category === 'status'
  const steps: Step[] = [
    { kind: 'ring', at: 0, anchor: 'att', dur: 14, r0: 6, r1: 40, thick: 1, count: 4, interval: 4 },
    { kind: 'shot', at: 2, from: 'att', to: 'def', tex: 'note', count: 4, interval: 4, travel: 14, arc: 10, jitter: 10 },
  ]
  if (!status) steps.push(...impact(18, m.type, k))
  else steps.push({ kind: 'blink', at: 18, dur: 8, who: 'def' })
  return { template: 'sound', pal: paletteOf(m.type), frames: 32, steps }
}

function wind(m: MoveInfo, k: number): Recipe {
  const steps: Step[] = [
    { kind: 'burst', at: 0, anchor: 'att', p: { tex: m.type === 'flying' ? 'feather' : texOf(m.type), count: 3, spread: 10, speed: [4, 6], angle: [-10, 10], aim: true, life: [14, 18], spin: 0.2 }, dur: 14, every: 2 },
    { kind: 'slash', at: 6, anchor: 'mid', dur: 12, count: 3, len: 60, angle: 0 },
    ...impact(14, m.type, k),
  ]
  return { template: 'wind', pal: paletteOf(m.type), frames: 32, steps }
}

/** 타입별 특수기 */
function special(m: MoveInfo, k: number): Recipe {
  const pal = paletteOf(m.type)
  switch (m.type) {
    case 'electric':
      return { template: 'bolt', pal, frames: 26, steps: [
        { kind: 'burst', at: 0, anchor: 'att', p: { tex: 'spark', count: 3, spread: 12, speed: [0.5, 1.5], angle: [0, 360], life: [4, 7] }, dur: 6, every: 2 },
        { kind: 'bolt', at: 6, from: 'sky', to: 'def', dur: Math.round(8 * k) },
        { kind: 'flash', at: 6, dur: 3, color: 'light', alpha: 0.6 },
        ...impact(8, m.type, k),
      ] }
    case 'fire':
      return { template: 'flames', pal, frames: 30, steps: [
        { kind: 'burst', at: 0, anchor: 'att', p: { tex: 'flame', count: 2, spread: 3, speed: [4, 5.5], angle: [-8, 8], aim: true, life: [11, 13], scale: [0.8, 1.6], fade: 0.6 }, dur: 12, every: 1 },
        ...impact(10, m.type, k),
        { kind: 'burst', at: 12, anchor: 'def', p: { tex: 'flame', count: 2, spread: 10, speed: [0.3, 1], angle: [250, 290], life: [8, 12], scale: [1, 0.5] }, dur: 8, every: 2 },
      ] }
    case 'water':
      return { template: 'jets', pal, frames: 30, steps: [
        { kind: 'burst', at: 0, anchor: 'att', p: { tex: 'drop', count: 2, spread: 3, speed: [5, 6], angle: [-6, 6], aim: true, life: [10, 12], scale: [1, 1.3], spin: 0 }, dur: 12, every: 1 },
        ...impact(10, m.type, k, 'bubble'),
        { kind: 'burst', at: 10, anchor: 'def', p: { tex: 'drop', count: 6, spread: 4, speed: [1.5, 3], angle: [200, 340], gravity: 0.3, life: [10, 14] } },
      ] }
    case 'grass':
      return { template: 'leaves', pal, frames: 30, steps: [
        { kind: 'shot', at: 0, from: 'att', to: 'def', tex: 'leaf', count: Math.round(5 * k), interval: 2, travel: 12, arc: 14, jitter: 14, spin: 0.4 },
        ...impact(14, m.type, k),
      ] }
    case 'ice':
      return { template: 'ice', pal, frames: 30, steps: [
        { kind: 'shot', at: 0, from: 'att', to: 'def', tex: 'shard', count: Math.round(5 * k), interval: 2, travel: 10, jitter: 8, spin: 0 },
        ...impact(12, m.type, k, 'shard'),
        { kind: 'flash', at: 12, dur: 4, color: 'light', alpha: 0.35 },
      ] }
    case 'psychic':
      return { template: 'psywave', pal, frames: 30, steps: [
        { kind: 'tint', at: 0, dur: 28, color: 'mid', alpha: 0.2 },
        { kind: 'ring', at: 4, anchor: 'def', dur: 18, r0: 34, r1: 4, thick: 2, count: 4, interval: 4 },
        { kind: 'squash', at: 8, dur: 16, who: 'def', amp: 0.15 },
        ...impact(16, m.type, k, 'orb'),
      ] }
    case 'ghost': case 'dark':
      return { template: 'shadow', pal, frames: 32, steps: [
        { kind: 'tint', at: 0, dur: 30, color: 'black', alpha: 0.4 },
        { kind: 'shot', at: 4, from: 'att', to: 'def', tex: 'bigOrb', count: 1, interval: 1, travel: 12, scale: 1.2, trail: { tex: 'puff', count: 1, spread: 3, life: [6, 9], scale: [0.8, 0.3] } },
        ...impact(16, m.type, k, 'puff'),
      ] }
    case 'dragon':
      return { template: 'dragon', pal, frames: 32, steps: [
        { kind: 'orbit', at: 0, anchor: 'att', dur: 12, tex: 'orb', count: 6, radius: 16, turns: 1 },
        { kind: 'shot', at: 10, from: 'att', to: 'def', tex: 'bigOrb', count: 2, interval: 3, travel: 10, arc: -12, jitter: 6 },
        ...impact(22, m.type, k, 'star'),
      ] }
    case 'fairy':
      return { template: 'sparkle', pal, frames: 30, steps: [
        { kind: 'shot', at: 0, from: 'att', to: 'def', tex: 'star', count: 5, interval: 2, travel: 12, arc: 16, jitter: 12, spin: 0.2 },
        ...impact(14, m.type, k, 'star'),
        { kind: 'flash', at: 14, dur: 4, color: 'light', alpha: 0.4 },
      ] }
    case 'ground': case 'rock':
      return { template: 'rocks', pal, frames: 30, steps: [
        { kind: 'burst', at: 0, anchor: 'sky', p: { tex: 'rock', count: 1, spread: 26, speed: [3, 4], angle: [85, 95], gravity: 0.35, life: [12, 14], spin: 0.2, scale: [1.3, 1.3] }, dur: 10, every: 2 },
        { kind: 'quake', at: 10, dur: 12, amp: 2 },
        ...impact(12, m.type, k, 'rock'),
      ] }
    case 'poison':
      return { template: 'sludge', pal, frames: 30, steps: [
        { kind: 'shot', at: 0, from: 'att', to: 'def', tex: 'bubble', count: 4, interval: 3, travel: 12, arc: 20, jitter: 8 },
        ...impact(18, m.type, k, 'bubble'),
        { kind: 'burst', at: 18, anchor: 'def', p: { tex: 'bubble', count: 5, spread: 12, speed: [0.3, 0.8], angle: [260, 280], life: [10, 16], scale: [0.6, 1.2] } },
      ] }
    default:
      return projectile(m, k)
  }
}

function spread(m: MoveInfo, k: number): Recipe {
  if (m.type === 'ground') {
    return { template: 'quake', pal: paletteOf(m.type), frames: 30, steps: [
      { kind: 'quake', at: 0, dur: 24, amp: 4 * k },
      { kind: 'burst', at: 0, anchor: 'ground', p: { tex: 'rock', count: 2, spread: 120, speed: [1, 2.5], angle: [250, 290], gravity: 0.3, life: [10, 14] }, dur: 16, every: 2 },
      { kind: 'shake', at: 2, dur: 20, who: 'def', amp: 3 },
      { kind: 'blink', at: 10, dur: 8, who: 'def' },
    ] }
  }
  return { template: 'spread', pal: paletteOf(m.type), frames: 30, steps: [
    { kind: 'burst', at: 0, anchor: 'sky', p: { tex: texOf(m.type), count: 3, spread: 70, speed: [3, 5], angle: [70, 110], gravity: 0.1, life: [14, 18], spin: 0.2 }, dur: 14, every: 2 },
    { kind: 'tint', at: 0, dur: 26, color: 'mid', alpha: 0.18 },
    ...impact(14, m.type, k),
  ] }
}

// ─── 변화기 ───────────────────────────────────────────────
function boost(m: MoveInfo): Recipe {
  return { template: 'boost', pal: paletteOf(m.type), frames: 30, steps: [
    { kind: 'orbit', at: 0, anchor: 'att', dur: 24, tex: 'spark', count: 8, radius: 18, turns: 1.5, rise: -24 },
    { kind: 'burst', at: 4, anchor: 'att', p: { tex: 'dot', count: 2, spread: 14, speed: [0.8, 1.4], angle: [265, 275], life: [10, 14] }, dur: 16, every: 2 },
    { kind: 'hop', at: 6, dur: 8, who: 'att' },
    { kind: 'flash', at: 10, dur: 4, color: 'light', alpha: 0.25 },
  ] }
}

function heal(): Recipe {
  return { template: 'heal', pal: TYPE_PALETTE.heal!, frames: 30, steps: [
    { kind: 'burst', at: 0, anchor: 'att', p: { tex: 'spark', count: 2, spread: 18, speed: [0.6, 1], angle: [265, 275], life: [12, 16], fade: 0.5 }, dur: 20, every: 2 },
    { kind: 'ring', at: 2, anchor: 'att', dur: 16, r0: 24, r1: 6, thick: 1, count: 2, interval: 6 },
    { kind: 'blink', at: 10, dur: 10, who: 'att' },
  ] }
}

function protect(m: MoveInfo): Recipe {
  return { template: 'protect', pal: paletteOf(m.type === 'normal' ? 'water' : m.type), frames: 26, steps: [
    { kind: 'ring', at: 0, anchor: 'att', dur: 20, r0: 30, r1: 30, thick: 2 },
    { kind: 'ring', at: 4, anchor: 'att', dur: 14, r0: 22, r1: 34, thick: 1 },
    { kind: 'flash', at: 2, dur: 4, color: 'light', alpha: 0.3 },
    { kind: 'burst', at: 2, anchor: 'att', p: { tex: 'spark', count: 2, spread: 30, speed: [0, 0.3], life: [6, 10] }, dur: 16, every: 2 },
  ] }
}

function powder(m: MoveInfo): Recipe {
  return { template: 'powder', pal: paletteOf(m.type), frames: 30, steps: [
    { kind: 'burst', at: 0, anchor: 'sky', p: { tex: 'dot', count: 3, spread: 24, speed: [1, 1.6], angle: [80, 100], life: [20, 26], spin: 0 }, dur: 16, every: 2 },
    { kind: 'blink', at: 16, dur: 10, who: 'def' },
  ] }
}

function statusFoe(m: MoveInfo): Recipe {
  return { template: 'hex', pal: paletteOf(m.type), frames: 28, steps: [
    { kind: 'ring', at: 0, anchor: 'att', dur: 8, r0: 4, r1: 18, thick: 1 },
    { kind: 'shot', at: 2, from: 'att', to: 'def', tex: 'orb', count: 3, interval: 3, travel: 10, jitter: 4 },
    { kind: 'ring', at: 12, anchor: 'def', dur: 12, r0: 28, r1: 4, thick: 1, count: 2, interval: 4 },
    { kind: 'blink', at: 14, dur: 10, who: 'def' },
  ] }
}

function field(m: MoveInfo): Recipe {
  const tex = m.type === 'water' ? 'drop' : m.type === 'rock' || m.type === 'ground' ? 'rock' : texOf(m.type)
  return { template: 'field', pal: paletteOf(m.type), frames: 34, steps: [
    { kind: 'tint', at: 0, dur: 32, color: 'mid', alpha: 0.22 },
    { kind: 'burst', at: 0, anchor: 'screen', p: { tex, count: 3, spread: 0, speed: [3, 4.5], angle: [95, 105], life: [16, 22], spin: 0.1 }, dur: 26, every: 1 },
  ] }
}

// ─── 대표 기술 직접 조정 ────────────────────────────────────
const OVERRIDES: Record<string, (m: MoveInfo, k: number) => Recipe> = {
  'hyper-beam': (m, k) => beam({ ...m, type: 'normal' }, Math.max(k, 1.6)),
  'giga-impact': (m, k) => contact(m, Math.max(k, 1.6)),
  'thunder': (m, k) => {
    const r = special({ ...m, type: 'electric' }, Math.max(k, 1.35))
    return { ...r, steps: [...r.steps, { kind: 'tint', at: 0, dur: 20, color: 'black', alpha: 0.35 }, { kind: 'quake', at: 8, dur: 8, amp: 2 }] }
  },
  'surf': m => ({ template: 'wave', pal: paletteOf(m.type), frames: 32, steps: [
    { kind: 'burst', at: 0, anchor: 'ground', p: { tex: 'drop', count: 4, spread: 130, speed: [1.5, 3], angle: [250, 290], gravity: 0.15, life: [14, 20], scale: [1.4, 1] }, dur: 20, every: 1 },
    { kind: 'tint', at: 0, dur: 30, color: 'mid', alpha: 0.25 },
    { kind: 'shake', at: 8, dur: 16, who: 'def', amp: 3 },
    { kind: 'blink', at: 12, dur: 10, who: 'def' },
  ] }),
  'earthquake': (m, k) => spread({ ...m, type: 'ground' }, k),
  'explosion': () => ({ template: 'explosion', pal: paletteOf('fire'), frames: 34, steps: [
    { kind: 'flash', at: 0, dur: 6, color: 'white', alpha: 0.9 },
    { kind: 'burst', at: 2, anchor: 'att', p: { tex: 'puff', count: 14, spread: 10, speed: [2, 5], life: [14, 20], scale: [1.2, 2], drag: 0.92 } },
    { kind: 'quake', at: 2, dur: 20, amp: 5 },
    { kind: 'shake', at: 4, dur: 16, who: 'def', amp: 4 },
    { kind: 'blink', at: 8, dur: 10, who: 'def' },
  ] }),
}
OVERRIDES['self-destruct'] = m => OVERRIDES['explosion']!(m, 1.4)
OVERRIDES['misty-explosion'] = (m, k) => ({ ...OVERRIDES['explosion']!(m, k), pal: paletteOf('fairy') })

/** 막기 기술 (Showdown 의 protect 플래그는 '방어로 막히는 기술'이라 이름으로 고른다) */
const PROTECT = /^(protect|detect|spiky-shield|kings-shield|baneful-bunker|obstruct|silk-trap|burning-bulwark|max-guard|wide-guard|quick-guard|mat-block|crafty-shield|endure)$/
const BEAM_NAME = /(beam|ray|cannon|laser|blast-burn|frenzy-plant|hydro-cannon|dynamax-cannon|prismatic)/
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** 기술 → 연출 레시피 */
export function recipeFor(m: MoveInfo): Recipe {
  const name = slug(m.name)
  const k = intensity(m)
  const o = OVERRIDES[name]
  if (o) return o(m, k)
  const target = m.target ?? 'selected-pokemon'
  if (m.category === 'status') {
    if (PROTECT.test(name)) return protect(m)
    if (has(m, 'heal') || /heal|recover|roost|rest|synthesis|moonlight|morning-sun|wish|soft-boiled|milk-drink|slack-off|shore-up/.test(name)) return heal()
    if (FIELD.has(target)) return field(m)
    if (has(m, 'powder')) return powder(m)
    if (has(m, 'sound')) return sound(m, 1)
    if (SELF.has(target) || (m.stat_changes ?? []).some(s => s.change > 0)) return boost(m)
    return statusFoe(m)
  }
  if (has(m, 'sound')) return sound(m, k)
  if (has(m, 'contact')) return contact(m, k)
  if (SPREAD.has(target) && m.category !== 'physical') return spread(m, k)
  if (m.type === 'ground' && SPREAD.has(target)) return spread(m, k)
  if (has(m, 'wind')) return wind(m, k)
  if (has(m, 'pulse')) return pulse(m, k)
  if (BEAM_NAME.test(name) && m.category === 'special') return beam(m, k)
  if (has(m, 'bullet')) return projectile(m, k)
  if (m.category === 'special') return special(m, k)
  return projectile(m, k)
}

/** 이로치가 나올 때의 반짝임 (몬스터볼에서 나온 직후, 포켓몬 둘레로 별이 터진다) */
export function shinyRecipe(): Recipe {
  const pal = TYPE_PALETTE.shiny!
  return { template: 'shiny', pal, frames: 30, steps: [
    { kind: 'burst', at: 10, anchor: 'att', p: { tex: 'star', count: 6, spread: 6, speed: [1.6, 2.4], life: [10, 14], scale: [1, 0.5], fade: 0.5 } },
    { kind: 'burst', at: 13, anchor: 'att', p: { tex: 'spark', count: 6, spread: 22, speed: [0, 0.4], life: [8, 12], fade: 0.4 } },
    { kind: 'burst', at: 17, anchor: 'att', p: { tex: 'star', count: 5, spread: 10, speed: [1.2, 2], life: [8, 12], scale: [0.8, 0.4], fade: 0.5 } },
    { kind: 'ring', at: 10, anchor: 'att', dur: 10, r0: 6, r1: 26, thick: 1 },
  ] }
}
