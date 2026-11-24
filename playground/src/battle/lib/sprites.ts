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
/** 엔진 슬러그 → PokeAPI 이름 (배틀 중 폼체인지가 기본 모습으로 떨어지지 않게). 테라스탈 오거폰은 탈 모습으로 */
const API_ALIAS: Record<string, string> = {
  'meowstic-m-mega': 'meowstic-male-mega',
  'minior': 'minior-red',
  'minior-red-meteor': 'minior-red',
  'minior-meteor': 'minior-red-meteor',
  'ogerpon-teal-tera': 'ogerpon',
  'ogerpon-wellspring-tera': 'ogerpon-wellspring-mask',
  'ogerpon-hearthflame-tera': 'ogerpon-hearthflame-mask',
  'ogerpon-cornerstone-tera': 'ogerpon-cornerstone-mask',
}

export function spriteIdsOf(input: string): SpriteIds | null {
  if (idCache.has(input)) return idCache.get(input)!
  const slug = API_ALIAS[input] ?? input
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
  idCache.set(input, out)
  return out
}

const BW_ANIM = `${POKEMON}/versions/generation-v/black-white/animated`

/**
 * 2D 배틀 스프라이트 (4·5세대 도트 스타일), 앞에서부터 시도:
 * 5세대 블랙·화이트 애니메이션 gif(649번까지, 폼 → 기본) → 정지 도트 png(전 세대, 폼 → 기본) → 공식 일러스트.
 */
export function battleSpriteCandidates(slug: string, back: boolean, shiny = false): string[] {
  const ids = spriteIdsOf(slug)
  if (!ids) return []
  const uniq = [...new Set([ids.form, ids.num])]
  const dir = back ? 'back/' : ''
  // 이로치: 이로치 그림 먼저 (같은 폴더의 shiny/), 없으면 보통 그림
  const shinyFirst = shiny ? [...uniq.map(id => `${BW_ANIM}/${dir}shiny/${id}.gif`), ...uniq.map(id => `${POKEMON}/${dir}shiny/${id}.png`)] : []
  return [
    ...shinyFirst,
    ...uniq.map(id => `${BW_ANIM}/${dir}${id}.gif`),
    ...uniq.map(id => `${POKEMON}/${dir}${id}.png`),
    `${POKEMON}/other/official-artwork/${shiny ? 'shiny/' : ''}${ids.form}.png`,
    ...(shiny ? [`${POKEMON}/other/official-artwork/${ids.form}.png`] : []),
  ]
}

/** Pokémon HOME 3D 렌더 (512×512 정지 그림, 앞모습만) — 3D 애니메이션이 없을 때의 대체 */
export const homeSpriteUrl = (id: number, shiny = false) => `${POKEMON}/other/home/${shiny ? 'shiny/' : ''}${id}.png`
export const isHomeSprite = (url: string) => url.includes('/other/home/')
/** 3D 애니메이션 (6세대 이후 3D 모델, Pokémon Showdown 'ani' 스프라이트를 PokeAPI 가 보관) */
export const showdownAniUrl = (id: number, back = false, shiny = false) => `${POKEMON}/other/showdown/${back ? 'back/' : ''}${shiny ? 'shiny/' : ''}${id}.gif`

/**
 * 3D 배틀 스프라이트 (6세대 이후 3D 모델 스타일), 앞에서부터 시도:
 * 3D 애니메이션 gif(앞·뒷모습, 폼 → 기본) → HOME 3D 렌더(앞모습, 우리 쪽은 좌우 반전) → 2D 후보.
 */
export function battleSprite3dCandidates(slug: string, back: boolean, shiny = false): string[] {
  const ids = spriteIdsOf(slug)
  if (!ids) return []
  // 이 모습(폼)의 그림을 모든 출처에서 먼저 찾고, 그다음에 기본 모습 (메가진화 등 새 폼이 기본 모습으로 떨어지지 않게).
  // 출처: PokeAPI 의 Showdown 3D → Showdown 서버의 3D(PokeAPI 에 아직 없는 새 폼) → HOME 3D 렌더(앞모습)
  const ofId = (id: number, sid: string | null, sh: boolean) => [
    showdownAniUrl(id, back, sh),
    ...(sid ? [psAniUrl(sid, back, sh)] : []),
    homeSpriteUrl(id, sh),
  ]
  const formSid = psSpriteId(slug)
  const form = [...(shiny ? ofId(ids.form, formSid, true) : []), ...ofId(ids.form, formSid, false)]
  const base = ids.num !== ids.form ? [...(shiny ? ofId(ids.num, null, true) : []), ...ofId(ids.num, null, false)] : []
  return [...form, ...base, ...battleSpriteCandidates(slug, back, shiny)]
}

/** Showdown 서버의 3D 애니메이션 (play.pokemonshowdown.com/sprites/ani, ani-back, ani-shiny, ani-back-shiny) */
export const psAniUrl = (spriteId: string, back = false, shiny = false) =>
  `https://play.pokemonshowdown.com/sprites/ani${back ? '-back' : ''}${shiny ? '-shiny' : ''}/${spriteId}.gif`

const toId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
/** Showdown 스프라이트 id: 기본 종 id + '-' + 폼 id (예: Lucario-Mega-Z → lucario-megaz). 폼이 아니면 null */
export function psSpriteId(slug: string): string | null {
  const sp = getSpecies(slug)
  const base = sp?.species_name ? getSpecies(sp.species_name)?.showdown : undefined
  if (!sp || !base || sp.showdown === base || !sp.showdown.startsWith(`${base}-`)) return null
  return `${toId(base)}-${toId(sp.showdown.slice(base.length + 1))}`
}

/** 작은 아이콘 (팀 빌더·교체 화면): Gen 5 B/W 애니메이션 → 정지 도트 */
export function iconCandidates(slug: string, shiny = false): string[] {
  const ids = spriteIdsOf(slug)
  if (!ids) return []
  const uniq = [...new Set([ids.form, ids.num])]
  return [
    ...(shiny ? uniq.map(id => `${POKEMON}/versions/generation-v/black-white/animated/shiny/${id}.gif`) : []),
    ...(shiny ? uniq.map(id => `${POKEMON}/shiny/${id}.png`) : []),
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

/** 기믹 연출 그림 (Showdown 클라이언트 fx): 메가진화·원시회귀 빛(shine), 키스톤 반응(rainbow), Z파워(z-symbol) */
export type GimmickFxSprite = 'shine' | 'rainbow' | 'z-symbol'
export const gimmickFxUrl = (s: GimmickFxSprite) => `${FX}/${s}.png`

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
