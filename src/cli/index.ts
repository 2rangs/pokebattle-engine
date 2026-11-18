// ─── pokebattle CLI ───────────────────────────────────────────
//   pokebattle play  [--team <파일>] [--foe <파일>] [--lang ko|en|ja] [--seed N] [--level N]
//   pokebattle watch [--lang ..] [--seed N] [--format singles|rotation] [--json]
//   pokebattle sim   [--battles N] [--seed N] [--vs random|heuristic] [--json]
// 팀 파일: Showdown 내보내기 텍스트, 또는 JSON (PokemonSet[] / { pokemons: [...] })
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import {
    BattleEngine, HeuristicAI, RandomAI, createFormatter, loadNames, preloadData, generateRandomTeam, parseShowdownTeam,
    loadTeam, PRNG, simulateBattle,
} from '../index'
import type { Action, BattleAI, BattleFormat, BattlePokemon, Formatter, PlayerID, PokemonSet } from '../index'

// ─── 인자 ─────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const command = argv[0] && !argv[0].startsWith('-') ? argv[0] : 'help'
const flag = (name: string) => argv.includes(`--${name}`)
const opt = (name: string, def?: string) => {
    const i = argv.indexOf(`--${name}`)
    return i >= 0 && argv[i + 1] && !argv[i + 1]!.startsWith('--') ? argv[i + 1]! : def
}
const lang = opt('lang', process.env.POKEBATTLE_LANG ?? 'ko')!
const seed = Number(opt('seed', String(Math.floor(Math.random() * 1e9))))
const json = flag('json')
const color = process.stdout.isTTY && !json && !process.env.NO_COLOR

// ─── 화면 문구 (로그 문장은 엔진 로케일, 여기는 CLI 자체 문구만) ──
const UI: Record<string, Record<string, string>> = {
    ko: {
        moves: '기술', switch: '교체', tera: '테라스탈 + 기술 (예: t1)', pick: '교체할 포켓몬', invalid: '잘못된 입력입니다.',
        you: '나', foe: '상대', result: '결과', draw: '무승부', win: '{name} 승리', turns: '{n}턴', seed: '시드', quit: 'q) 그만두기',
        power: '위력', preview: '예상', battles: '배틀', winRate: '승률', avgTurns: '평균 턴', time: '시간',
    },
    en: {
        moves: 'Moves', switch: 'switch', tera: 'Terastallize + move (e.g. t1)', pick: 'Switch to', invalid: 'Invalid input.',
        you: 'You', foe: 'Foe', result: 'Result', draw: 'Draw', win: '{name} wins', turns: '{n} turns', seed: 'seed', quit: 'q) quit',
        power: 'BP', preview: 'est.', battles: 'battles', winRate: 'win rate', avgTurns: 'avg turns', time: 'time',
    },
    ja: {
        moves: 'わざ', switch: '交代', tera: 'テラスタル + わざ (例: t1)', pick: '交代するポケモン', invalid: '入力が正しくありません。',
        you: '自分', foe: '相手', result: '結果', draw: '引き分け', win: '{name}の勝ち', turns: '{n}ターン', seed: 'シード', quit: 'q) やめる',
        power: '威力', preview: '予想', battles: 'バトル', winRate: '勝率', avgTurns: '平均ターン', time: '時間',
    },
}
const t = (key: string, vars: Record<string, string | number> = {}) =>
    (UI[lang]?.[key] ?? UI.en![key] ?? key).replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''))
const paint = (code: string, s: string) => (color ? `\x1b[${code}m${s}\x1b[0m` : s)
/** 터미널 표시 폭 기준 padEnd (한글·가나·한자는 2칸) */
const WIDE = /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/
const width = (s: string) => [...s].reduce((w, c) => w + (WIDE.test(c) ? 2 : 1), 0)
const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - width(s)))

const HELP = `pokebattle — Pokémon Showdown-accurate battles from the terminal

  pokebattle play   [--team FILE] [--foe FILE] [--level N]   play against the AI
  pokebattle watch  [--format singles|rotation]              AI vs AI, battle log
  pokebattle sim    [--battles N] [--vs random|heuristic]    many AI battles, stats

  --lang ko|en|ja   log language (default ko, or POKEBATTLE_LANG)
  --seed N          same seed + same choices = same battle
  --json            JSON Lines: every engine event (+ "text") / sim result

  Team files: Showdown export text, or JSON (PokemonSet[] or { "pokemons": [...] }).
  Without a team file, random-battle teams are used.`

// ─── 팀 ───────────────────────────────────────────────────────
function readTeam(file: string | undefined, rng: PRNG, level?: number): PokemonSet[] {
    let team: PokemonSet[]
    if (!file) team = generateRandomTeam({ seed: rng.int(0x7fffffff) })
    else {
        const text = readFileSync(file, 'utf8')
        if (text.trimStart().startsWith('{') || text.trimStart().startsWith('[')) {
            const data = JSON.parse(text)
            team = Array.isArray(data) ? data : loadTeam(data)
        } else team = parseShowdownTeam(text)
    }
    return level ? team.map(s => ({ ...s, level })) : team
}

// ─── 출력 ─────────────────────────────────────────────────────
function attachLog(engine: BattleEngine, fmt: Formatter): void {
    engine.on('*', ev => {
        if (ev.type === 'turn_end') return
        const text = fmt.format(ev)
        if (json) {
            const { state: _state, ...rest } = ev as typeof ev & { state?: unknown }
            void _state
            console.log(JSON.stringify({ ...rest, ...(ev.type === 'move_use' ? { move: ev.move.name } : {}), text }))
            return
        }
        if (!text) return
        console.log(ev.type === 'turn_start' ? `\n${paint('1', text)}` : `  ${text}`)
    })
}

function hpBar(p: BattlePokemon, width = 20): string {
    const ratio = p.max_hp ? p.hp / p.max_hp : 0
    const filled = Math.round(ratio * width)
    const c = ratio > 0.5 ? '32' : ratio > 0.2 ? '33' : '31'
    return paint(c, '█'.repeat(filled)) + paint('90', '░'.repeat(width - filled))
}

function line(fmt: Formatter, p: BattlePokemon): string {
    const status = p.status ? ` [${fmt.name.term('status', p.status)}]` : ''
    const tera = p.terastallized ? ` (${fmt.name.type(p.tera_type ?? '')})` : ''
    const name = p.nickname && p.nickname !== p.species ? p.nickname : fmt.name.species(p.species)
    return `${pad(name, 16)} ${hpBar(p)} ${String(p.hp).padStart(3)}/${p.max_hp}${status}${tera}`
}

function result(engine: BattleEngine): string {
    const { winner, turn } = engine.getState()
    const who = winner === 'draw' || !winner ? t('draw') : t('win', { name: engine.getSide(winner).name ?? winner })
    return `${t('result')}: ${who} (${t('turns', { n: turn })})`
}

// ─── play: 사람 vs AI ─────────────────────────────────────────
async function play(): Promise<void> {
    const rng = new PRNG(seed)
    const level = opt('level') ? Number(opt('level')) : undefined
    const engine = new BattleEngine({
        format: 'singles', seed,
        p1: { name: t('you'), team: readTeam(opt('team'), rng, level) },
        p2: { name: 'AI', team: readTeam(opt('foe'), rng, level) },
    })
    const fmt = createFormatter({ locale: lang, getPokemon: id => engine.getPokemon(id) })
    attachLog(engine, fmt)
    if (!json) console.log(paint('90', `${t('seed')}: ${seed}`))
    engine.start()
    const ai = new HeuristicAI({ seed: seed + 1 })
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    try {
        while (!engine.battle.ended) {
            if (engine.getRequest('p1')) {
                const action = await choose(engine, fmt, rl)
                if (!action) return
                engine.submitAction(action)
            }
            if (!engine.battle.ended && engine.getRequest('p2')) engine.submitAction(ai.chooseAction(engine, 'p2')!)
        }
        console.log(`\n${paint('1', result(engine))}`)
    } finally {
        rl.close()
    }
}

async function choose(engine: BattleEngine, fmt: Formatter, rl: ReturnType<typeof createInterface>): Promise<Action | null> {
    const req = engine.getRequest('p1')!
    const switchTo = async (): Promise<Action | null> => {
        req.switches.forEach((p, i) => console.log(`  ${i + 1}) ${line(fmt, p)}`))
        const n = Number(await rl.question(`${t('pick')} > `)) - 1
        const target = req.switches[n]
        return target ? { type: 'switch', player: 'p1', pokemon_id: req.active.id, switch_to_id: target.id } : null
    }
    if (req.type === 'switch') {
        for (;;) { const a = await switchTo(); if (a) return a }
    }
    console.log(`\n  ${pad(t('foe'), 6)} ${line(fmt, engine.getActive('p2'))}`)
    console.log(`  ${pad(t('you'), 6)} ${line(fmt, req.active)}`)
    console.log(`\n${t('moves')}:`)
    req.moves.forEach((m, i) => {
        const pv = m.move.category === 'status' ? null : engine.previewDamage('p1', m.index)
        const est = pv ? `  ${t('preview')} ${pv.minPercent}–${pv.maxPercent}%` : ''
        const name = pad(fmt.name.move(m.move.name), 16)
        const off = m.disabled ? paint('90', `  (${m.disabled_reason})`) : ''
        console.log(`  ${i + 1}) ${name} ${pad(fmt.name.type(m.move.type), 8)} ${t('power')} ${String(m.move.power ?? '-').padStart(3)}  PP ${m.pp}/${m.max_pp}${est}${off}`)
    })
    if (req.can_switch) console.log(`  s) ${t('switch')}`)
    if (req.can_terastallize) console.log(`  t<n>) ${t('tera')} → ${fmt.name.type(req.active.tera_type ?? '')}`)
    console.log(`  ${t('quit')}`)
    for (;;) {
        const input = (await rl.question('> ')).trim().toLowerCase()
        if (input === 'q') return null
        if (input === 's' && req.can_switch) { const a = await switchTo(); if (a) return a; continue }
        const tera = input.startsWith('t') && req.can_terastallize
        const opt = req.moves[Number(tera ? input.slice(1) : input) - 1]
        if (opt && !opt.disabled) return { type: 'move', player: 'p1', pokemon_id: req.active.id, move_index: opt.index, terastallize: tera || undefined }
        console.log(`  ${t('invalid')}`)
    }
}

// ─── watch: AI vs AI ──────────────────────────────────────────
function watch(): void {
    const rng = new PRNG(seed)
    const format = (opt('format', 'singles') as BattleFormat)
    const engine = new BattleEngine({
        format, seed,
        p1: { name: 'AI-1', team: readTeam(opt('team'), rng) },
        p2: { name: 'AI-2', team: readTeam(opt('foe'), rng) },
    })
    attachLog(engine, createFormatter({ locale: lang, getPokemon: id => engine.getPokemon(id) }))
    if (!json) console.log(paint('90', `${t('seed')}: ${seed}`))
    const ais: Record<PlayerID, BattleAI> = { p1: new HeuristicAI({ seed: seed + 1 }), p2: new HeuristicAI({ seed: seed + 2 }) }
    engine.start()
    while (!engine.battle.ended) {
        for (const p of ['p1', 'p2'] as const) {
            if (!engine.battle.ended && (engine.getRequest(p) || engine.getTeamPreview(p))) engine.submitAction(ais[p].chooseAction(engine, p)!)
        }
    }
    if (!json) console.log(`\n${paint('1', result(engine))}`)
}

// ─── sim: 대량 AI 배틀 ────────────────────────────────────────
function sim(): void {
    const n = Number(opt('battles', '100'))
    const vs = opt('vs', 'random')
    const start = performance.now()
    let wins = 0, draws = 0, turns = 0
    for (let i = 0; i < n; i++) {
        const rng = new PRNG(seed + i)
        const first = i % 2 === 0
        const foe = (s: number): BattleAI => (vs === 'heuristic' ? new HeuristicAI({ seed: s }) : new RandomAI(s))
        const r = simulateBattle({
            format: 'singles', seed: seed + i,
            p1: { name: 'p1', team: generateRandomTeam({ seed: rng.int(0x7fffffff) }) },
            p2: { name: 'p2', team: generateRandomTeam({ seed: rng.int(0x7fffffff) }) },
        }, { p1: first ? new HeuristicAI({ seed: i }) : foe(i), p2: first ? foe(i) : new HeuristicAI({ seed: i }) })
        turns += r.turns
        if (r.winner === 'draw') draws++
        else if ((r.winner === 'p1') === first) wins++
    }
    const ms = performance.now() - start
    const out = { battles: n, opponent: vs, heuristicWins: wins, draws, winRate: wins / n, avgTurns: turns / n, ms: Math.round(ms), seed }
    if (json) { console.log(JSON.stringify(out)); return }
    console.log(`HeuristicAI vs ${vs}AI — ${n} ${t('battles')}`)
    console.log(`  ${t('winRate')}: ${(out.winRate * 100).toFixed(1)}%  (${wins}W / ${n - wins - draws}L / ${draws}D)`)
    console.log(`  ${t('avgTurns')}: ${out.avgTurns.toFixed(1)}  ${t('time')}: ${out.ms} ms (${(ms / n).toFixed(1)} ms/${t('battles')})`)
}

async function main(): Promise<void> {
    if (command === 'help' || flag('help')) { console.log(HELP); return }
    await preloadData()
    if (lang !== 'ko' && lang !== 'en') await loadNames(lang)
    if (command === 'play') return play()
    if (command === 'watch') return watch()
    if (command === 'sim') return sim()
    console.error(`unknown command: ${command}\n\n${HELP}`)
    process.exitCode = 1
}

main().catch(err => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
})
