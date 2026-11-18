// ─── 대량 퍼징 테스트 ─────────────────────────────────────────
// npx tsx scripts/fuzz.ts --battles 1000000 --workers 4 [--start 0] [--out .scratch/fuzz-report.json]
//
// 배틀마다 (시드로 재현 가능):
//  - 포맷: singles 65% / doubles 15% / triples 10% / rotation 10%, 20% 는 팀 프리뷰(+출전 수 선택)
//  - 팀: Showdown 랜덤배틀 세트 50% / 혼돈 팀(무작위 종·특성·도구·기술·노력치·레벨·테라) 50%
//  - 선택: 무작위 (singles·rotation 은 엔진의 getAvailableActions — 회전 포함, doubles/triples 는 Showdown 요청 기반), 일부 HeuristicAI
// 검사(불변식):
//  1. 예외 없음
//  2. singles·rotation: 엔진이 제시한 행동은 Showdown 이 모두 수락
//  3. 처리하지 못한 프로토콜 메시지 0
//  4. 이벤트의 포켓몬 ID 가 모두 실제 포켓몬
//  5. 이벤트만으로 재구성한 HP == 시뮬레이터 실제 HP (모든 포켓몬)
//  6. 기절 이벤트 수 == 기절한 포켓몬 수, 승자 일관성
//  7. 1% 표본: 같은 시드 재실행 시 프로토콜 로그 동일 (결정성)
//  8. 전수: 빠른 경로(기본)와 Showdown 원본 경로(fast: false)의 프로토콜 로그 동일 (--no-fast-check 로 끔)
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import { writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { cpus } from 'node:os'
import { randomDoublesChoice } from './shared/random-choice.ts'

interface Failure { battle: number; seed: number; kind: string; message: string }
interface Stats {
    battles: number; singles: number; doubles: number; triples: number; rotation: number; turns: number; ties: number
    events: number; choices: number; doublesFallbacks: number; determinismChecks: number; fastChecks: number
    failures: Failure[]; failureCount: number; kinds: Record<string, number>
}

const emptyStats = (): Stats => ({
    battles: 0, singles: 0, doubles: 0, triples: 0, rotation: 0, turns: 0, ties: 0, events: 0, choices: 0, doublesFallbacks: 0,
    determinismChecks: 0, fastChecks: 0, failures: [], failureCount: 0, kinds: {},
})

async function runWorker(): Promise<void> {
    const { BattleEngine, generateRandomTeam, generateChaosTeam, PRNG, HeuristicAI, ACTIVE_PER_SIDE } = await import('../dist/index.js')
    type Engine = InstanceType<typeof BattleEngine>
    const { start, end, fastCheck } = workerData as { start: number; end: number; fastCheck: boolean }
    let stats = emptyStats()
    const fail = (battle: number, seed: number, kind: string, message: string) => {
        stats.failureCount++
        const k = kind === 'exception' ? `exception:${message.split('\n')[0]!.replace(/\(.*\)$/, '').replace(/p[12]:/, 'pX:').slice(0, 90)}` : kind
        stats.kinds[k] = (stats.kinds[k] ?? 0) + 1
        if (stats.failures.length < 20) stats.failures.push({ battle, seed, kind, message: message.slice(0, 500) })
    }

    function playBattle(battleNo: number, check: boolean, fast = true): { engine: Engine; hash: string } {
        const seed = battleNo
        const rng = new PRNG(seed * 7919 + 13)
        const roll = rng.int(100)
        const format = roll < 65 ? 'singles' : roll < 80 ? 'doubles' : roll < 90 ? 'triples' : 'rotation'
        const doubles = format === 'doubles' || format === 'triples' // Showdown 선택 문자열로 진행하는 다중 슬롯 형식
        const minSize = ACTIVE_PER_SIDE[format]
        const team = () => (rng.chance(50)
            ? generateRandomTeam({ seed: rng.int(0x7fffffff), format: doubles ? 'gen9randomdoublesbattle' : 'gen9randombattle', size: rng.int(minSize, 6) })
            : generateChaosTeam({ rng, size: rng.int(minSize, 6) }))
        const p1team = team(), p2team = team()
        const preview = rng.chance(20)
        const options = preview
            ? { teamPreview: true, pickedTeamSize: rng.int(minSize, Math.min(p1team.length, p2team.length)) }
            : undefined
        const engine = new BattleEngine({ format, seed, maxTurns: 300, options, p1: { name: 'P1', team: p1team }, p2: { name: 'P2', team: p2team } }, { turnSnapshots: false, fast })
        const heuristic = !doubles && rng.chance(5)
        const ais = heuristic ? { p1: new HeuristicAI({ seed }), p2: new HeuristicAI({ seed: seed + 1 }) } : null
        engine.start()
        if (check) {
            initialMaxHp.clear()
            for (const pl of ['p1', 'p2'] as const) engine.getSide(pl).team.forEach(p => initialMaxHp.set(p.id, p.max_hp))
        }
        let guard = 0
        while (!engine.battle.ended && guard++ < 5000) {
            for (const player of ['p1', 'p2'] as const) {
                if (engine.battle.ended) break
                const pv = engine.getTeamPreview(player)
                if (pv) {
                    const order = rng.shuffle(pv.team.map(p => p.id)).slice(0, pv.pick)
                    engine.submitAction({ type: 'team', player, order }) // 실패 시 예외
                    if (check) stats.choices++
                    continue
                }
                if (doubles) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const req = engine.getRawRequest(player) as any
                    if (!req || req.wait || engine.battle[player].isChoiceDone()) continue
                    const choice = randomDoublesChoice(req, rng)
                    try {
                        engine.submitChoice(player, choice)
                    } catch {
                        if (check) stats.doublesFallbacks++
                        engine.submitChoice(player, 'default')
                    }
                } else {
                    const req = engine.getRequest(player)
                    if (!req) continue
                    if (engine.rotation && !ais && rng.chance(5)) {
                        engine.submitChoice(player, 'default') // 로테이션 기본 선택 경로 (실패 시 예외)
                        if (check) stats.choices++
                        continue
                    }
                    const action = ais ? ais[player].chooseAction(engine, player) : rng.pick(engine.getAvailableActions(player))
                    if (!action) throw new Error(`no available action (${player}, ${req.type})`)
                    engine.submitAction(action) // 실패 시 예외 → 불변식 2 위반
                }
                if (check) stats.choices++
            }
        }
        if (!engine.battle.ended) throw new Error('battle did not end within 5000 decisions')
        // |t:| 는 실제 시각이라 제외
        const hash = createHash('sha1').update(engine.battle.log.filter(l => !l.startsWith('|t:|')).join('\n')).digest('hex')
        return { engine, hash }
    }

    const initialMaxHp = new Map<string, number>()
    function verify(engine: Engine, battleNo: number): void {
        const seed = battleNo
        const unknown = [...engine.unhandledProtocol.keys()]
        if (unknown.length) fail(battleNo, seed, 'protocol', `unhandled: ${unknown.join(',')}`)
        const state = engine.getState()
        const hp = new Map<string, number>()
        const all = [...state.sides.p1.team, ...state.sides.p2.team]
        for (const p of all) hp.set(p.id, initialMaxHp.get(p.id) ?? p.max_hp)
        let faints = 0
        for (const ev of state.log) {
            const id = (ev as { pokemon_id?: string }).pokemon_id
            if (['damage', 'heal', 'faint', 'move_use', 'status_apply', 'stat_change', 'terastallize'].includes(ev.type) && (!id || !hp.has(id))) {
                fail(battleNo, seed, 'event-id', `${ev.type} with pokemon_id='${id}'`)
                continue
            }
            if (ev.type === 'switch' && !hp.has(ev.in_id)) fail(battleNo, seed, 'event-id', `switch in_id='${ev.in_id}'`)
            if (ev.type === 'damage') hp.set(ev.pokemon_id, hp.get(ev.pokemon_id)! - ev.amount)
            if (ev.type === 'heal') hp.set(ev.pokemon_id, hp.get(ev.pokemon_id)! + ev.amount)
            if (ev.type === 'faint') { faints++; hp.set(ev.pokemon_id, 0) }
        }
        for (const p of all) {
            const real = engine.getShowdownPokemon(p.id)!
            // 변신/폼체인지로 최대 HP 가 바뀌는 경우(지가르데 등) 실제 비율 기준
            if (hp.get(p.id) !== Math.max(0, real.hp)) {
                fail(battleNo, seed, 'hp-replay', `${p.id} ${p.species}: events=${hp.get(p.id)} real=${real.hp}`)
                break
            }
        }
        const fainted = all.filter(p => engine.getShowdownPokemon(p.id)!.fainted).length
        if (faints < fainted) fail(battleNo, seed, 'faint-count', `events=${faints} fainted=${fainted}`)
        const w = state.winner
        if (w === 'p1' || w === 'p2') {
            const loser = w === 'p1' ? 'p2' : 'p1'
            if (!engine.battle[loser].pokemon.every(p => p.fainted) && state.turn <= 300) fail(battleNo, seed, 'winner', `winner ${w} but loser has Pokémon left`)
        }
        if (!state.log.some(e => e.type === 'battle_end')) fail(battleNo, seed, 'end', 'no battle_end event')
        stats.events += state.log.length
        stats.turns += state.turn
        if (w === 'draw') stats.ties++
    }

    let lastReport = Date.now()
    for (let i = start; i < end; i++) {
        try {
            const { engine, hash } = playBattle(i, true)
            if (engine.rotation) stats.rotation++
            else if (engine.battle.gameType === 'doubles') stats.doubles++
            else if (engine.battle.gameType === 'triples') stats.triples++
            else stats.singles++
            verify(engine, i)
            if (i % 100 === 0) {
                stats.determinismChecks++
                const again = playBattle(i, false)
                if (again.hash !== hash) fail(i, i, 'determinism', 'same seed produced a different protocol log')
            }
            if (fastCheck) {
                stats.fastChecks++
                const ref = playBattle(i, false, false)
                if (ref.hash !== hash) fail(i, i, 'fast-path', 'fast path and Showdown original produced different protocol logs')
            }
        } catch (err) {
            fail(i, i, 'exception', (err as Error).stack ?? String(err))
        }
        stats.battles++
        if (Date.now() - lastReport > 2000 || i === end - 1) {
            parentPort!.postMessage(stats)
            stats = emptyStats()
            lastReport = Date.now()
        }
    }
}

async function runMain(): Promise<void> {
    const arg = (name: string, def: number) => {
        const i = process.argv.indexOf(`--${name}`)
        return i >= 0 ? Number(process.argv[i + 1]) : def
    }
    const outIdx = process.argv.indexOf('--out')
    const out = outIdx >= 0 ? process.argv[outIdx + 1]! : '.scratch/fuzz-report.json'
    const total = arg('battles', 10000)
    const workers = arg('workers', Math.max(1, cpus().length))
    const start = arg('start', 0)
    const t0 = Date.now()
    const agg = emptyStats()
    const per = Math.ceil(total / workers)
    const file = fileURLToPath(import.meta.url)

    const write = (done: boolean) => {
        const secs = (Date.now() - t0) / 1000
        const report = {
            done, range: [start, start + total], elapsedSec: Math.round(secs), ratePerSec: Math.round(agg.battles / secs),
            ...agg, failures: agg.failures.slice(0, 50),
        }
        writeFileSync(out, JSON.stringify(report, null, 2))
        return report
    }

    await Promise.all(Array.from({ length: workers }, (_, w) => new Promise<void>((resolve, reject) => {
        const s = start + w * per
        const e = Math.min(start + total, s + per)
        if (s >= e) return resolve()
        const worker = new Worker(file, { workerData: { start: s, end: e, fastCheck: !process.argv.includes('--no-fast-check') }, execArgv: [] })
        worker.on('message', (st: Stats) => {
            for (const k of ['battles', 'singles', 'doubles', 'triples', 'rotation', 'turns', 'ties', 'events', 'choices', 'doublesFallbacks', 'determinismChecks', 'fastChecks', 'failureCount'] as const) agg[k] += st[k]
            agg.failures.push(...st.failures)
            for (const [k, v] of Object.entries(st.kinds)) agg.kinds[k] = (agg.kinds[k] ?? 0) + v
        })
        worker.on('error', reject)
        worker.on('exit', () => resolve())
    })).concat([(async () => {
        while (agg.battles < total) {
            await new Promise(r => setTimeout(r, 10000))
            const r = write(false)
            console.log(`[fuzz] ${r.battles}/${total} battles, ${r.ratePerSec}/s, failures ${r.failureCount}`)
            if (agg.battles >= total) break
        }
    })()]))
    const r = write(true)
    console.log(JSON.stringify({ ...r, failures: r.failures.slice(0, 5) }, null, 2))
    process.exit(r.failureCount > 0 ? 1 : 0)
}

if (isMainThread) runMain()
else runWorker()
