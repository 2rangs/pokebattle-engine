// ─── 이름·로그 (엔진 다국어 포매터) ─────────────────────────────
// Pokestra 는 자체 도감 이름표를 썼지만, 데모는 엔진에 들어 있는 이름(ko·en 내장, ja 는 loadNames)만 쓴다.
// 로그 문장도 엔진의 createFormatter 가 만든다. 이 파일은 그 위에 HUD 용 짧은 이름과 폼 표기만 더한다.
import {
  createFormatter, generateRandomTeam, getPokeApiSpecies, getSpecies, CONDITION_ENTITY, SHOWN_VOLATILES,
  type BattleEvent, type BattlePokemon, type FormatContext, type Formatter, type PlayerID, type PokemonSet,
} from '../engine'
import { LANGS, type Lang } from './lang'

export const prettify = (slug: string) => slug.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

// ─── 포매터 ──────────────────────────────────────────────────
/** 지금 포맷 중인 프레임의 컨텍스트. 포매터는 동기라서 호출 직전에 바꿔 끼운다 */
let current: FormatContext = { getPokemon: () => undefined }

const plain = new Map<Lang, Formatter>()
/** 이름 덮어쓰기 없는 포매터 (이름 조회·용어용) */
function plainFor(lang: Lang): Formatter {
  let f = plain.get(lang)
  if (!f) plain.set(lang, (f = createFormatter({ locale: lang, getPokemon: () => undefined })))
  return f
}
const n = (lang: Lang) => plainFor(lang).name

const logFormatters = new Map<string, Formatter>()
/** 로그 포매터 (언어 + 진영 이름 사용 여부별). 포켓몬 이름은 폼 표기를 더한 speciesName */
function logFormatterFor(lang: Lang, named: boolean): Formatter {
  const key = `${lang}:${named ? 1 : 0}`
  let f = logFormatters.get(key)
  if (!f) {
    f = createFormatter({
      locale: lang,
      names: { pokemon: s => speciesName(s, lang) },
      getPokemon: id => withoutAutoNickname(current.getPokemon(id)),
      sideName: named ? (p: PlayerID) => current.sideName?.(p) ?? p : undefined,
    })
    logFormatters.set(key, f)
  }
  return f
}

/**
 * 배틀 이벤트 → 현재 언어의 로그 문장. 화면에 보여줄 필요 없는 이벤트는 null.
 * sideName 을 넘기면 "우리 편/상대 편" 대신 진영 이름을 쓴다 (관전 모드).
 */
export function formatBattleEvent(event: BattleEvent, ctx: FormatContext, lang: Lang): string | null {
  const prev = current
  current = ctx
  try {
    return logFormatterFor(lang, !!ctx.sideName).format(event)
  } finally {
    current = prev
  }
}

// ─── 포켓몬 이름 ─────────────────────────────────────────────
/**
 * 종 이름. ko·ja 이름 데이터는 폼 이름이 없어 기본 종 이름으로 나오므로(rotom-wash → 로토무),
 * 그럴 때는 폼 표기를 붙인다 (로토무 (Wash)). en 은 Showdown 이름에 폼이 들어 있다.
 */
export function speciesName(slug: string, lang: Lang): string {
  const name = n(lang).species(slug)
  if (lang === 'en') return name
  const base = getSpecies(slug)?.species_name
  if (!base || base === slug || !slug.startsWith(base + '-')) return name
  return name === n(lang).species(base) ? `${name} (${prettify(slug.slice(base.length + 1))})` : name
}

/** 세트 생성 때 붙은 자동 닉네임(종 이름 등)인지. 자동이면 언어를 바꿀 때 따라 바뀌어야 한다 */
function isAutoFor(species: string, nickname: string): boolean {
  if (nickname === species || nickname === getSpecies(species)?.name || nickname === getSpecies(species)?.showdown) return true
  return LANGS.some(l => nickname === speciesName(species, l) || nickname === n(l).species(species))
}

/** setSpecies: 폼 체인지 전의 원래 종 */
export function isAutoNickname(species: string, nickname: string | null | undefined, setSpecies?: string | null): boolean {
  if (!nickname) return true
  return isAutoFor(species, nickname) || (!!setSpecies && setSpecies !== species && isAutoFor(setSpecies, nickname))
}

/** 표시 이름: 직접 붙인 닉네임이 있으면 그것, 아니면 현재 언어의 종 이름 */
export function pokemonLabel(species: string, nickname: string | null | undefined, lang: Lang, setSpecies?: string | null): string {
  return isAutoNickname(species, nickname, setSpecies) ? speciesName(species, lang) : nickname!
}

function withoutAutoNickname(p: BattlePokemon | undefined): BattlePokemon | undefined {
  if (!p || !isAutoNickname(p.species, p.nickname, p.set?.species)) return p
  return { ...p, nickname: p.species }
}

// ─── 그 밖의 이름 ────────────────────────────────────────────
export const moveName = (slug: string, lang: Lang) => n(lang).move(slug)
export const abilityName = (slug: string, lang: Lang) => n(lang).ability(slug)
export const itemName = (slug: string, lang: Lang) => n(lang).item(slug)

const TYPE_EXTRA: Record<string, Record<Lang, string>> = {
  stellar: { ko: '스텔라', en: 'Stellar', ja: 'ステラ' },
  typeless: { ko: '???', en: '???', ja: '???' },
}
export function typeName(type: string, lang: Lang): string {
  const r = n(lang).type(type)
  return r === prettify(type) && TYPE_EXTRA[type] ? TYPE_EXTRA[type][lang] : r
}

/** HUD 칩용 짧은 능력치 이름 (엔진 용어는 긴 이름이라 따로 둔다) */
const STAT_SHORT: Record<Lang, Record<string, string>> = {
  ko: { hp: 'HP', attack: '공격', defense: '방어', special_attack: '특공', special_defense: '특방', speed: '스피드', accuracy: '명중', evasion: '회피' },
  en: { hp: 'HP', attack: 'Atk', defense: 'Def', special_attack: 'SpA', special_defense: 'SpD', speed: 'Spe', accuracy: 'Acc', evasion: 'Eva' },
  ja: { hp: 'HP', attack: 'こうげき', defense: 'ぼうぎょ', special_attack: 'とくこう', special_defense: 'とくぼう', speed: 'すばやさ', accuracy: 'めいちゅう', evasion: 'かいひ' },
}
export const battleStatLabel = (key: string, lang: Lang) => STAT_SHORT[lang][key] ?? key

const DAMAGE_CLASS: Record<Lang, Record<string, string>> = {
  ko: { physical: '물리', special: '특수', status: '변화' },
  en: { physical: 'Physical', special: 'Special', status: 'Status' },
  ja: { physical: 'ぶつり', special: 'とくしゅ', status: 'へんか' },
}
export const damageClassName = (c: string, lang: Lang) => DAMAGE_CLASS[lang][c] ?? c

// ─── 상태·날씨·필드 (칩·툴팁) ──────────────────────────────────
/** en 용어는 소문자라 칩 라벨로 쓸 때 첫 글자를 대문자로 */
const cap = (s: string, lang: Lang) => (lang === 'en' ? s.replace(/^\p{Ll}/u, c => c.toUpperCase()) : s)
const STATUS_SHORT_EN: Record<string, string> = { burn: 'BRN', freeze: 'FRZ', paralysis: 'PAR', poison: 'PSN', toxic: 'TOX', sleep: 'SLP' }

export const statusName = (s: string, lang: Lang) => (lang === 'en' ? STATUS_SHORT_EN[s] ?? s.toUpperCase() : n(lang).term('status', s))
export const statusLongName = (s: string, lang: Lang) => cap(n(lang).term('status', s), lang)
export const weatherName = (w: string, lang: Lang) => cap(n(lang).term('weather', w), lang)
export const terrainName = (t: string, lang: Lang) => cap(n(lang).effect(t), lang)
export const sideConditionName = (c: string, lang: Lang) => cap(n(lang).effect(c), lang)
export const fieldConditionName = (c: string, lang: Lang) => cap(n(lang).effect(c), lang)
/** 화면에 보여줄 휘발성 상태면 이름, 아니면 null */
export function volatileName(v: string, lang: Lang): string | null {
  if (!SHOWN_VOLATILES.has(v)) return null
  return cap(CONDITION_ENTITY[v] ? n(lang).effect(v) : n(lang).term('volatile', v), lang)
}

// ─── 팀 ──────────────────────────────────────────────────────
/** 랜덤 팀 (Showdown 랜덤배틀 세트). level 이 없으면 랜덤배틀 밸런스 레벨 */
export function buildRandomTeam(seed: number, size = 6, level?: number): PokemonSet[] {
  return generateRandomTeam({ seed, size, level })
}

// ─── 이미지·소리 (PokeAPI 저장소) ─────────────────────────────
/** 종 slug → PokeAPI 포켓몬 id (폼이면 폼 id, 없으면 도감 번호) */
export function dexIdOf(species: string): number | undefined {
  return getPokeApiSpecies(species)?.id ?? getSpecies(species)?.id
}

const SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon'
export const artworkUrl = (id: number) => `${SPRITE_BASE}/other/official-artwork/${id}.png`
export const spriteUrl = (id: number) => `${SPRITE_BASE}/${id}.png`
export const backSpriteUrl = (id: number) => `${SPRITE_BASE}/back/${id}.png`
/** Showdown 애니메이션 배틀 스프라이트 (PokeAPI 미러) */
export const animatedSpriteUrl = (id: number) => `${SPRITE_BASE}/other/showdown/${id}.gif`
export const animatedBackSpriteUrl = (id: number) => `${SPRITE_BASE}/other/showdown/back/${id}.gif`
/** 울음소리 (PokeAPI cries, ogg) */
export const cryUrl = (id: number) => `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${id}.ogg`

export const TYPE_COLOR: Record<string, string> = {
  normal: '#A0A29F', fire: '#FBA54C', water: '#4D90D5', electric: '#F4D23B', grass: '#5FBD58', ice: '#74CEC0',
  fighting: '#D3425F', poison: '#B763CF', ground: '#DA7C4D', flying: '#A1BBEC', psychic: '#FA8581', bug: '#92BC2C',
  rock: '#C9BB8A', ghost: '#5F6DBC', dragon: '#0C69C8', dark: '#595761', steel: '#5695A3', fairy: '#EE90E6',
  stellar: '#7c6cf0', typeless: '#94a3b8',
}
