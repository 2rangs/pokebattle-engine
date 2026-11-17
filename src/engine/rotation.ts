// ─── 로테이션 배틀 (Showdown 런타임 패치) ─────────────────────
// Showdown 에는 gameType 'rotation' 이 이름만 남아 있다 (Side 가 슬롯 3개를 잡고 최소 팀 3마리).
// 회전 선택·"앞 포켓몬만 행동/피격" 규칙은 서버 시뮬레이터에 한 번도 구현된 적이 없고,
// 지금은 activePerHalf 가 1 로 계산돼 그대로 쓰면 깨진다.
//
// 그래서 rotation 은 Showdown triples 배틀 위에서 아래 규칙을 덧씌워 돌린다.
//  - 앞(front) = 가운데 슬롯 1 (b). 왼쪽 = 슬롯 0 (a), 오른쪽 = 슬롯 2 (c)
//  - 앞 포켓몬만 행동한다. 뒷줄은 매 턴 pass
//  - 기술 대상·인접 판정은 양쪽 앞 포켓몬끼리만 (아군 대상 기술은 실패, 범위기는 상대 앞 1마리만)
//  - 회전 = 뒷줄 포켓몬에게 기술을 고르게 하면, 턴 시작 시(교체보다도 먼저) 그 포켓몬을 앞으로
//    swapPosition 한 뒤 기술을 쓴다. 교체가 아니므로 랭크·휘발성 상태·등장 특성은 그대로
//  - 앞 포켓몬이 기술에 묶여 있으면(역린·반동·모으기 등) 회전 불가
//  - 날씨·상태이상 잔여 데미지, 필드 전체 효과(흑안개·멸망의노래 등)는 뒷줄에도 적용된다
//    (Showdown 의 필드 위 포켓몬 처리 그대로)
//
// 패치는 프로토타입에 한 번 설치하고, battle.rotation 이 true 인 배틀에서만 동작한다.
import { Battle, Pokemon, Side } from '@pkmn/sim'

/** 앞 슬롯 (가운데) */
export const FRONT = 1
/** 상대 앞 포켓몬을 가리키는 Showdown targetLoc */
export const FOE_FRONT_LOC = FRONT + 1
/** 회전 행동의 큐 순서. 교체(103)보다 먼저, 팀/시작 처리(1~6)보다는 나중 */
export const ROTATE_ORDER = 102

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyFn = (...args: any[]) => any
const isRotation = (battle: unknown) => (battle as { rotation?: boolean } | undefined)?.rotation === true

let installed = false

export function installRotationPatches(): void {
    if (installed) return
    installed = true
    const P = Pokemon.prototype as any
    const S = Side.prototype as any
    const B = Battle.prototype as any

    const wrap = (proto: any, name: string, impl: (orig: AnyFn) => AnyFn, getBattle: (self: any) => unknown) => {
        const orig = proto[name] as AnyFn
        const patched = impl(orig)
        proto[name] = function (this: any, ...args: any[]) {
            return isRotation(getBattle(this)) ? patched.apply(this, args) : orig.apply(this, args)
        }
    }
    const pb = (self: any) => self.battle

    // ─── 대상·인접: 양쪽 앞 포켓몬끼리만 ──────────────────────
    const foeFront = (self: any, all?: boolean) => {
        const f = self.side.foe.active[FRONT]
        return f && (all || f.hp) ? [f] : []
    }
    wrap(P, 'allies', () => () => [], pb)
    wrap(P, 'adjacentAllies', () => () => [], pb)
    wrap(P, 'alliesAndSelf', () => function (this: any) { return [this] }, pb)
    wrap(P, 'foes', () => function (this: any, all?: boolean) { return foeFront(this, all) }, pb)
    wrap(P, 'adjacentFoes', () => function (this: any) { return foeFront(this) }, pb)
    wrap(P, 'isAdjacent', () => function (this: any, other: any) {
        return !this.fainted && !other.fainted && this.side !== other.side && this.position === FRONT && other.position === FRONT
    }, pb)
    wrap(S, 'randomFoe', () => function (this: any) {
        const f = this.foe.active[FRONT]
        return f && f.hp ? f : null
    }, pb)
    // 선택 시점 검사: 상대는 앞 자리(loc 2)만, 아군 쪽은 자기 자신만 (도우미 등은 실행 때 실패)
    wrap(B, 'validTargetLoc', () => function (this: any, targetLoc: number, source: any, targetType: string) {
        if (targetLoc === 0) return true
        const isSelf = source.getLocOf(source) === targetLoc
        switch (targetType) {
            case 'randomNormal': case 'scripted': case 'normal': case 'adjacentFoe': case 'any':
                return targetLoc === FOE_FRONT_LOC
            case 'adjacentAlly':
            case 'adjacentAllyOrSelf':
                return isSelf
        }
        return false
    }, self => self)

    // ─── 선택: 뒷줄은 pass, 행동하는 포켓몬은 정확히 1마리 ─────
    wrap(S, 'choosePass', orig => function (this: any) {
        if (this.requestState !== 'move') return orig.call(this)
        const index = this.getChoiceIndex(true)
        if (index >= this.active.length) return false
        this.choice.actions.push({ choice: 'pass' })
        return true
    }, pb)
    wrap(S, 'chooseShift', () => function (this: any) {
        return this.emitChoiceError("Can't shift: in rotation battles choose a move for a back Pokémon to rotate it in")
    }, pb)
    wrap(S, 'choose', orig => function (this: any, input: string) {
        if (this.requestState !== 'move') return orig.call(this, input)
        const text = String(input ?? '').trim()
        if (text === '' || text === 'default') return autoChooseRotation(this)
        if (!orig.call(this, input)) return false
        const error = validateRotationChoice(this)
        if (error) {
            this.clearChoice()
            return this.emitChoiceError(`Can't move: ${error}`)
        }
        return true
    }, pb)
    wrap(S, 'autoChoose', orig => function (this: any) {
        if (this.requestState !== 'move') return orig.call(this)
        if (!this.isChoiceDone()) autoChooseRotation(this)
        return true
    }, pb)
    // 뒷줄 포켓몬이 고른 기술 → 그 포켓몬을 앞으로 돌리는 행동을 큐에 추가
    wrap(S, 'commitChoices', orig => function (this: any) {
        if (this.requestState === 'move') {
            const movers = this.choice.actions.filter((a: any) => a.choice === 'move' && a.pokemon && a.pokemon.position !== FRONT)
            for (const a of movers) this.choice.actions.push({ choice: 'shift', pokemon: a.pokemon, order: ROTATE_ORDER })
        }
        return orig.call(this)
    }, pb)
}

/** 앞 포켓몬이 기술에 묶여 있어 돌릴 수 없는지 */
export function frontLocked(side: any): boolean {
    const front = side.active[FRONT]
    return !!front && !front.fainted && !!(front.getLockedMove() || front.volatiles['mustrecharge'])
}

/** 선택이 로테이션 규칙에 맞는지 (맞으면 null) */
function validateRotationChoice(side: any): string | null {
    const actors = side.choice.actions.filter((a: any) => a.choice !== 'pass')
    const living = side.active.filter((p: any) => p && !p.fainted)
    if (!living.length) return null
    if (actors.length !== 1) return `exactly one Pokémon acts in a rotation battle (got ${actors.length})`
    const a = actors[0]
    if (a.choice === 'switch' && a.pokemon.position !== FRONT) return 'only the front Pokémon can switch out'
    if (a.choice === 'move' && a.pokemon.position !== FRONT && frontLocked(side)) return `${side.active[FRONT].name} is locked into its move and can't rotate`
    if (a.choice === 'move' && a.pokemon.position === FRONT && side.active[FRONT].fainted) return 'the front slot is empty; rotate a back Pokémon in'
    return null
}

/** 기본 선택: 앞 포켓몬이 아무 기술, 앞이 비었으면 살아 있는 첫 뒷줄 포켓몬이 돌아 들어와 기술 */
function autoChooseRotation(side: any): boolean {
    side.clearChoice()
    const front = side.active[FRONT]
    const actor = front && !front.fainted ? FRONT : side.active.findIndex((p: any) => p && !p.fainted)
    while (side.choice.actions.length < side.active.length) {
        const i = side.choice.actions.length
        if (i === actor) {
            if (!side.chooseMove()) return false
        } else {
            side.choice.actions.push({ choice: 'pass' })
        }
    }
    return true
}
