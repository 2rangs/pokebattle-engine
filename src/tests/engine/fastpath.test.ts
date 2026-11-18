import { describe, it, expect } from 'vitest'
import { Battle } from '@pkmn/sim'
import { BattleEngine, generateRandomTeam, PRNG, replayInputLog, comparableLog } from '../../index'
import type { BattleFormat } from '../../types/battle'

// 같은 시드·같은 선택이면 빠른 경로와 Showdown 원본 경로의 프로토콜 로그가 바이트 단위로 같아야 한다
function play(format: BattleFormat, seed: number, fast: boolean) {
    const rng = new PRNG(seed * 31 + 7)
    const teamFormat = format === 'doubles' || format === 'triples' ? 'gen9randomdoublesbattle' : 'gen9randombattle'
    const engine = new BattleEngine({
        format, seed, maxTurns: 200,
        p1: { name: 'A', team: generateRandomTeam({ seed: rng.int(0x7fffffff), format: teamFormat }) },
        p2: { name: 'B', team: generateRandomTeam({ seed: rng.int(0x7fffffff), format: teamFormat }) },
    }, { fast, turnSnapshots: false })
    engine.start()
    let guard = 0
    while (!engine.battle.ended && guard++ < 3000) {
        for (const player of ['p1', 'p2'] as const) {
            if (engine.battle.ended) break
            if (format === 'doubles' || format === 'triples') {
                const req = engine.getRawRequest(player) as { wait?: boolean } | null
                if (req && !req.wait && !engine.battle[player].isChoiceDone()) engine.submitChoice(player, 'default')
            } else if (engine.getRequest(player)) {
                engine.submitAction(rng.pick(engine.getAvailableActions(player)))
            }
        }
    }
    return engine
}

describe('빠른 경로 (Showdown 핫패스 패치)', () => {
    for (const format of ['singles', 'doubles', 'triples', 'rotation'] as const) {
        it(`${format}: 원본과 프로토콜 로그가 같다`, () => {
            for (let seed = 1; seed <= 6; seed++) {
                const fast = play(format, seed, true)
                const orig = play(format, seed, false)
                expect(fast.battle.ended).toBe(true)
                expect(comparableLog(fast.battle)).toBe(comparableLog(orig.battle))
            }
        })
    }

    it('fastPath 를 켜지 않은 Battle 은 원본 경로 그대로다', () => {
        const engine = play('singles', 3, true)
        const plain = replayInputLog(engine.battle.inputLog)
        expect((plain as unknown as { fastPath?: boolean }).fastPath).toBeUndefined()
        expect((engine.battle as unknown as { fastPath?: boolean }).fastPath).toBe(true)
        expect(comparableLog(plain)).toBe(comparableLog(engine.battle))
    })

    it('engine.battle.log 는 Showdown 로그 전체 (|gametype| 포함)', () => {
        const engine = play('singles', 2, true)
        expect(engine.battle.log).toContain('|gametype|singles')
        expect(engine.battle).toBeInstanceOf(Battle)
    })
})
