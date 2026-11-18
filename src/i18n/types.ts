// ─── 다국어 로그: 공통 타입 ───────────────────────────────────
import type { PlayerID } from '../types/battle'
import type { BattlePokemon } from '../types/pokemon'

/** 용어 묶음 (데이터에 이름이 없는 것만 로케일이 번역한다) */
export type TermGroup = 'status' | 'stat' | 'weather' | 'direction' | 'volatile' | 'effect'

/**
 * 메시지 인자. 문자열로 바꾸는 것은 렌더 단계(언어별)에서 한다.
 *  - pokemon: 포켓몬 ID → "상대 한카리아스" / "the opposing Garchomp"  (name: 접두어 없이 "한카리아스")
 *  - side:    진영 → "상대 편" / "the opposing team" (ctx.sideName 이 있으면 그 이름)
 *  - move/ability/item/type/species: 슬러그 → 언어별 이름 (이름 데이터)
 *  - term:    데이터에 없는 용어 (상태이상·능력치·날씨 등) → 로케일 terms
 *  - effect:  출처 슬러그 (기술·도구·특성·조건 무엇이든) → 알맞은 이름
 */
export type Arg =
    | { pokemon: string }
    /** 포켓몬 ID → "상대" 같은 접두어 없는 이름 */
    | { name: string }
    | { side: PlayerID }
    | { move: string }
    | { ability: string }
    | { item: string }
    | { type: string }
    | { species: string }
    | { term: TermGroup; key: string }
    | { effect: string }
    | { text: string }
    | number

/** 언어와 무관한 로그 메시지. key 후보를 앞에서부터 찾고, 각 후보는 `${key}.${variant}` → key 순서로 찾는다 */
export interface Message {
    key: string | string[]
    variant?: string
    params: Record<string, Arg>
}

/** 문장 틀. `{name}` 자리에 인자가 들어간다. 객체면 count 인자로 복수형을 고른다 (Intl.PluralRules) */
export type Template = string | ({ other: string } & Partial<Record<Intl.LDMLPluralRule, string>>)

export interface Locale {
    /** BCP 47 코드 (복수형 규칙에도 쓰인다) */
    code: string
    /** 엔티티 이름에 쓸 이름 팩 (기본: code) */
    names?: string
    /** 문장·용어가 없을 때 대신 쓸 로케일 */
    fallback?: Locale
    messages: Record<string, Template>
    terms: Partial<Record<TermGroup, Record<string, string>>>
    /** 한 이벤트가 여러 문장일 때 이어 붙이는 문자열 (기본 ' ') */
    joiner?: string
    /** 완성된 문장 후처리 (한국어 조사, 영어 대문자 등) */
    postProcess?: (text: string) => string
}

export interface FormatContext {
    getPokemon: (id: string) => BattlePokemon | undefined
    /** 진영 표시 이름 (예: 트레이너 이름). 없으면 "우리 편/상대 편" */
    sideName?: (player: PlayerID) => string
    /** 누구 시점인지 (기본 p1). 이 진영이 "우리", 반대쪽이 "상대" */
    perspective?: PlayerID
}

/** 엔티티 이름 직접 지정 (앱이 자체 이름표를 쓸 때). 반환값이 우선한다 */
export interface NameResolver {
    pokemon?: (species: string) => string
    move?: (name: string) => string
    ability?: (name: string) => string
    item?: (name: string) => string
    type?: (name: string) => string
}
