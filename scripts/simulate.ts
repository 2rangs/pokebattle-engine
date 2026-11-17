// ─── 터미널 배틀 시뮬레이터 ──────────────────────────────────
// npm run simulate              → 내가 p1, AI 가 p2
// npm run simulate -- --auto    → AI vs AI 관전
// npm run simulate -- --random  → 랜덤 팀
// npm run simulate -- --seed 42
import * as readline from 'node:readline'
import {
    preloadData, loadTeam, BattleEngine, HeuristicAI, formatEvent, generateRandomTeam, PRNG,
    STATUS_NAME_KO, type Action, type BattleConfig, type PlayerID, type BattlePokemon,
} from '../src/index'
import p1Json from '../src/data/p1_sample.json'
import p2Json from '../src/data/p2_sample.json'

const args = process.argv.slice(2)
const auto = args.includes('--auto')
const random = args.includes('--random')
const seedArg = args.indexOf('--seed')
const seed = seedArg !== -1 ? Number(args[seedArg + 1]) : Math.floor(Math.random() * 1e9)

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const ask = (q: string) => new Promise<string>(res => rl.question(q, res))

function hpBar(p: BattlePokemon, width = 20): string {
    const ratio = p.hp / p.max_hp
    const filled = Math.round(ratio * width)
    const color = ratio > 0.5 ? '\x1b[32m' : ratio > 0.2 ? '\x1b[33m' : '\x1b[31m'
    return `${color}${'█'.repeat(filled)}\x1b[90m${'░'.repeat(width - filled)}\x1b[0m`
}

function describe(p: BattlePokemon): string {
    const status = p.status ? ` [${STATUS_NAME_KO[p.status]}]` : ''
    const tera = p.terastallized ? ` (테라:${p.tera_type})` : ''
    return `${p.nickname.padEnd(14)} ${hpBar(p)} ${String(p.hp).padStart(3)}/${p.max_hp}${status}${tera}`
}

function showField(engine: BattleEngine): void {
    const s = engine.getState()
    const f = s.field
    const extras = [f.weather && `날씨:${f.weather}`, f.terrain && `필드:${f.terrain}`, ...Object.keys(f.conditions)].filter(Boolean)
    console.log(`\n  상대  ${describe(engine.getActive('p2'))}`)
    console.log(`  나    ${describe(engine.getActive('p1'))}`)
    if (extras.length) console.log(`  ${extras.join(' · ')}`)
}

async function chooseHuman(engine: BattleEngine, player: PlayerID): Promise<Action> {
    const req = engine.getRequest(player)!
    if (req.type === 'switch') {
        console.log('\n교체할 포켓몬을 고르세요:')
        req.switches.forEach((p, i) => console.log(`  ${i + 1}) ${describe(p)}`))
        for (;;) {
            const n = Number(await ask('> ')) - 1
            const target = req.switches[n]
            if (target) return { type: 'switch', player, pokemon_id: req.active.id, switch_to_id: target.id }
        }
    }
    showField(engine)
    console.log('\n기술:')
    req.moves.forEach((m, i) => console.log(`  ${i + 1}) ${m.move.name.padEnd(16)} ${m.move.type.padEnd(9)} 위력 ${String(m.move.power ?? '-').padStart(3)}  PP ${m.pp}/${m.max_pp}${m.disabled ? `  (${m.disabled_reason})` : ''}`))
    if (req.can_switch) console.log('  s) 교체')
    if (req.can_terastallize) console.log(`  t<번호>) 테라스탈 + 기술 (예: t1, 테라 타입: ${req.active.tera_type})`)
    for (;;) {
        const input = (await ask('> ')).trim().toLowerCase()
        if (input === 's' && req.can_switch) {
            req.switches.forEach((p, i) => console.log(`  ${i + 1}) ${describe(p)}`))
            const n = Number(await ask('교체 > ')) - 1
            const target = req.switches[n]
            if (target) return { type: 'switch', player, pokemon_id: req.active.id, switch_to_id: target.id }
            continue
        }
        const tera = input.startsWith('t') && req.can_terastallize
        const n = Number(tera ? input.slice(1) : input) - 1
        const opt = req.moves[n]
        if (opt && !opt.disabled) return { type: 'move', player, pokemon_id: req.active.id, move_index: opt.index, terastallize: tera || undefined }
        console.log('  잘못된 입력입니다.')
    }
}

async function main(): Promise<void> {
    await preloadData()
    const rng = new PRNG(seed)
    const config: BattleConfig = {
        format: 'singles',
        seed,
        p1: { name: auto ? 'AI-1' : '나', team: random ? generateRandomTeam({ rng }) : loadTeam(p1Json) },
        p2: { name: 'AI', team: random ? generateRandomTeam({ rng }) : loadTeam(p2Json) },
    }
    const engine = new BattleEngine(config)
    engine.on('*', ev => {
        const line = formatEvent(ev, { getPokemon: id => engine.getPokemon(id) })
        if (line) console.log(ev.type === 'turn_start' ? `\n\x1b[1m${line}\x1b[0m` : `  ${line}`)
    })
    console.log(`seed: ${seed}`)
    engine.start()

    const ai: Record<PlayerID, HeuristicAI | null> = {
        p1: auto ? new HeuristicAI({ seed: seed + 1 }) : null,
        p2: new HeuristicAI({ seed: seed + 2 }),
    }
    while (engine.getState().phase !== 'ended') {
        for (const player of ['p1', 'p2'] as PlayerID[]) {
            if (engine.getState().phase === 'ended' || !engine.getRequest(player)) continue
            const bot = ai[player]
            const action = bot ? bot.chooseAction(engine, player)! : await chooseHuman(engine, player)
            engine.submitAction(action)
        }
    }
    const { winner, turn } = engine.getState()
    console.log(`\n결과: ${winner === 'draw' ? '무승부' : `${engine.getSide(winner as PlayerID).name} 승리`} (${turn}턴)`)
    rl.close()
}

main().catch(err => {
    console.error(err)
    rl.close()
    process.exit(1)
})
