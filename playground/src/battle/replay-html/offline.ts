// ─── 리플레이 → 오프라인 재생기 데이터 (저장할 때 한 번: 문장·이름·스프라이트를 다 풀어서 넣는다) ───
import type { PlayerID } from '../lib/engine'
import { sideOfId, type Frame, type PokeView } from '../lib/frame'
import { frameText, type SimulatedReplay } from '../lib/frames'
import { frameDelay } from '../lib/hud'
import { type Lang } from '../lib/messages'
import { pokemonLabel, statusShort } from '../lib/names'
import { battleSprite3dCandidates, battleSpriteCandidates, isHomeSprite } from '../lib/sprites'
import type { OEvent, OfflineReplay, OMon, OSprite, OStep } from './player/types'

/** 1배속 기준 장면 시간 (데모 기본 속도와 같다) */
const BASE_SPEED = 650
const SELF_TARGETS = new Set(['user', 'users-field', 'user-and-allies', 'all-allies', 'entire-field', 'user-or-ally', 'ally'])

export const spriteKey = (species: string, back: boolean, shiny: boolean) => `${species}|${back ? 'b' : 'f'}${shiny ? '|s' : ''}`

function eventOf(f: Frame): OEvent | undefined {
  const e = f.event
  switch (e.type) {
    case 'move_use':
      if (e.move.name === 'metronome') return undefined
      return { k: 'move', by: sideOfId(e.pokemon_id), self: SELF_TARGETS.has(e.move.target), mv: e.move }
    case 'damage': return e.amount > 0 ? { k: e.crit ? 'crit' : 'hit', on: sideOfId(e.pokemon_id) } : undefined
    case 'heal': return { k: 'heal', on: sideOfId(e.pokemon_id) }
    case 'faint': return { k: 'faint', on: sideOfId(e.pokemon_id) }
    case 'status_apply': return { k: 'status', on: sideOfId(e.pokemon_id) }
    case 'switch': {
      const p = sideOfId(e.in_id)
      return { k: 'enter', on: p, shiny: f[p].active.id === e.in_id && f[p].active.shiny }
    }
    case 'terastallize':
    case 'mega_evolve':
    case 'forme_change': return { k: 'shimmer', on: sideOfId(e.pokemon_id) }
    default: return undefined
  }
}

export interface OfflineInput {
  sim: SimulatedReplay
  lang: Lang
  me: PlayerID
  names: [string, string]
  sideName?: (p: PlayerID) => string
  result: string | null
  /** 맨 끝에 붙일 문장 (기권 등) */
  tail: string | null
  labels: OfflineReplay['labels']
}

/** 스프라이트 없이 장면 데이터만 (스프라이트 키 목록은 neededSprites 로) */
export function buildOfflineReplay(input: OfflineInput): OfflineReplay {
  const { sim, lang, me, sideName } = input
  const mons: OMon[] = []
  const monIndex = new Map<string, number>()
  const monOf = (p: PokeView, side: PlayerID): number => {
    const m: OMon = {
      n: pokemonLabel(p, lang),
      lv: p.level,
      hp: p.hp,
      mx: p.max_hp,
      st: p.status ? [statusShort(p.status, lang), p.status] : null,
      f: p.fainted,
      s: spriteKey(p.species, side === me ? true : false, p.shiny),
    }
    const k = JSON.stringify(m)
    let i = monIndex.get(k)
    if (i === undefined) { i = mons.length; mons.push(m); monIndex.set(k, i) }
    return i
  }
  const steps: OStep[] = []
  const frames = sim.frames
  frames.forEach((f, i) => {
    const last = i === frames.length - 1
    if (f.silent && !last && i !== 0) return
    const step: OStep = {
      t: f.silent ? null : frameText(f, lang, sideName),
      turn: f.turn,
      m: [monOf(f.p1.active, 'p1'), monOf(f.p2.active, 'p2')],
      w: Math.max(f.silent ? 0 : 300, frameDelay(f, BASE_SPEED)),
    }
    const ev = f.silent ? undefined : eventOf(f)
    if (ev) step.ev = ev
    steps.push(step)
  })
  if (input.tail && steps.length) {
    const lastStep = steps.at(-1)!
    steps.push({ ...lastStep, t: input.tail, ev: undefined, w: BASE_SPEED })
  }
  return { me, names: input.names, mons, steps, sprites: {}, result: input.result, labels: input.labels }
}

/** 팀 목록 카드 그림의 키 */
export const cardKey = (species: string) => `${species}|c`

export function neededSprites(r: OfflineReplay): string[] {
  return [...new Set(r.mons.map(m => m.s))]
}

/** 한 장이 이보다 크면 다음 후보 (움직이는 3D 모델 그림은 몇 MB 씩 된다) */
const MAX_BYTES = 1_500_000

async function fetchDataUri(url: string, ms = 10_000): Promise<string | null> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), ms)
  try {
    const res = await fetch(url, { signal: ctl.signal })
    if (!res.ok) return null
    const blob = await res.blob()
    if (!blob.type.startsWith('image/') || blob.size > MAX_BYTES) return null
    return await new Promise<string | null>(resolve => {
      const r = new FileReader()
      r.onload = () => resolve(typeof r.result === 'string' ? r.result : null)
      r.onerror = () => resolve(null)
      r.readAsDataURL(blob)
    })
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** 키 → 실제로 받은 첫 후보를 data: URI 로 (못 받은 건 빠진다: 재생기가 이름만 보여 준다) */
export async function loadSprites(keys: string[], style: '2d' | '3d'): Promise<Record<string, OSprite>> {
  const out: Record<string, OSprite> = {}
  await Promise.all(keys.map(async key => {
    const [species, dir, sh] = key.split('|')
    const back = dir === 'b'
    const shiny = sh === 's'
    const cands = dir === 'c'
      // 팀 목록 카드: 작은 정지 도트 먼저
      ? battleSpriteCandidates(species!, false).sort((a, b) => Number(!a.endsWith('.png')) - Number(!b.endsWith('.png')))
      : style === '3d' ? battleSprite3dCandidates(species!, back, shiny) : battleSpriteCandidates(species!, back, shiny)
    for (const url of cands) {
      const src = await fetchDataUri(url)
      if (!src) continue
      const flip = back && (isHomeSprite(url) || !/\/back\/|ani-back/.test(url))
      // 3D 그림(Showdown·HOME·모델)은 매끈하게, 도트는 그대로
      const px = !/\/other\/(showdown|home)\/|play\.pokemonshowdown\.com|generation-ix/.test(url)
      out[key] = { src, px, flip }
      return
    }
  }))
  return out
}
