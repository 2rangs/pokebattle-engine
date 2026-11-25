// ─── 입력 로그 재생 ───────────────────────────────────────────
// Showdown 의 battle.inputLog (>start, >player, >p1 move 1 …) 를 그대로 다시 넣어 같은 배틀을 만든다.
// 같은 입력 + 같은 시드 → 같은 프로토콜 로그 (Showdown 의 결정성). 벤치마크·동일성 검사에 쓴다.
import { Battle } from '@pkmn/sim'
import { enableFastPath } from './fastpath'
import { installRotationPatches } from './rotation'
import { ensureCustomStatsRuleFor } from './customstats'
import { ensureGimmickRulesFor } from './gimmickrules'
import type { ShowdownBattle } from '../types/showdown'

export interface ReplayOptions {
    /** 빠른 경로 사용 (기본 false = Showdown 원본 그대로) */
    fast?: boolean
    /** 엔진의 로테이션 배틀이었는지 (inputLog 에는 표시되지 않음) */
    rotation?: boolean
}

/** inputLog 를 재생한 Battle 을 반환한다 */
export function replayInputLog(inputLog: readonly string[], options: ReplayOptions = {}): ShowdownBattle {
    return replayBattle(inputLog, options) as unknown as ShowdownBattle
}

/** @internal replayInputLog 의 원본 Battle */
export function replayBattle(inputLog: readonly string[], options: ReplayOptions = {}): Battle {
    let battle: Battle | null = null
    for (const line of inputLog) {
        const sp = line.indexOf(' ')
        const cmd = sp < 0 ? line.slice(1) : line.slice(1, sp)
        const rest = sp < 0 ? '' : line.slice(sp + 1)
        if (cmd === 'version' || cmd === 'version-origin') continue
        if (cmd === 'start') {
            if (options.rotation) installRotationPatches()
            const spec = JSON.parse(rest) as { formatid?: string }
            if (spec.formatid) { ensureCustomStatsRuleFor(spec.formatid); ensureGimmickRulesFor(spec.formatid) }
            battle = new Battle(spec as never)
            if (options.rotation) (battle as unknown as { rotation: boolean }).rotation = true
            if (options.fast) enableFastPath(battle)
            continue
        }
        if (!battle) throw new Error(`replay: '${line}' before >start`)
        if (cmd === 'player') {
            const sp2 = rest.indexOf(' ')
            battle.setPlayer(rest.slice(0, sp2) as never, JSON.parse(rest.slice(sp2 + 1)))
        } else if (cmd === 'p1' || cmd === 'p2' || cmd === 'p3' || cmd === 'p4') {
            if (!battle.choose(cmd, rest)) throw new Error(`replay: rejected '${line}': ${(battle as any)[cmd].choice.error}`)
        } else if (cmd === 'forcetie') {
            battle.tie()
        } else if (cmd === 'forcewin') {
            battle.win(rest as never)
        } else if (cmd === 'forcelose') {
            battle.lose(rest as never)
        } else if (cmd === 'tiebreak') {
            battle.tiebreak()
        } else {
            throw new Error(`replay: unsupported input '${line}'`)
        }
    }
    if (!battle) throw new Error('replay: empty input log')
    return battle
}

/** 비교용 프로토콜 로그 (실제 시각 |t:| 제외) */
export function comparableLog(battle: { readonly log: readonly string[] }): string {
    return battle.log.filter(l => !l.startsWith('|t:|')).join('\n')
}
