// ─── 세대 기믹 끄기 규칙 (메가진화·Z기술) ─────────────────────────
// Showdown 에는 다이맥스('Dynamax Clause')·테라스탈('Terastal Clause') 금지 규칙은 있지만
// 메가진화 전체·Z기술을 끄는 규칙은 없다 ('Mega Rayquaza Clause' 는 레쿠쟈만). 그래서 같은 방식(onBegin)의 규칙 둘을 런타임에 등록한다:
//  - 'Mega Evolution Clause': 모든 포켓몬의 canMegaEvo / canMegaEvoX / canMegaEvoY / canUltraBurst 를 지운다 (울트라버스트 포함, 원시회귀는 도구 효과라 그대로)
//  - 'Z-Move Clause': 양쪽 진영을 'Z기술을 이미 쓴' 상태로 둔다 (Showdown 'Dynamax Clause' 가 dynamaxUsed 를 쓰는 것과 같은 방식)
// 'rule' 줄은 엔진 이벤트로 바뀌지 않는다.
import { Dex } from '@pkmn/sim'
import type { Battle } from '@pkmn/sim'

export const MEGA_CLAUSE = 'Mega Evolution Clause'
export const ZMOVE_CLAUSE = 'Z-Move Clause'

const RULES: Record<string, unknown> = {
    megaevolutionclause: {
        effectType: 'Rule',
        name: MEGA_CLAUSE,
        desc: 'Prevents Pokémon from Mega Evolving or Ultra Bursting (@kyasi/pokebattle-engine)',
        onBegin(this: Battle) {
            this.add('rule', `${MEGA_CLAUSE}: You cannot Mega Evolve or Ultra Burst`)
            for (const p of this.getAllPokemon()) {
                p.canMegaEvo = null
                p.canMegaEvoX = null
                p.canMegaEvoY = null
                p.canUltraBurst = null
            }
        },
    },
    zmoveclause: {
        effectType: 'Rule',
        name: ZMOVE_CLAUSE,
        desc: 'Prevents Pokémon from using Z-Moves (@kyasi/pokebattle-engine)',
        onBegin(this: Battle) {
            this.add('rule', `${ZMOVE_CLAUSE}: You cannot use Z-Moves`)
            for (const side of this.sides) side.zMoveUsed = true
        },
    },
}

/** 규칙을 기본 Dex 와 해당 세대 Dex 에 등록 (여러 번 불러도 된다) */
export function ensureGimmickRules(gen = 9): void {
    for (const dex of [Dex, Dex.forGen(gen)]) {
        const rulesets = dex.data.Rulesets as Record<string, unknown>
        for (const [id, rule] of Object.entries(RULES)) if (!rulesets[id]) rulesets[id] = rule
    }
}

/** 포맷 ID 에 이 규칙이 있으면 등록 (replay 용) */
export function ensureGimmickRulesFor(formatid: string): void {
    const id = formatid.toLowerCase().replace(/[^a-z0-9@,]/g, '')
    if (!Object.keys(RULES).some(r => id.includes(r))) return
    const m = formatid.match(/^gen(\d)/)
    ensureGimmickRules(m ? Number(m[1]) : 9)
}
