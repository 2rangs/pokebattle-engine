// ─── 세대 기믹 끄기 규칙 (메가진화·Z기술) ─────────────────────────
// Showdown 에는 다이맥스('Dynamax Clause')·테라스탈('Terastal Clause') 금지 규칙은 있지만
// 메가진화 전체·Z기술을 끄는 규칙은 없다 ('Mega Rayquaza Clause' 는 레쿠쟈만). 그래서 같은 방식(onBegin)의 규칙 둘을 런타임에 등록한다:
//  - 'Mega Evolution Clause': 모든 포켓몬의 canMegaEvo / canMegaEvoX / canMegaEvoY / canUltraBurst 를 지운다 (울트라버스트 포함, 원시회귀는 도구 효과라 그대로)
//  - 'Z-Move Clause': 양쪽 진영을 'Z기술을 이미 쓴' 상태로 둔다 (Showdown 'Dynamax Clause' 가 dynamaxUsed 를 쓰는 것과 같은 방식)
// 'rule' 줄은 엔진 이벤트로 바뀌지 않는다.
import { Dex, Pokemon, Side, toID } from '@pkmn/sim'
import type { Battle } from '@pkmn/sim'

export const MEGA_CLAUSE = 'Mega Evolution Clause'
export const ZMOVE_CLAUSE = 'Z-Move Clause'
export const STACK_GIMMICKS_MOD = 'Stack Gimmicks Mod'
const STACK_ID = 'stackgimmicksmod'

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
    [STACK_ID]: {
        effectType: 'Rule',
        name: STACK_GIMMICKS_MOD,
        desc: 'One Pokémon may Mega Evolve / Ultra Burst, use a Z-Move, Dynamax and Terastallize; each still once per side (@kyasi/pokebattle-engine)',
        onBegin(this: Battle) {
            installStackPatches()
            this.add('rule', `${STACK_GIMMICKS_MOD}: Gimmicks can be combined`)
            for (const side of this.sides) side.dynamaxUsed = false
            for (const p of this.getAllPokemon()) {
                // 테라스탈: 메가스톤·Z크리스탈을 지녀도 (9세대 메커닉에서만)
                p.canTerastallize = this.gen === 9 ? p.teraType : null
                // 메가레쿠쟈: 화룡점정을 알면 (9세대 Showdown 은 과거 태그가 있어야 허락한다)
                const alt = p.baseSpecies.otherFormes && this.dex.species.get(p.baseSpecies.otherFormes[0]!)
                if (!p.canMegaEvo && alt?.isMega && alt.requiredMove && p.baseMoves.includes(toID(alt.requiredMove)) && !p.getItem().zMove) {
                    p.canMegaEvo = alt.name
                }
            }
        },
    },
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyFn = (...args: any[]) => any
const stacking = (battle: any) => !!battle?.ruleTable?.has(STACK_ID)

/** 한 기술 선택에 붙일 수 있는 기믹 (Showdown 선택 문자열의 꼬리말) */
const EVENT_OF: Record<string, string> = {
    mega: 'mega', ultra: 'ultra', zmove: 'zmove', dynamax: 'dynamax', gigantamax: 'dynamax', max: 'dynamax',
    terastallize: 'terastallize', terastal: 'terastallize',
}
/** 원래 선택 처리기로 넘길 대표 기믹 (기술 자체를 바꾸는 것 먼저), 나머지는 행동에 표시만 더한다 */
const PRIMARY = ['dynamax', 'zmove', 'ultra', 'mega', 'terastallize']

let installed = false
/**
 * 기믹 겹치기 패치 (Stack Gimmicks Mod 가 있는 배틀에서만 동작, 프로토타입에 한 번 설치):
 *  - Side.choose: 'move 1 mega terastallize dynamax' 처럼 꼬리말 여럿 → 대표 하나만 원래 처리기로, 나머지는 chooseMove 뒤에 붙인다
 *  - Side.chooseMove: 나머지 기믹(메가·울트라·테라)을 검사해 행동에 더한다 (같은 진영 한 배틀 한 번은 그대로)
 *  - Pokemon.getDynamaxRequest: 메가·원시·울트라 모습이거나 메가스톤·Z크리스탈을 지녀도 다이맥스 가능 (다이맥스할 수 없는 종은 그대로)
 *  - Pokemon.formeChange: 도구로 모습이 바뀌어도(메가·원시·울트라) 테라스탈 가능 상태를 지우지 않고, 거다이맥스는 못 한다(그 모습으로 다이맥스)
 * 실행 순서는 Showdown 큐 그대로: 메가진화(104) → 다이맥스(105) → 테라스탈(106) → 기술.
 */
export function installStackPatches(): void {
    if (installed) return
    installed = true
    const S = Side.prototype as any
    const P = Pokemon.prototype as any

    const choose = S.choose as AnyFn
    S.choose = function (this: any, input: string) {
        if (!stacking(this.battle) || typeof input !== 'string' || input.startsWith('team ')) return choose.call(this, input)
        const extras: string[][] = []
        const parts = input.split(',').map(raw => {
            const [type, ...rest] = raw.trim().split(/\s+/)
            if (type !== 'move') return raw
            const words = [...rest]
            const events: string[] = []
            const tail: string[] = []
            while (words.length > 1) {
                const w = words[words.length - 1]!
                if (EVENT_OF[w]) { events.unshift(EVENT_OF[w]!); words.pop() }
                else if (/^[-+]?[1-3]$/.test(w) && !tail.length) { tail.push(w); words.pop() }
                else break
            }
            const uniq = [...new Set(events)]
            if (uniq.length <= 1) { extras.push([]); return raw }
            const primary = PRIMARY.find(e => uniq.includes(e))!
            extras.push(uniq.filter(e => e !== primary))
            return ['move', ...words, ...tail, primary].join(' ')
        })
        this.__stackExtras = extras
        try {
            return choose.call(this, parts.join(','))
        } finally {
            this.__stackExtras = undefined
        }
    }

    const chooseMove = S.chooseMove as AnyFn
    S.chooseMove = function (this: any, ...args: any[]) {
        const extras: string[] | undefined = stacking(this.battle) ? this.__stackExtras?.shift() : undefined
        const ok = chooseMove.apply(this, args)
        if (!ok || !extras?.length) return ok
        const action = this.choice.actions[this.choice.actions.length - 1]
        const pokemon = action?.pokemon
        if (!action || action.choice !== 'move' || !pokemon) return ok
        for (const e of extras) {
            if (e === 'mega') {
                if (!pokemon.canMegaEvo) return this.emitChoiceError(`Can't move: ${pokemon.name} can't mega evolve`)
                if (this.choice.mega) return this.emitChoiceError(`Can't move: You can only mega-evolve once per battle`)
                action.mega = true
                this.choice.mega = true
            } else if (e === 'ultra') {
                if (!pokemon.canUltraBurst) return this.emitChoiceError(`Can't move: ${pokemon.name} can't ultra burst`)
                if (this.choice.ultra) return this.emitChoiceError(`Can't move: You can only ultra burst once per battle`)
                action.mega = true
                this.choice.ultra = true
            } else if (e === 'terastallize') {
                if (!pokemon.canTerastallize) return this.emitChoiceError(`Can't move: ${pokemon.name} can't Terastallize.`)
                if (this.choice.terastallize) return this.emitChoiceError(`Can't move: You can only Terastallize once per battle.`)
                action.terastallize = pokemon.teraType
                this.choice.terastallize = true
            } else {
                // Z기술 + 다이맥스: 다이맥스하면 기술이 다이맥스 기술이 된다 (Z기술과 함께 쓸 수 없다)
                return this.emitChoiceError(`Can't move: ${pokemon.name} can't use a Z-Move and Dynamax in the same turn`)
            }
        }
        return ok
    }

    // 다이맥스는 8세대에서만 열린다 → 이 규칙이면 세대와 상관없이 (진영당 한 번)
    const canDynamaxNow = S.canDynamaxNow as AnyFn
    S.canDynamaxNow = function (this: any) {
        if (!stacking(this.battle) || this.battle.gameType === 'multi') return canDynamaxNow.call(this)
        return !this.dynamaxUsed
    }

    const getDynamaxRequest = P.getDynamaxRequest as AnyFn
    P.getDynamaxRequest = function (this: any, skipChecks?: boolean) {
        if (!stacking(this.battle) || skipChecks) return getDynamaxRequest.call(this, skipChecks)
        if (!this.side.canDynamaxNow()) return undefined
        if (this.species.cannotDynamax || this.illusion?.species.cannotDynamax) return undefined
        return getDynamaxRequest.call(this, true)
    }

    const formeChange = P.formeChange as AnyFn
    P.formeChange = function (this: any, ...args: any[]) {
        if (!stacking(this.battle)) return formeChange.apply(this, args)
        const tera = this.canTerastallize
        const out = formeChange.apply(this, args)
        const sp = this.species
        if (args[2] && (sp.isMega || sp.isPrimal || sp.forme === 'Ultra')) {
            if (tera && !this.terastallized && this.canTerastallize === null) this.canTerastallize = tera
            this.canGigantamax = null
            this.gigantamax = false
        }
        return out
    }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

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
