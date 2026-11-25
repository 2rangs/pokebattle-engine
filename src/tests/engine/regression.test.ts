// ─── 회귀 스냅샷 ──────────────────────────────────────────────
// 세대마다 정해진 시드의 랜덤배틀을 끝까지 돌려 한국어·영어 로그 전체와 결과를 스냅샷으로 고정한다.
// 판정(Showdown)·이벤트 변환·로그 문장 중 무엇이든 바뀌면 여기서 드러난다.
// 의도한 변경이면 `npx vitest run -u` 로 스냅샷을 갱신하고, diff 를 리뷰에서 확인한다.
// 전수 점검(모든 기술·특성·아이템 + 대량 랜덤배틀)은 scripts/regression.ts.
import { describe, it, expect, beforeAll } from 'vitest'
import { createRandomBattle, createFormatter, HeuristicAI, preloadData, PRNG } from '../../index'
import type { BattleEngine, Generation } from '../../index'
import { randomDoublesChoice } from '../../utils/random-choice'

beforeAll(async () => { await preloadData({ gens: [1, 2, 3, 4, 5, 6, 7, 8, 9] }) })

function transcript(e: BattleEngine) {
    const ko = createFormatter({ locale: 'ko', getPokemon: id => e.getPokemon(id) })
    const en = createFormatter({ locale: 'en', getPokemon: id => e.getPokemon(id) })
    const lines: string[] = []
    e.on('*', ev => {
        const k = ko.format(ev)
        if (k) lines.push(`${k}  ‖  ${en.format(ev) ?? ''}`)
    })
    return lines
}

function summary(e: BattleEngine) {
    const st = e.getState()
    const side = (p: 'p1' | 'p2') => st.sides[p].team.map(m => `${m.species} ${m.hp}/${m.max_hp}${m.status ? ' ' + m.status : ''}`)
    return { winner: st.winner, turns: st.turn, p1: side('p1'), p2: side('p2') }
}

describe('회귀 스냅샷: 세대별 랜덤배틀 전체 로그', () => {
    for (const gen of [1, 2, 3, 4, 5, 6, 7, 8, 9] as Generation[]) {
        it(`${gen}세대`, () => {
            const e = createRandomBattle({ gen, seed: 4242 + gen, engine: { turnSnapshots: false } })
            const lines = transcript(e)
            const ai = new HeuristicAI({ seed: gen })
            e.start()
            for (let g = 0; g < 3000 && !e.ps.ended; g++) {
                for (const p of ['p1', 'p2'] as const) {
                    if (e.ps.ended) break
                    if (e.getRequest(p)) e.submitAction(ai.chooseAction(e, p)!)
                }
            }
            expect(e.ps.ended).toBe(true)
            expect([...e.unhandledProtocol.keys()]).toEqual([])
            expect({ summary: summary(e), log: lines }).toMatchSnapshot()
        })
    }

    it('9세대 더블', () => {
        const e = createRandomBattle({ format: 'doubles', seed: 777, engine: { turnSnapshots: false } })
        const lines = transcript(e)
        const rng = new PRNG(7)
        e.start()
        for (let g = 0; g < 3000 && !e.ps.ended; g++) {
            for (const p of ['p1', 'p2'] as const) {
                if (e.ps.ended) break
                const req = e.getRawRequest(p) as { wait?: boolean } | null
                if (!req || req.wait || e.ps[p].isChoiceDone()) continue
                try { e.submitChoice(p, randomDoublesChoice(req, rng)) } catch { e.submitChoice(p, 'default') }
            }
        }
        expect(e.ps.ended).toBe(true)
        expect({ summary: summary(e), log: lines }).toMatchSnapshot()
    })
})
