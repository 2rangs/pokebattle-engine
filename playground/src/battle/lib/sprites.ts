// ─── 배틀 에셋 URL (PokeAPI sprites·cries, Pokémon Showdown 클라이언트 fx) ─────
// 모두 GitHub raw 의 오픈소스 저장소 파일이다 (Showdown 서버를 직접 핫링크하지 않는다).
import { getPokeApiSpecies, getSpecies, listPokeApiSpecies } from './engine'

const SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites'
const POKEMON = `${SPRITES}/pokemon`
const FX = 'https://raw.githubusercontent.com/smogon/pokemon-showdown-client/master/play.pokemonshowdown.com/fx'

// ─── 종 → PokeAPI 포켓몬 id (폼 포함) ───────────────────────────
export interface SpriteIds {
  /** PokeAPI pokemon id (폼이면 10000번대) */
  form: number
  /** 전국도감 번호 (폼 스프라이트가 없을 때) */
  num: number
}

const idCache = new Map<string, SpriteIds | null>()

/**
 * 엔진 종 슬러그 → 스프라이트 id.
 * 1) PokeAPI 슬러그 그대로 (rotom-wash → 10009, charizard-mega-x → 10034)
 * 2) 엔진의 대표 슬러그 (minior → minior-red-meteor, toxtricity → toxtricity-amped)
 * 3) 뒤에서부터 폼 표기를 떼어 가며 (vivillon-fancy → vivillon, ogerpon-wellspring → 기본형)
 * 4) 같은 전국도감 번호의 기본 폼
 */
export function spriteIdsOf(slug: string): SpriteIds | null {
  if (idCache.has(slug)) return idCache.get(slug)!
  const sp = getSpecies(slug)
  const num = sp?.id ?? getPokeApiSpecies(slug)?.num ?? 0
  let api = getPokeApiSpecies(slug) ?? (sp ? getPokeApiSpecies(sp.name) : undefined)
  if (!api) {
    const parts = slug.split('-')
    for (let i = parts.length - 1; i >= 1 && !api; i--) {
      const base = parts.slice(0, i).join('-')
      api = getPokeApiSpecies(base) ?? listPokeApiSpecies().find(s => s.slug.startsWith(`${base}-`) && s.num === num && s.default)
    }
  }
  if (!api && num) api = listPokeApiSpecies().find(s => s.num === num && s.default)
  const out = api ? { form: api.id, num: api.num } : num ? { form: num, num } : null
  idCache.set(slug, out)
  return out
}

/**
 * 배틀 스프라이트 후보 (앞에서부터 시도):
 * Showdown 애니메이션 gif(폼 → 기본) → 정지 도트 png(폼 → 기본) → 공식 일러스트.
 * 9세대 일부(오거폰 등)는 gif 가 없어 정지 도트로 내려간다.
 */
export function battleSpriteCandidates(slug: string, back: boolean): string[] {
  const ids = spriteIdsOf(slug)
  if (!ids) return []
  const uniq = [...new Set([ids.form, ids.num])]
  const dir = back ? 'back/' : ''
  return [
    ...uniq.map(id => `${POKEMON}/other/showdown/${dir}${id}.gif`),
    ...uniq.map(id => `${POKEMON}/${dir}${id}.png`),
    `${POKEMON}/other/official-artwork/${ids.form}.png`,
  ]
}

/** Pokémon HOME 3D 렌더 (512×512 정지 그림, 앞모습만) */
export const homeSpriteUrl = (id: number) => `${POKEMON}/other/home/${id}.png`
export const isHomeSprite = (url: string) => url.includes('/other/home/')

/**
 * 3D 후보: HOME 렌더(폼 → 기본) 다음에 2D 후보 (HOME 그림이 없으면 2D 로 내려간다).
 * 우리 쪽도 앞모습을 좌우로 뒤집어 쓴다 (HOME 은 뒷모습이 없다).
 */
export function battleSprite3dCandidates(slug: string, back: boolean): string[] {
  const ids = spriteIdsOf(slug)
  if (!ids) return []
  return [...[...new Set([ids.form, ids.num])].map(homeSpriteUrl), ...battleSpriteCandidates(slug, back)]
}

/** 작은 아이콘 (팀 빌더·교체 화면): Gen 5 B/W 애니메이션 → 정지 도트 */
export function iconCandidates(slug: string): string[] {
  const ids = spriteIdsOf(slug)
  if (!ids) return []
  const uniq = [...new Set([ids.form, ids.num])]
  return [
    ...uniq.map(id => `${POKEMON}/versions/generation-v/black-white/animated/${id}.gif`),
    ...uniq.map(id => `${POKEMON}/${id}.png`),
  ]
}

export const cryUrl = (slug: string): string | null => {
  const ids = spriteIdsOf(slug)
  return ids ? `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${ids.form}.ogg` : null
}

// ─── 타입·도구 아이콘 ─────────────────────────────────────────
/** PokeAPI 타입 번호 */
export const TYPE_ID: Record<string, number> = {
  normal: 1, fighting: 2, flying: 3, poison: 4, ground: 5, rock: 6, bug: 7, ghost: 8, steel: 9,
  fire: 10, water: 11, grass: 12, electric: 13, psychic: 14, ice: 15, dragon: 16, dark: 17, fairy: 18, stellar: 19,
}

/** SV 타입 아이콘 (200×40, 왼쪽 원이 문양) */
export const typeIconUrl = (type: string): string | null =>
  TYPE_ID[type] ? `${SPRITES}/types/generation-ix/scarlet-violet/${TYPE_ID[type]}.png` : null

/** 게임 타입 색 (기술 버튼·배지) */
export const TYPE_COLOR: Record<string, string> = {
  normal: '#9fa19f', fighting: '#ff8000', flying: '#81b9ef', poison: '#9141cb', ground: '#915121', rock: '#afa981',
  bug: '#91a119', ghost: '#704170', steel: '#60a1b8', fire: '#e62829', water: '#2980ef', grass: '#3fa129',
  electric: '#fac000', psychic: '#ef4179', ice: '#3dcef3', dragon: '#5060e1', dark: '#624d4e', fairy: '#ef70ef',
  stellar: '#40b5a5', typeless: '#68a090',
}

export const itemIconUrl = (item: string) => `${SPRITES}/items/${item}.png`
export const POKE_BALL = `${SPRITES}/items/poke-ball.png`

// ─── 배경 (Showdown 클라이언트 fx/bg-*.png) ─────────────────────
export const BACKGROUNDS = [
  'meadow', 'route', 'forest', 'beach', 'beachshore', 'city', 'desert', 'mountain', 'river',
  'thunderplains', 'dampcave', 'earthycave', 'icecave', 'volcanocave', 'deepsea',
] as const
export type Background = typeof BACKGROUNDS[number]

export const backgroundUrl = (bg: Background) => `${FX}/bg-${bg}.png`

/** 같은 시드 → 같은 배경 (리플레이도 같은 그림) */
export function backgroundFor(seed: number): Background {
  let h = (seed ^ 0x9e3779b9) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0
  h = (h ^ (h >>> 16)) >>> 0
  return BACKGROUNDS[h % BACKGROUNDS.length]!
}

// ─── 기술 연출 (Showdown 클라이언트 fx 스프라이트) ───────────────
export type FxSprite =
  | 'fireball' | 'waterwisp' | 'lightning' | 'iceball' | 'poisonwisp' | 'shadowball'
  | 'energyball' | 'mistball' | 'wisp' | 'electroball' | 'impact'

const TYPE_FX: Record<string, FxSprite> = {
  fire: 'fireball', water: 'waterwisp', electric: 'electroball', ice: 'iceball', poison: 'poisonwisp',
  ghost: 'shadowball', dark: 'shadowball', grass: 'energyball', bug: 'energyball', psychic: 'mistball', fairy: 'mistball',
  dragon: 'shadowball', flying: 'wisp', steel: 'wisp', normal: 'wisp', fighting: 'impact', rock: 'impact', ground: 'impact',
}

export const fxUrl = (s: FxSprite) => `${FX}/${s}.png`

/**
 * 공격 기술의 연출: 접촉 기술은 몸통 돌진 + 충격, 그 밖은 타입 색 탄이 날아간다.
 * 변화 기술은 null.
 */
export function moveFx(move: { type: string; category: string; flags?: string[] }): { projectile: FxSprite | null; impact: FxSprite } | null {
  if (move.category === 'status') return null
  const contact = move.flags?.includes('contact') ?? false
  const sprite = TYPE_FX[move.type] ?? 'wisp'
  return { projectile: contact ? null : sprite, impact: contact || sprite === 'impact' ? 'impact' : sprite }
}

/** 피격 순간의 빛 (타입 색 반짝임 위에 겹치는 스프라이트) */
export const hitFlash = (type: string): FxSprite => (type === 'electric' ? 'lightning' : TYPE_FX[type] ?? 'impact')
