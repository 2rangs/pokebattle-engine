// ─── 세대별 규칙 요약: 그 세대에서 무엇이 다른가 (설정 화면 "이 세대 규칙") ─────
// 값은 Pokémon Showdown 시뮬레이터(@pkmn/sim) 데이터·코드에서 확인했다 (genRules.test.ts 가 엔진 데이터로 다시 확인한다):
//  - 타입 수·강철 내성: data/mods/genN/typechart (getTypeChart({ gen }))
//  - 물리/특수: 3세대까지 mods 의 기술 분류가 타입으로 정해진다 (getMove('crunch', { gen: 3 }) = 특수)
//  - 특수 하나: 1세대 종족값 spa = spd (data/mods/gen1/pokedex)
//  - 특성·성격: sim/team-validator.ts (1·2세대는 'No Ability', 성격 없음), 도구: 1세대 없음 (Obtainable Misc)
//  - 급소: sim/battle-actions.ts getDamage (5세대까지 ×2, 6세대부터 ×1.5; 확률 표 [0,16,…] / 7세대부터 [0,24,…]),
//          mods/gen1/scripts.ts (스피드 기반), mods/gen2/scripts.ts (17/256)
//  - 날씨: 2세대 비·쾌청·모래바람(기술), 3세대 싸라기눈, 6세대 필드, 9세대 설경(눈) / 특성 날씨는 5세대까지 끝없이 (data/conditions.ts gen <= 5)
//  - 마비 스피드: 6세대까지 1/4 (mods/gen6/conditions), 7세대부터 1/2
//  - 팀 프리뷰: Showdown genNcustomgame 기본값 (5세대부터 있음). 이 데모는 기본으로 끄고 프리셋에서 켠다
import type { Lang } from './messages'

export const ALL_GENS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const
export type AnyGen = typeof ALL_GENS[number]

type T = Record<Lang, string>
export interface GenFact {
  id: 'gimmick' | 'types' | 'split' | 'abilities' | 'items' | 'stats' | 'crit' | 'weather' | 'terrain' | 'paralysis' | 'preview'
  label: T
  value: T
  /** 값만 봐서는 알기 어려운 것의 한 줄 설명 */
  hint?: T
}

export interface GenInfo {
  gen: AnyGen
  games: T
  /** 한 줄 요약 (세대 선택 아래) */
  summary: T
  /** 기믹 (없으면 빈 배열) */
  gimmicks: ('mega' | 'zmove' | 'ultra' | 'dynamax' | 'tera')[]
  typeCount: 15 | 17 | 18
  /** 물리/특수가 기술마다 (4세대부터) */
  splitPerMove: boolean
  /** 특수가 하나 (1세대) */
  singleSpecial: boolean
  abilities: 'none' | 'normal' | 'hidden'
  items: boolean
  /** 1·2세대 DV·능력치 경험치 / 3세대부터 개체값·노력치·성격 */
  statModel: 'dv' | 'iv'
  crit: { chance: T; mult: string }
  weather: T
  terrain: boolean
  /** 마비의 스피드 배율 */
  paralysis: '1/4' | '1/2'
  /** Showdown 커스텀 게임의 팀 프리뷰 기본값 */
  previewDefault: boolean
}

const L = (ko: string, en: string): T => ({ ko, en })

const GAMES: Record<AnyGen, T> = {
  1: L('레드·그린·피카츄', 'Red / Blue / Yellow'),
  2: L('금·은·크리스탈', 'Gold / Silver / Crystal'),
  3: L('루비·사파이어·에메랄드', 'Ruby / Sapphire / Emerald'),
  4: L('다이아몬드·펄·Pt', 'Diamond / Pearl / Platinum'),
  5: L('블랙·화이트', 'Black / White'),
  6: L('X·Y', 'X / Y'),
  7: L('썬·문', 'Sun / Moon'),
  8: L('소드·실드', 'Sword / Shield'),
  9: L('스칼렛·바이올렛', 'Scarlet / Violet'),
}

const SUMMARY: Record<AnyGen, T> = {
  1: L('특수 능력치가 하나, 특성·도구 없음, 급소는 스피드로 정해집니다.', 'One Special stat, no abilities or items, crits depend on Speed.'),
  2: L('악·강철 타입, 지닌 도구, 특공/특방이 나뉩니다. 특성은 아직 없습니다.', 'Dark and Steel types, held items, Special splits into Sp. Atk / Sp. Def. No abilities yet.'),
  3: L('특성·성격·노력치가 생깁니다. 물리/특수는 아직 타입으로 정해집니다.', 'Abilities, natures and EVs arrive. Physical/special is still decided by type.'),
  4: L('물리/특수가 기술마다 정해집니다 (지금과 같은 방식).', 'Physical/special is decided per move, as it is today.'),
  5: L('숨겨진 특성. 특성으로 부른 날씨는 끝나지 않습니다.', 'Hidden Abilities. Weather from abilities never ends.'),
  6: L('메가진화, 페어리 타입, 필드. 급소 1.5배.', 'Mega Evolution, Fairy type, terrains. Crits ×1.5.'),
  7: L('메가진화와 Z기술 (울트라버스트). 급소 확률 1/24.', 'Mega Evolution and Z-Moves (Ultra Burst). Crit chance 1/24.'),
  8: L('다이맥스 (거다이맥스). 메가진화·Z기술은 없습니다.', 'Dynamax (Gigantamax). No Mega Evolution or Z-Moves.'),
  9: L('테라스탈. 싸라기눈 대신 설경(눈).', 'Terastallization. Snow replaces hail.'),
}

export function genInfo(gen: AnyGen): GenInfo {
  return {
    gen,
    games: GAMES[gen],
    summary: SUMMARY[gen],
    gimmicks: gen === 6 ? ['mega'] : gen === 7 ? ['mega', 'zmove', 'ultra'] : gen === 8 ? ['dynamax'] : gen === 9 ? ['tera'] : [],
    typeCount: gen === 1 ? 15 : gen <= 5 ? 17 : 18,
    splitPerMove: gen >= 4,
    singleSpecial: gen === 1,
    abilities: gen <= 2 ? 'none' : gen <= 4 ? 'normal' : 'hidden',
    items: gen >= 2,
    statModel: gen <= 2 ? 'dv' : 'iv',
    crit: gen === 1 ? { chance: L('스피드 기반', 'by Speed'), mult: '×2' }
      : gen === 2 ? { chance: L('17/256', '17/256'), mult: '×2' }
        : gen <= 5 ? { chance: L('1/16', '1/16'), mult: '×2' }
          : gen === 6 ? { chance: L('1/16', '1/16'), mult: '×1.5' }
            : { chance: L('1/24', '1/24'), mult: '×1.5' },
    weather: gen === 1 ? L('없음', 'None')
      : gen === 2 ? L('비·쾌청·모래바람 (기술로만)', 'Rain, sun, sand (moves only)')
        : gen <= 5 ? L('비·쾌청·모래바람·싸라기눈, 특성 날씨는 끝없이', 'Rain, sun, sand, hail; ability weather lasts forever')
          : gen <= 8 ? L('비·쾌청·모래바람·싸라기눈 (5턴)', 'Rain, sun, sand, hail (5 turns)')
            : L('비·쾌청·모래바람·설경 (5턴)', 'Rain, sun, sand, snow (5 turns)'),
    terrain: gen >= 6,
    paralysis: gen <= 6 ? '1/4' : '1/2',
    previewDefault: gen >= 5,
  }
}

/** "이 세대 규칙" 표의 줄 (값 + 필요한 곳만 설명) */
export function genFacts(gen: AnyGen): GenFact[] {
  const g = genInfo(gen)
  const gimmick: T = g.gimmicks.length === 0 ? L('없음', 'None')
    : gen === 6 ? L('메가진화', 'Mega Evolution')
      : gen === 7 ? L('메가진화 · Z기술 · 울트라버스트', 'Mega Evolution · Z-Moves · Ultra Burst')
        : gen === 8 ? L('다이맥스 · 거다이맥스', 'Dynamax · Gigantamax')
          : L('테라스탈', 'Terastallization')
  const facts: GenFact[] = [
    { id: 'gimmick', label: L('배틀 기믹', 'Gimmick'), value: gimmick, ...(g.gimmicks.length ? { hint: L('각 기믹은 한 배틀에 한 번', 'Each once per battle') } : {}) },
    {
      id: 'types', label: L('타입', 'Types'), value: L(`${g.typeCount}개`, `${g.typeCount}`),
      hint: gen === 1 ? L('악·강철·페어리 없음', 'No Dark, Steel or Fairy') : gen <= 5 ? L('페어리 없음, 강철이 고스트·악을 반감', 'No Fairy; Steel resists Ghost and Dark') : undefined,
    },
    {
      id: 'split', label: L('물리 / 특수', 'Physical / special'),
      value: g.splitPerMove ? L('기술마다', 'Per move') : L('타입으로', 'By type'),
      ...(g.splitPerMove ? {} : { hint: L('예: 불꽃·물·악 기술은 모두 특수, 노말·격투·고스트는 모두 물리', 'e.g. all Fire, Water, Dark moves are special; all Normal, Fighting, Ghost moves physical') }),
    },
    {
      id: 'stats', label: L('능력치', 'Stats'),
      value: g.statModel === 'dv' ? L('DV · 능력치 경험치', 'DVs · stat exp') : L('개체값 · 노력치 · 성격', 'IVs · EVs · natures'),
      hint: g.statModel === 'dv'
        ? (g.singleSpecial ? L('특수 하나 (특공 = 특방). 데모는 모두 최대로 둡니다', 'One Special (Sp. Atk = Sp. Def). The demo maxes them') : L('성격 없음. 데모는 모두 최대로 둡니다', 'No natures. The demo maxes them'))
        : undefined,
    },
    {
      id: 'abilities', label: L('특성', 'Abilities'),
      value: g.abilities === 'none' ? L('없음', 'None') : g.abilities === 'normal' ? L('있음', 'Yes') : L('있음 + 숨겨진 특성', 'Yes + Hidden Abilities'),
    },
    { id: 'items', label: L('지닌 도구', 'Held items'), value: g.items ? L('있음', 'Yes') : L('없음', 'None') },
    { id: 'crit', label: L('급소', 'Critical hits'), value: L(`${g.crit.chance.ko} · ${g.crit.mult}`, `${g.crit.chance.en} · ${g.crit.mult}`), ...(gen === 1 ? { hint: L('빠른 포켓몬일수록 급소가 잘 나옵니다', 'Faster Pokémon crit more often') } : {}) },
    { id: 'weather', label: L('날씨', 'Weather'), value: g.weather },
  ]
  if (g.terrain) facts.push({ id: 'terrain', label: L('필드', 'Terrain'), value: gen === 6 ? L('일렉트릭·그래스·미스트', 'Electric, Grassy, Misty') : L('일렉트릭·그래스·미스트·사이코', 'Electric, Grassy, Misty, Psychic') })
  facts.push(
    { id: 'paralysis', label: L('마비', 'Paralysis'), value: L(`스피드 ${g.paralysis}`, `Speed ${g.paralysis}`) },
    {
      id: 'preview', label: L('팀 프리뷰', 'Team preview'),
      value: g.previewDefault ? L('게임 기본 있음', 'On in the games') : L('게임에는 없음', 'Not in the games'),
      hint: L('배틀 옵션에서 켜고 끌 수 있습니다', 'Turn it on or off in Battle options'),
    },
  )
  return facts
}
