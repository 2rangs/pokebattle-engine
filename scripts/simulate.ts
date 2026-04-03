import * as readline from 'readline'
import { preloadData } from '../src/data/loader'
import { loadTeam } from '../src/utils/parseShowdown'
import { BattleEngine } from '../src/engine/BattleEngine'
import type { BattleEvent } from '../src/types/battle'
import type { BattlePokemon } from '../src/types/pokemon'

import p1Json from '../src/data/p1_sample.json'
import p2Json from '../src/data/p2_sample.json'

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const ask = (q: string): Promise<string> => new Promise(resolve => rl.question(q, resolve))

let engine: BattleEngine

// ─── 이벤트 출력 ─────────────────────────────────────────────
function logEvent(event: BattleEvent): void {
    switch (event.type) {
        case 'turn_start':
            console.log(`\n${'═'.repeat(64)}`)
            console.log(`  턴 ${event.turn}`)
            console.log(`${'═'.repeat(64)}`)
            break

        case 'move_use':
            console.log(`  ⚔️  [${nickOrId(event.pokemon_id)}] ${event.move.name} → ${nickOrId(event.target_id)}`)
            break

        case 'move_miss':
            console.log(`  💨 [${nickOrId(event.pokemon_id)}] ${event.move.name} 빗나감!`)
            break

        case 'move_fail':
            console.log(`  ❌ [${nickOrId(event.pokemon_id)}] ${event.move.name} 실패 (${event.reason})`)
            break

        case 'damage':
            console.log(`  💥 [${nickOrId(event.pokemon_id)}] ${event.amount} 데미지 (${event.source})`)
            break

        case 'heal':
            console.log(`  💚 [${nickOrId(event.pokemon_id)}] ${event.amount} 회복 (${event.source})`)
            break

        case 'faint':
            console.log(`  💀 [${nickOrId(event.pokemon_id)}] 기절!`)
            break

        case 'status_apply':
            console.log(`  🔥 [${nickOrId(event.pokemon_id)}] ${statusName(event.status)} 상태이상!`)
            break

        case 'status_remove':
            console.log(`  ✨ [${nickOrId(event.pokemon_id)}] ${statusName(event.status)} 해제!`)
            break

        case 'stat_change': {
            const p = engine?.getPokemon(event.pokemon_id) as AnyPokemonLike | undefined
            const currentStage = getStageValue(p, event.stat)
            const multiplier = getStageMultiplier(currentStage, event.stat)
            const effective = p ? getEffectiveStat(p, event.stat) : null

            const delta = event.stages > 0 ? `+${event.stages}` : `${event.stages}`
            const current = formatStage(currentStage)

            console.log(
                `  📊 [${nickOrId(event.pokemon_id)}] ${statName(event.stat)} ${delta} ` +
                `(현재 ${current}, x${multiplier.toFixed(2)}${effective != null ? `, 실수치 ${effective}` : ''})`
            )
            break
        }

        case 'weather_change':
            if (event.weather) {
                console.log(`  ${weatherName(event.weather)} 발생! (${event.source})`)
            } else {
                console.log(`  🌤️  날씨 종료`)
            }
            break

        case 'terrain_change':
            if (event.terrain) {
                console.log(`  ${terrainName(event.terrain)} 발생! (${event.source})`)
            } else {
                console.log(`  🌐 필드 종료`)
            }
            break

        case 'switch':
            console.log(`  🔄 [${event.player === 'p1' ? 'YOU' : 'CPU'}] ${nickOrId(event.out_id)} → ${nickOrId(event.in_id)}`)
            break

        case 'ability_trigger':
            console.log(`  ✨ [${nickOrId(event.pokemon_id)}] 특성 ${event.ability} 발동! (${event.effect})`)
            break

        case 'item_consume':
            console.log(`  🎒 [${nickOrId(event.pokemon_id)}] ${event.item} 소비!`)
            break

        case 'volatile_apply': {
            const protectNames: Record<string, string> = {
                protect: '🛡️  방어!',
                kings_shield: '👑 킹실드!',
                spiky_shield: '🌵 니들가드!',
                baneful_bunker: '☠️  독방울폭탄!',
                silk_trap: '🕸️  스레드트랩!',
                burning_bulwark: '🔥 화염의수호!',
                obstruct: '🚫 블로킹!',
                endure: '💪 버티기!',
            }
            const vname = protectNames[(event as any).volatile]
            if (vname) console.log(`  ${vname} [${nickOrId((event as any).pokemon_id)}]`)
            break
        }

        case 'battle_end':
            console.log(`\n${'★'.repeat(64)}`)
            console.log(`  🏆 배틀 종료! 승자: ${event.winner === 'p1' ? 'YOU' : 'CPU'}`)
            console.log(`${'★'.repeat(64)}\n`)
            break
    }
}

// ─── 타입 보조 ────────────────────────────────────────────────
type StatKey =
    | 'attack'
    | 'defense'
    | 'special_attack'
    | 'special_defense'
    | 'speed'
    | 'accuracy'
    | 'evasion'

type AnyPokemonLike = {
    id?: string
    nickname?: string
    hp: number
    max_hp: number
    fainted?: boolean
    status?: string | null
    boosts?: Partial<Record<StatKey, number>>
    stat_stages?: Partial<Record<StatKey, number>>
    stats?: Partial<Record<StatKey, number>>
    current_stats?: Partial<Record<StatKey, number>>
    moves?: any[]
}

// ─── 헬퍼 ────────────────────────────────────────────────────
function nickOrId(id: string): string {
    const p = engine?.getPokemon(id)
    return p ? p.nickname : id
}

function statusName(s: string): string {
    const map: Record<string, string> = {
        burn: '화상',
        freeze: '빙결',
        paralysis: '마비',
        poison: '독',
        toxic: '맹독',
        sleep: '수면',
    }
    return map[s] ?? s
}

function statName(s: string): string {
    const map: Record<string, string> = {
        attack: '공격',
        defense: '방어',
        special_attack: '특공',
        special_defense: '특방',
        speed: '스피드',
        accuracy: '명중',
        evasion: '회피',
    }
    return map[s] ?? s
}

function weatherName(w: string): string {
    const map: Record<string, string> = {
        sun: '☀️  쾌청',
        harsh_sun: '🌞 강한햇살',
        rain: '🌧️  비',
        heavy_rain: '⛈️  폭우',
        sandstorm: '🌪️  모래바람',
        snow: '❄️  눈',
        strong_winds: '💨 거센바람',
    }
    return map[w] ?? w
}

function terrainName(t: string): string {
    const map: Record<string, string> = {
        electric: '⚡ 일렉트릭필드',
        grassy: '🌿 그래스필드',
        misty: '🌫️  미스트필드',
        psychic: '🔮 사이코필드',
    }
    return map[t] ?? t
}

// ─── 랭크/실수치 계산 ────────────────────────────────────────
function getStageValue(pokemon: AnyPokemonLike | undefined, stat: string): number {
    if (!pokemon) return 0
    const fromBoosts = (pokemon.boosts as Record<string, number> | undefined)?.[stat]
    if (typeof fromBoosts === 'number') return fromBoosts

    const fromStages = (pokemon.stat_stages as Record<string, number> | undefined)?.[stat]
    if (typeof fromStages === 'number') return fromStages

    return 0
}

function getStageMultiplier(stage: number, stat: string): number {
    if (stat === 'accuracy' || stat === 'evasion') {
        return stage >= 0
            ? (3 + stage) / 3
            : 3 / (3 + Math.abs(stage))
    }

    return stage >= 0
        ? (2 + stage) / 2
        : 2 / (2 + Math.abs(stage))
}

function formatStage(stage: number): string {
    if (stage === 0) return '-'
    return stage > 0 ? `+${stage}` : `${stage}`
}

function getBaseStat(pokemon: AnyPokemonLike, stat: string): number | null {
    const fromStats = (pokemon.stats as Record<string, number> | undefined)?.[stat]
    if (typeof fromStats === 'number') return fromStats

    const fromCurrent = (pokemon.current_stats as Record<string, number> | undefined)?.[stat]
    if (typeof fromCurrent === 'number') return fromCurrent

    return null
}

function getEffectiveStat(pokemon: AnyPokemonLike, stat: string): number | null {
    const directCurrent = (pokemon.current_stats as Record<string, number> | undefined)?.[stat]
    if (typeof directCurrent === 'number') return directCurrent

    const base = getBaseStat(pokemon, stat)
    if (base == null) return null

    const stage = getStageValue(pokemon, stat)
    const mult = getStageMultiplier(stage, stat)

    return Math.floor(base * mult)
}

function getRankSummary(pokemon: AnyPokemonLike): string {
    const entries: Array<[StatKey, string]> = [
        ['attack', 'A'],
        ['defense', 'B'],
        ['special_attack', 'C'],
        ['special_defense', 'D'],
        ['speed', 'S'],
    ]

    return entries
        .map(([key, label]) => `${label}:${formatStage(getStageValue(pokemon, key))}`)
        .join('  ')
}

function getEffectiveStatsSummary(pokemon: AnyPokemonLike): string {
    const values = [
        ['공', getEffectiveStat(pokemon, 'attack')],
        ['방', getEffectiveStat(pokemon, 'defense')],
        ['특공', getEffectiveStat(pokemon, 'special_attack')],
        ['특방', getEffectiveStat(pokemon, 'special_defense')],
        ['스핏', getEffectiveStat(pokemon, 'speed')],
    ]

    return values
        .filter(([, v]) => v != null)
        .map(([label, v]) => `${label} ${v}`)
        .join(' | ')
}

function getHpPercent(hp: number, max: number): string {
    return ((hp / max) * 100).toFixed(1)
}

// ─── HP 바 ────────────────────────────────────────────────────
function makeHpBar(hp: number, max: number, width = 20): string {
    const filled = Math.max(0, Math.round((hp / max) * width))
    const pct = hp / max
    const char = pct > 0.5 ? '█' : pct > 0.25 ? '▓' : '░'
    return `[${char.repeat(filled)}${' '.repeat(width - filled)}]`
}

// ─── 상태 출력 ────────────────────────────────────────────────
function printStatus(): void {
    const state = engine.getState()
    console.log(`\n  ── 현재 상태 ──`)

    for (const [player, side] of Object.entries(state.sides)) {
        const active = side.active[0] as AnyPokemonLike & { nickname: string }
        const pct = getHpPercent(active.hp, active.max_hp)
        const bar = makeHpBar(active.hp, active.max_hp)
        const status = active.status ? ` [${statusName(active.status).toUpperCase()}]` : ''
        const label = player === 'p1' ? 'YOU' : 'CPU'

        const weather = state.field.weather ? ` ${weatherName(state.field.weather)}` : ''
        const terrain = state.field.terrain ? ` ${terrainName(state.field.terrain)}` : ''

        console.log(`  ${label} │ ${active.nickname.padEnd(15)} ${bar} ${active.hp}/${active.max_hp} (${pct}%)${status}`)
        console.log(`      │ 랭크    : ${getRankSummary(active)}`)
        console.log(`      │ 실수치  : ${getEffectiveStatsSummary(active) || '확인 불가'}`)

        if (player === 'p2' && (weather || terrain)) {
            console.log(`      │ 필드    :${weather}${terrain}`)
        }
    }

    console.log()
}

// ─── 기술 목록 출력 ───────────────────────────────────────────
function printMoves(pokemon: BattlePokemon): void {
    console.log(`\n  ── ${pokemon.nickname}의 기술 ──`)
    pokemon.moves.forEach((slot, i) => {
        if (!slot) return
        const usable = !slot.disabled && slot.pp > 0
        const prefix = usable ? `${i + 1} ` : '  '
        const ppStr = `PP ${slot.pp}/${slot.max_pp}`
        const typeStr = slot.move.type.padEnd(10)
        const catStr =
            slot.move.category === 'physical'
                ? '물리'
                : slot.move.category === 'special'
                    ? '특수'
                    : '변화'
        const pwrStr = slot.move.power ? `위력 ${slot.move.power}` : '      '
        const disStr = !usable ? ' [사용불가]' : ''
        console.log(`  ${prefix}│ ${slot.move.name.padEnd(22)} ${typeStr} ${catStr} ${pwrStr.padEnd(8)} ${ppStr}${disStr}`)
    })
    console.log()
}

// ─── 파티 목록 출력 ───────────────────────────────────────────
function printParty(player: 'p1' | 'p2'): void {
    const state = engine.getState()
    const side = state.sides[player]
    console.log(`\n  ── ${player === 'p1' ? '내 파티' : '상대 파티'} ──`)

    side.team.forEach((p: AnyPokemonLike & { id: string; nickname: string }, i: number) => {
        const isActive = side.active[0]?.id === p.id
        const fainted = p.fainted ? ' [기절]' : ''
        const active = isActive ? ' ◀ 출전중' : ''
        const status = p.status ? ` [${statusName(p.status)}]` : ''
        const pct = getHpPercent(p.hp, p.max_hp)
        const bar = makeHpBar(p.hp, p.max_hp, 12)
        const selectable = !p.fainted && !isActive ? `${i + 1}` : ' '

        console.log(`  ${selectable} │ ${p.nickname.padEnd(15)} ${bar} ${p.hp}/${p.max_hp} (${pct}%)${status}${fainted}${active}`)
        console.log(`    │ 랭크    : ${getRankSummary(p)}`)
        console.log(`    │ 실수치  : ${getEffectiveStatsSummary(p) || '확인 불가'}`)
    })

    console.log()
}

// ─── 랜덤 AI ──────────────────────────────────────────────────
function cpuPickAction(): void {
    const state = engine.getState()
    const active = state.sides.p2.active[0]!
    const available = active.moves
        .map((slot, i) => ({ slot, i }))
        .filter(({ slot }) => slot && !slot.disabled && slot.pp > 0)

    const picked = available.length > 0
        ? available[Math.floor(Math.random() * available.length)]!
        : { i: 0 }

    engine.submitAction({
        type: 'move',
        player: 'p2',
        pokemon_id: active.id,
        move_index: picked.i as 0 | 1 | 2 | 3,
    })
}

// ─── 정보 패널 출력 ───────────────────────────────────────────
function printBattleOverview(active: BattlePokemon): void {
    printStatus()
    printParty('p1')
    printParty('p2')
    printMoves(active)
}

// ─── 플레이어 행동 선택 ───────────────────────────────────────
async function playerTurn(): Promise<void> {
    const state = engine.getState()
    const active = state.sides.p1.active[0]!

    printMoves(active)

    while (true) {
        const input = (await ask('  행동 선택 [1-4: 기술 / s: 교체 / i: 정보 / q: 종료]: ')).trim().toLowerCase()

        if (input === 'q') {
            console.log('\n  배틀을 종료합니다.')
            rl.close()
            process.exit(0)
        }

        if (input === 'i') {
            printBattleOverview(active)
            continue
        }

        if (input === 's') {
            printParty('p1')
            const switchInput = (await ask('  교체할 포켓몬 번호 (취소: 0): ')).trim()
            const switchIdx = parseInt(switchInput) - 1

            if (switchIdx < 0) {
                printMoves(active)
                continue
            }

            const side = state.sides.p1
            const target = side.team[switchIdx]

            if (!target) {
                console.log('  잘못된 번호예요.')
                continue
            }
            if (target.fainted) {
                console.log('  기절한 포켓몬은 교체할 수 없어요.')
                continue
            }
            if (target.id === active.id) {
                console.log('  이미 출전 중인 포켓몬이에요.')
                continue
            }

            cpuPickAction()
            engine.submitAction({
                type: 'switch',
                player: 'p1',
                pokemon_id: active.id,
                switch_to_id: target.id,
            })
            printStatus()
            return
        }

        const moveIdx = parseInt(input) - 1
        if (isNaN(moveIdx) || moveIdx < 0 || moveIdx > 3) {
            console.log('  1~4, s, i, q 중에 입력해주세요.')
            continue
        }

        const slot = active.moves[moveIdx]
        if (!slot) {
            console.log('  해당 슬롯에 기술이 없어요.')
            continue
        }
        if (slot.pp <= 0) {
            console.log(`  ${slot.move.name}의 PP가 부족해요.`)
            continue
        }
        if (slot.disabled) {
            console.log(`  ${slot.move.name}은(는) 사용할 수 없어요.`)
            continue
        }

        cpuPickAction()
        engine.submitAction({
            type: 'move',
            player: 'p1',
            pokemon_id: active.id,
            move_index: moveIdx as 0 | 1 | 2 | 3,
        })
        printStatus()
        return
    }
}

// ─── 기절 후 교체 (switching 페이즈) ─────────────────────────
async function handleSwitchingPhase(): Promise<void> {
    for (const player of ['p1', 'p2'] as const) {
        const state = engine.getState()
        if (state.phase !== 'switching') break

        const side = state.sides[player]
        const activeAllFainted = side.active.every((p: AnyPokemonLike) => p.fainted)
        if (!activeAllFainted) continue

        const alive = side.team.filter((p: AnyPokemonLike) => !p.fainted)
        if (alive.length === 0) continue

        if (player === 'p1') {
            console.log(`\n  💀 포켓몬이 기절했어요! 교체할 포켓몬을 선택하세요.`)
            printParty('p1')

            while (true) {
                const input = (await ask('  교체할 포켓몬 번호: ')).trim()
                const idx = parseInt(input) - 1
                const target = side.team[idx]

                if (!target) {
                    console.log('  잘못된 번호예요.')
                    continue
                }
                if (target.fainted) {
                    console.log('  기절한 포켓몬은 선택할 수 없어요.')
                    continue
                }
                if (target.id === side.active[0]?.id) {
                    console.log('  이미 출전 중이에요.')
                    continue
                }

                engine.submitAction({
                    type: 'switch',
                    player: 'p1',
                    pokemon_id: side.active[0]!.id,
                    switch_to_id: target.id,
                })
                break
            }
        } else {
            const next = alive[Math.floor(Math.random() * alive.length)]!
            console.log(`\n  CPU가 ${next.nickname}을(를) 내보냈어요!`)
            engine.submitAction({
                type: 'switch',
                player: 'p2',
                pokemon_id: side.active[0]!.id,
                switch_to_id: next.id,
            })
        }
    }

    printStatus()
}

// ─── 최종 통계 ────────────────────────────────────────────────
function printFinalStats(): void {
    const state = engine.getState()
    const log = state.log
    const damages = log.filter((e: BattleEvent) => e.type === 'damage').length
    const heals = log.filter((e: BattleEvent) => e.type === 'heal').length
    const faints = log.filter((e: BattleEvent) => e.type === 'faint').length
    const statChanges = log.filter((e: BattleEvent) => e.type === 'stat_change').length
    const switches = log.filter((e: BattleEvent) => e.type === 'switch').length

    console.log(`\n  ── 배틀 통계 ──`)
    console.log(`  총 턴 수:      ${state.turn - 1}턴`)
    console.log(`  데미지 발생:   ${damages}회`)
    console.log(`  회복 발생:     ${heals}회`)
    console.log(`  랭크 변화:     ${statChanges}회`)
    console.log(`  교체:          ${switches}회`)
    console.log(`  기절:          ${faints}회`)
}

// ─── 메인 ─────────────────────────────────────────────────────
async function main() {
    console.log('📦 데이터 로딩 중...')
    await preloadData()
    console.log('✅ 데이터 로드 완료!\n')

    const p1Team = loadTeam(p1Json as any)
    const p2Team = loadTeam(p2Json as any)

    engine = new BattleEngine({
        format: 'singles',
        p1: { name: 'Player1', team: p1Team },
        p2: { name: 'Player2', team: p2Team },
    })

    engine.on('*', logEvent)

    console.log('┌' + '─'.repeat(62) + '┐')
    console.log('│' + '  🎮 포켓몬 배틀 시뮬레이터'.padEnd(61) + '│')
    console.log('├' + '─'.repeat(62) + '┤')
    console.log(`│  YOU: ${p1Team.map(p => p.nickname ?? p.species).join(', ')}`.padEnd(63) + '│')
    console.log(`│  CPU: ${p2Team.map(p => p.nickname ?? p.species).join(', ')}`.padEnd(63) + '│')
    console.log('└' + '─'.repeat(62) + '┘')

    printStatus()

    while (engine.getState().phase !== 'ended') {
        const phase = engine.getState().phase

        if (phase === 'switching') {
            await handleSwitchingPhase()
        } else if (phase === 'waiting_action') {
            await playerTurn()
        }
    }

    printFinalStats()
    rl.close()
}

main().catch(console.error)