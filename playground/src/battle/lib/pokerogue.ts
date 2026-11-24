// ─── PokéRogue 애니메이션 도트 스프라이트 (2D 모드) ─────────────────
// pagefaultgames/pokerogue-assets (beta) 의 images/pokemon/ — Phaser 텍스처 아틀라스(json + png).
// 라이선스: CC BY-NC-SA 4.0 (비영리). 이미지는 저장소에 넣지 않고 URL 로 그대로 불러온다.
// 키: 전국도감 번호 + PokéRogue 폼 키 (479-wash, 6-mega-x, 3-gigantamax).
// 리전폼은 번호에 오프셋 (알로라 2000+, 가라르 4000+, 히스이 6000+, 팔데아 8000+ → 8128-aqua).
// 있는 키 목록(pokerogue-keys.json)은 에셋 저장소 ls-tree 로 만든 것 → 없는 파일을 요청하지 않는다.
import { getPokeApiSpecies, getSpecies } from './engine'
import KEYS from './pokerogue-keys.json'

export const POKEROGUE_BASE = 'https://raw.githubusercontent.com/pagefaultgames/pokerogue-assets/beta/images/pokemon'

const KEY_SET = new Set<string>(KEYS.keys)
const FEMALE_SET = new Set<string>(KEYS.female)
// 본 그림이 한 프레임(정지)뿐이고 exp/(실험용 애니메이션)에 움직이는 그림이 있는 키 — 주로 6세대 이후
const EXP_FRONT = new Set<string>(KEYS.expFront)
const EXP_BACK = new Set<string>(KEYS.expBack)

const REGION_OFFSET: Record<string, number> = { alola: 2000, galar: 4000, hisui: 6000, paldea: 8000 }

/** PokeAPI 슬러그 → PokéRogue 키 (규칙으로 안 맞는 것) */
const ALIAS: Record<string, string> = {
  // 배틀 중 폼체인지 (기본 모습으로 떨어지지 않게)
  'meowstic-m-mega': '678-mega',
  // Showdown 의 메테노 기본형은 코어, Minior-Meteor 가 껍질 (PokeAPI 는 반대로 껍질이 기본).
  // 엔진은 Showdown 기본형을 PokeAPI 기본 이름(minior-red-meteor)으로 부르므로 그 이름도 코어로
  'minior': '774-red',
  'minior-red-meteor': '774-red',
  'minior-meteor': '774-red-meteor',
  'ogerpon-teal-tera': '1017-teal-mask-tera',
  'ogerpon-wellspring-tera': '1017-wellspring-mask-tera',
  'ogerpon-hearthflame-tera': '1017-hearthflame-mask-tera',
  'ogerpon-cornerstone-tera': '1017-cornerstone-mask-tera',
  'greninja-battle-bond': '2658',
  'greninja-ash': '2658-ash',
  'floette-eternal': '2670',
  'floette-mega': '2670-mega',
  'basculin-white-striped': '6550',
  'ursaluna-bloodmoon': '8901',
  'necrozma-dusk': '800-dusk-mane',
  'necrozma-dawn': '800-dawn-wings',
  'oricorio-pom-pom': '741-pompom',
  'toxtricity-low-key': '849-lowkey',
  'toxtricity-amped-gmax': '849-gigantamax',
  'toxtricity-low-key-gmax': '849-gigantamax',
  'urshifu-single-strike-gmax': '892-gigantamax-single',
  'urshifu-rapid-strike-gmax': '892-gigantamax-rapid',
  'eiscue-noice': '875-no-ice',
  'maushold-family-of-three': '925-three',
  'maushold-family-of-four': '925-four',
  'magearna-original-mega': '801-mega-original',
  'tatsugiri-curly-mega': '978-mega-curly',
  'tatsugiri-droopy-mega': '978-mega-droopy',
  'tatsugiri-stretchy-mega': '978-mega-stretchy',
  'meowstic-male-mega': '678-mega',
  'meowstic-female-mega': '678-mega',
  'zygarde-10-power-construct': '718-10',
  'zygarde-50-power-construct': '718',
  'pikachu-rock-star': '25-cool-cosplay',
  'pikachu-belle': '25-beauty-cosplay',
  'pikachu-pop-star': '25-cute-cosplay',
  'pikachu-phd': '25-smart-cosplay',
  'pikachu-libre': '25-tough-cosplay',
  'pikachu-cosplay': '25-cosplay',
  'pikachu-starter': '25-partner',
  'eevee-starter': '133-partner',
  // 기본 번호 파일이 없는 종의 대표 폼
  arceus: '493-normal',
  silvally: '773',
  ogerpon: '1017-teal-mask',
  vivillon: '666-meadow',
  deerling: '585-spring',
  sawsbuck: '586-spring',
  flabebe: '669-red',
  floette: '670-red',
  florges: '671-red',
  xerneas: '716-active',
  keldeo: '647-ordinary',
  meloetta: '648-aria',
  shellos: '422-west',
  gastrodon: '423-west',
}

/** 폼 표기 중 PokéRogue 에서 기본형과 같은 그림인 것 */
const DROP = new Set(['totem', 'breed', 'male', 'standard', 'cap'])

const keyCache = new Map<string, string | null>()

/** 아틀라스가 있는 키 목록에 들어 있는지 */
export const hasPokeRogueKey = (key: string) => KEY_SET.has(key)

/** 이 키의 암컷 그림이 따로 있는지 */
export const hasPokeRogueFemale = (key: string) => FEMALE_SET.has(key)

/** 키 후보 (앞에서부터 시도) — 테스트에서도 쓴다 */
export function pokeRogueKeyCandidates(input: string): string[] {
  // 엔진의 대표 슬러그 (minior → minior-red-meteor), PokeAPI 에 없는 외형 폼은 앞부분으로 (vivillon-fancy → vivillon)
  const slug = getPokeApiSpecies(input) ? input : getSpecies(input)?.name ?? input
  let api = getPokeApiSpecies(slug)
  const parts0 = slug.split('-')
  for (let i = parts0.length - 1; i >= 1 && !api; i--) api = getPokeApiSpecies(parts0.slice(0, i).join('-'))
  const num = api?.num ?? getSpecies(input)?.id ?? 0
  if (!num) return []
  const out: string[] = []
  if (ALIAS[input]) out.push(ALIAS[input])
  if (ALIAS[slug]) out.push(ALIAS[slug])
  const base = api?.species
  const suffix = base && slug.startsWith(`${base}-`) ? slug.slice(base.length + 1) : ''
  if (suffix) {
    let parts = suffix.split('-').map(p => (p === 'gmax' ? 'gigantamax' : p))
    const region = parts.find(p => REGION_OFFSET[p])
    let n = num
    if (region) {
      n = num + REGION_OFFSET[region]
      parts = parts.filter(p => p !== region)
    }
    const rest = parts.filter(p => !DROP.has(p))
    const s = rest.join('-')
    if (s) {
      out.push(`${n}-${s}`)
      // 앞부분만 (paldea-combat → 8128, zygarde-10-power… → 718-10)
      for (let i = rest.length - 1; i >= 1; i--) out.push(`${n}-${rest.slice(0, i).join('-')}`)
      // 마지막 단어만 (pumpkaboo-super → 710-super 가 없으면 아래 기본형)
      if (rest.length > 1) out.push(`${n}-${rest.at(-1)}`)
    }
    out.push(`${n}`)
    if (region) out.push(`${num}`)
    if (base && ALIAS[base]) out.push(ALIAS[base])
  } else {
    out.push(`${num}`)
  }
  return [...new Set(out)]
}

/** 엔진 종 슬러그 → PokéRogue 아틀라스 키 (없으면 null). 마지막 수단은 같은 번호의 첫 폼 (unown → 201-a). */
export function pokeRogueKey(slug: string): string | null {
  if (keyCache.has(slug)) return keyCache.get(slug)!
  const cands = pokeRogueKeyCandidates(slug)
  let key = cands.find(k => KEY_SET.has(k)) ?? null
  if (!key && cands.length) {
    const num = parseInt(cands.at(-1)!, 10)
    key = KEYS.keys.find(k => k.startsWith(`${num}-`)) ?? null
  }
  keyCache.set(slug, key)
  return key
}

export interface AtlasUrls {
  json: string
  png: string
  key: string
}

/**
 * 앞·뒷모습 아틀라스 URL. 암컷이고 암컷 그림이 있으면 female/,
 * 본 그림이 정지 한 장이면 exp/ 의 애니메이션 (PokéRogue 설정의 실험용 스프라이트와 같은 파일).
 */
export function pokeRogueAtlas(slug: string, back: boolean, gender?: 'M' | 'F' | null, shiny = false): AtlasUrls | null {
  const key = pokeRogueKey(slug)
  if (!key) return null
  const female = gender === 'F' && FEMALE_SET.has(key)
  // 이로치는 shiny/ (exp/ 에는 이로치가 없다)
  const exp = !female && !shiny && (back ? EXP_BACK : EXP_FRONT).has(key)
  const dir = `${exp ? 'exp/' : ''}${back ? 'back/' : ''}${shiny ? 'shiny/' : ''}${female ? 'female/' : ''}`
  return { key, json: `${POKEROGUE_BASE}/${dir}${key}.json`, png: `${POKEROGUE_BASE}/${dir}${key}.png` }
}
