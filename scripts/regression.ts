// ─── 회귀 전수 점검 ──────────────────────────────────────────
// 모든 기술·특성·아이템을 하나씩 배틀에 넣어 돌리고, 1~9세대 랜덤배틀까지 돌리면서 "엔진이 놓친 것" 을 찾는다.
// 판정(데미지·상성·구속 등)은 Showdown 시뮬레이터가 하므로, 여기서 보는 것은 엔진이 그것을 제대로 전달하는지다.
//
//   protocol     엔진이 처리하지 못한 Showdown 로그 줄
//   generic      전용 문장 없이 범용 문장("{pokemon}: {effect}")으로 나간 로그
//   untranslated 한국어 로그에 영어/슬러그가 섞임
//   silent       문장이 없는(보이지 않는) 이벤트 종류 — 검토용
//   event-id     포켓몬 id 가 비어 있는 이벤트
//   replay       이벤트만으로 다시 만든 상태(HP·상태이상·랭크)가 실제와 다름 → 이벤트에 정보가 빠짐
//   request      엔진이 내준 행동을 Showdown 이 거부 / Showdown 이 받는 행동을 엔진이 안 내줌
//   preview      데미지 미리보기 범위 밖의 실제 데미지
//   crash        예외
//
// 사용: npx tsx scripts/regression.ts [--only moves,abilities,items,random] [--random 150] [--out .scratch/regression]
import { mkdirSync, writeFileSync } from 'node:fs'
import { Dex, toID } from '@pkmn/sim'
import {
    BattleEngine, HeuristicAI, RandomAI, createFormatter, getLocale, createRandomBattle, preloadData,
    moveSlug, abilitySlug, itemSlug,
} from '../src/index'
import type { Action, BattleEvent, Generation, Message, PlayerID, PokemonSet } from '../src/index'
import { PRNG } from '../src/index'
import { randomDoublesChoice } from '../src/utils/random-choice'

const arg = (name: string, def: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1]! : def }
const ONLY = new Set(arg('only', 'moves,abilities,items,random').split(','))
const RANDOM_PER_GEN = Number(arg('random', '150'))
const OUT = arg('out', '.scratch/regression')
/** 한 판만 다시 돌리기: --case random:gen2#12 (로그를 .scratch 에 남긴다) */
const CASE = arg('case', '')

type Kind = 'protocol' | 'generic' | 'untranslated' | 'silent' | 'event-id' | 'replay' | 'request' | 'preview' | 'crash'
interface Finding { kind: Kind; key: string; example: string; where: string; count: number }
const findings = new Map<string, Finding>()
function report(kind: Kind, key: string, example: string, where: string) {
    const id = `${kind}|${key}`
    const f = findings.get(id)
    if (f) { f.count++; return }
    findings.set(id, { kind, key, example, where, count: 1 })
}

// ─── 로그 문장 검사 ───────────────────────────────────────────
const ko = getLocale('ko')!
const en = getLocale('en')!
/** 전용 문장이 없을 때 쓰이는 범용 문장 키 */
const GENERIC = new Set(['activate', 'activate.detail', 'item.activate', 'volatile.start', 'volatile.end',
    'side.start', 'field.start', 'field.end', 'cant.other'])
function resolvedKey(msg: Message): string | null {
    for (const key of Array.isArray(msg.key) ? msg.key : [msg.key]) {
        for (const l of [ko, en]) {
            if (msg.variant && l.messages[`${key}.${msg.variant}`] !== undefined) return `${key}.${msg.variant}`
            if (l.messages[key] !== undefined) return key
        }
    }
    return null
}
/** 이벤트의 "종류" (같은 문제를 한 줄로 묶기 위한 키) */
function eventKind(ev: BattleEvent): string {
    const e = ev as Record<string, unknown>
    const d = e.effect ?? e.volatile ?? e.condition ?? e.item ?? e.reason ?? e.status ?? e.source ?? ''
    return `${ev.type}:${typeof d === 'object' ? JSON.stringify(d) : String(d)}`
}
// 문장으로 보여주지 않는 게 의도인 이벤트 (Showdown 도 문장을 내지 않는다)
const SILENT_OK = new Set(['turn_end', 'damage_preview', 'hp_change', 'stat_set'])
const SILENT_OK_KIND = new Set([
    'volatile_apply:roost', 'volatile_apply:throat-chop', 'volatile_remove:throat-chop', 'volatile_apply:glaive-rush',
    'volatile_remove:glaive-rush', 'volatile_apply:rage', 'volatile_apply:mimic', 'status_apply:reconcile',
    'volatile_remove:roost', 'volatile_remove:mimic', 'volatile_remove:rage',
])
/** 의도된 차이 (보고는 하되 실패로 치지 않음) */
const EXPECTED = [
    // 봉인(Imprison)은 숨은 정보지만 엔진은 실제 상태로 미리 막는다 (README: hidden disables)
    (f: Finding) => f.kind === 'request' && f.where === 'move:imprison',
    // PokeAPI 에 한국어 이름이 없는 아이템·특성 (2세대 전용 아이템, 오거폰 특성)
    (f: Finding) => f.kind === 'untranslated' && /Mint,Berry|Miracle,Berry|Pretty,Feather|Embody,Aspect|Berserk,Gene|Gold,Berry|Bitter,Berry|Burnt,Berry|Ice,Berry|Przcure|Psncure|Mysteryberry/.test(f.key),
]
const ASCII_OK = /^(HP|PP|Z|Lv|vs|Go|ko|en|ja)$/

function attachChecks(engine: BattleEngine, where: string) {
    const fko = createFormatter({ locale: 'ko', getPokemon: id => engine.getPokemon(id) })
    engine.on('*', ev => {
        const msgs = fko.describe(ev)
        if (!msgs) {
            const kind = eventKind(ev)
            const quiet = (ev as { source?: unknown; silent?: boolean }).silent || SILENT_OK_KIND.has(kind) || /^volatile_(apply|remove):fallen\d$/.test(kind) || SILENT_OK_KIND.has(`${ev.type}:${(ev as { source?: string }).source}`)
            if (!SILENT_OK.has(ev.type) && !quiet && ev.type !== 'forme_change') report('silent', eventKind(ev), JSON.stringify(ev).slice(0, 160), where)
            return
        }
        for (const msg of msgs) {
            const key = resolvedKey(msg)
            if (key === null) { report('generic', `no-template:${JSON.stringify(msg.key)}`, JSON.stringify(ev).slice(0, 160), where); continue }
            if (GENERIC.has(key)) report('generic', `${key} ← ${eventKind(ev)}`, fko.render([msg]) ?? '', where)
        }
        const text = fko.render(msgs) ?? ''
        const words = text.match(/[A-Za-z][A-Za-z-]{2,}/g)?.filter(w => !ASCII_OK.test(w))
        if (words?.length) report('untranslated', `${eventKind(ev)} → ${words.join(',')}`, text, where)
        const id = (ev as { pokemon_id?: string }).pokemon_id
        if ('pokemon_id' in ev && ev.type !== 'activate' && !id) report('event-id', ev.type, JSON.stringify(ev).slice(0, 160), where)
    })
}

// ─── 이벤트만으로 상태 재구성 ─────────────────────────────────
const STAT_PS: Record<string, string> = { attack: 'atk', defense: 'def', special_attack: 'spa', special_defense: 'spd', speed: 'spe', accuracy: 'accuracy', evasion: 'evasion' }
const STATUS_PS: Record<string, string> = { burn: 'brn', paralysis: 'par', sleep: 'slp', freeze: 'frz', poison: 'psn', toxic: 'tox' }
function checkReplay(engine: BattleEngine, where: string) {
    const st = engine.getState()
    const team = [...st.sides.p1.team, ...st.sides.p2.team]
    const status = new Map<string, string>()
    const stages = new Map<string, Record<string, number>>()
    const zero = () => ({ atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 })
    for (const p of team) { status.set(p.id, ''); stages.set(p.id, zero()) }
    const lastCause = new Map<string, string>()
    for (const ev of st.log) {
        if (ev.type === 'status_apply') { status.set(ev.pokemon_id, STATUS_PS[ev.status] ?? ev.status); lastCause.set(`s${ev.pokemon_id}`, eventKind(ev)) }
        if (ev.type === 'status_remove') status.set(ev.pokemon_id, '')
        if (ev.type === 'faint') status.set(ev.pokemon_id, '')
        if (ev.type === 'stat_change') {
            const s = stages.get(ev.pokemon_id); const k = STAT_PS[ev.stat]
            if (s && k) s[k] = Math.max(-6, Math.min(6, s[k]! + (ev.actual ?? ev.stages)))
        }
        if (ev.type === 'switch' && ev.out_id && ev.source?.id !== 'baton-pass') stages.set(ev.out_id, zero())
        if (ev.type === 'switch' && ev.out_id && ev.source?.id === 'baton-pass') { stages.set(ev.in_id, { ...stages.get(ev.out_id)! }); stages.set(ev.out_id, zero()) }
        if (ev.type === 'faint') stages.set(ev.pokemon_id, zero())
        if (ev.type === 'stat_set') {
            const s = zero() as Record<string, number>
            for (const [k, v] of Object.entries(ev.stages)) if (STAT_PS[k]) s[STAT_PS[k]!] = v
            stages.set(ev.pokemon_id, s as ReturnType<typeof zero>)
        }
        if (ev.type === 'activate' && ev.pokemon_id) lastCause.set(`b${ev.pokemon_id}`, eventKind(ev))
    }
    for (const p of team) {
        const real = engine.getShowdownPokemon(p.id)!
        const rs = real.fainted ? '' : (real.status as string)
        if (status.get(p.id) !== rs) report('replay', `status ${status.get(p.id) || '-'}→${rs || '-'}`, `${p.id} ${p.species} last=${lastCause.get(`s${p.id}`) ?? ''}`, where)
        if (!real.isActive || real.fainted) continue
        const s = stages.get(p.id)!
        for (const k of Object.keys(s)) {
            const rv = real.boosts[k as keyof typeof real.boosts] ?? 0
            if (s[k] !== rv) { report('replay', `stage ${k} (last activate: ${lastCause.get(`b${p.id}`) ?? '-'})`, `${p.id} ${p.species}: events=${s[k]} real=${rv}`, where); break }
        }
    }
}

// ─── 요청 ↔ Showdown 선택 검사 ────────────────────────────────
function checkRequest(engine: BattleEngine, player: PlayerID, where: string) {
    const req = engine.getRequest(player)
    if (!req) return
    const side = engine.battle[player]
    const tryChoice = (c: string) => { let ok = false; try { ok = side.choose(c) !== false } catch { ok = false } side.clearChoice(); return ok }
    const offered = new Set<string>()
    // 부활의기원: Showdown 은 선택을 취소해도 남은 교체 수를 되돌리지 않는다 → 하나만 시험
    const actions = engine.getAvailableActions(player)
    for (const a of req.type === 'switch' && req.reason === 'revival_blessing' ? actions.slice(0, 1) : actions) {
        if (a.type === 'team') continue
        const c = engine.toChoice(a)
        offered.add(c)
        if (!tryChoice(c)) report('request', `offered-but-rejected ${a.type}`, `${c} (${engine.getActive(player).species})`, where)
    }
    if (req.type === 'switch' && req.reason === 'revival_blessing') return
    // Showdown 이 받는데 엔진이 안 내준 기본 선택 (기술 1~4, 교체)
    const candidates = [...[1, 2, 3, 4].map(i => `move ${i}`), ...side.pokemon.map((_, i) => `switch ${i + 1}`)]
    for (const c of candidates) {
        if (offered.has(c) || [...offered].some(o => o.startsWith(c + ' '))) continue
        if (tryChoice(c)) report('request', `accepted-but-not-offered ${c.split(' ')[0]}`, `${c} (${engine.getActive(player).species}, req=${req.type})`, where)
    }
}

// ─── 데미지 미리보기 검사 ─────────────────────────────────────
function previewFor(engine: BattleEngine, action: Action | null) {
    if (!action || action.type !== 'move') return null
    try { return { player: action.player, index: action.move_index, r: engine.previewDamage(action.player, action.move_index, { terastallize: action.terastallize }) } } catch { return null }
}
function checkPreview(engine: BattleEngine, before: number, previews: ReturnType<typeof previewFor>[], where: string) {
    const log = engine.getState().log.slice(before)
    for (const p of previews) {
        if (!p?.r || p.r.max === 0) continue
        const user = engine.getActive(p.player)
        const useIdx = log.findIndex(e => e.type === 'move_use' && e.pokemon_id.startsWith(p.player))
        if (useIdx < 0) continue
        const use = log[useIdx] as Extract<BattleEvent, { type: 'move_use' }>
        const rest = log.slice(useIdx + 1)
        const end = rest.findIndex(e => e.type === 'move_use')
        const seg = end < 0 ? rest : rest.slice(0, end)
        if (seg.some(e => e.type === 'hit_count' || (e.type === 'damage' && (e.crit || e.source === 'substitute')))) continue
        const hit = seg.find((e): e is Extract<BattleEvent, { type: 'damage' }> => e.type === 'damage' && !e.source && e.pokemon_id === use.target_id)
        if (!hit) continue
        const capped = hit.hp_after === 0 || (hit.hp_after === 1 && hit.amount < p.r.min)
        if (hit.amount > p.r.max || (hit.amount < p.r.min && !capped)) {
            report('preview', use.move.name, `${user.species} ${use.move.name}: real ${hit.amount}, preview ${p.r.min}-${p.r.max}`, where)
        }
    }
}

// ─── 배틀 진행 ────────────────────────────────────────────────
function drive(engine: BattleEngine, where: string, turns: number, choose: (p: PlayerID) => Action | null) {
    attachChecks(engine, where)
    engine.start()
    for (let t = 0; t < turns * 3 && !engine.battle.ended && engine.getState().turn <= turns; t++) {
        const before = engine.getState().log.length
        const previews: ReturnType<typeof previewFor>[] = []
        let acted = false
        for (const p of ['p1', 'p2'] as const) {
            if (engine.battle.ended) break
            const req = engine.getRequest(p)
            if (!req) continue
            checkRequest(engine, p, where)
            const a = choose(p)
            if (!a) continue
            if (req.type === 'move') previews.push(previewFor(engine, a))
            engine.submitAction(a)
            acted = true
        }
        if (previews.length) checkPreview(engine, before, previews, where)
        if (!acted) break
    }
    for (const k of engine.unhandledProtocol.keys()) report('protocol', k, engine.unhandledProtocol.get(k) ?? '', where)
    checkReplay(engine, where)
}

const S = (species: string, moves: string[], x: Partial<PokemonSet> = {}): PokemonSet => ({
    species, level: 100, gender: null, ability: '', nature: 'hardy', moves: moves as PokemonSet['moves'], evs: {}, ivs: {}, ...x,
})
const legal = <T extends { isNonstandard?: string | null; num: number }>(xs: readonly T[]) => xs.filter(x => !x.isNonstandard && x.num > 0)

function safe(where: string, fn: () => void) {
    try { fn() } catch (e) { report('crash', (e as Error).message.split('\n')[0]!.slice(0, 120), (e as Error).stack?.split('\n').slice(0, 3).join(' | ') ?? '', where) }
}

/** 행동 고르기: 정해 둔 기술이 있으면 그것, 아니면 AI */
function scripted(engine: BattleEngine, plan: Partial<Record<PlayerID, number[]>>, seed: number) {
    const ai = new HeuristicAI({ seed, randomness: 0.3 })
    const rnd = new RandomAI(seed)
    let turn = 0
    return (p: PlayerID): Action | null => {
        const req = engine.getRequest(p)!
        if (req.type === 'move' && plan[p]) {
            turn = engine.getState().turn
            const idx = plan[p]![(turn - 1) % plan[p]!.length]!
            const opt = req.moves.find(m => m.index === idx && !m.disabled)
            if (opt) return { type: 'move', player: p, pokemon_id: req.active.id, move_index: opt.index }
        }
        return (seed % 2 ? ai : rnd).chooseAction(engine, p)
    }
}

// ─── 1. 기술 전수 ─────────────────────────────────────────────
function sweepMoves() {
    const moves = legal(Dex.moves.all()).filter(m => !m.isZ && !m.isMax)
    let n = 0
    for (const m of moves) {
        const slug = moveSlug(m.id)
        // 양쪽 모두 그 기술을 쓴다 (내 쪽 / 상대 쪽 문장 모두) + 상황 기술 몇 개
        const team = (lead: string) => [
            S(lead, [slug, 'tackle', 'swords-dance', 'protect'], { evs: { hp: 252, speed: 252 } }),
            S('blissey', ['soft-boiled', 'toxic']), S('ferrothorn', ['spikes', 'leech-seed']),
        ]
        const where = `move:${slug}`
        safe(where, () => {
            const e = new BattleEngine({ format: 'singles', seed: ++n, p1: { name: 'A', team: team('mew') }, p2: { name: 'B', team: team('smeargle') } }, { turnSnapshots: false })
            drive(e, where, 4, scripted(e, { p1: [0, 0, 1, 0], p2: [0, 1, 0, 0] }, n))
        })
    }
    return moves.length
}

/** 9세대에 없는 기술(추격·HP2배 기술 등): 쓸 수 있는 가장 최근 세대에서 */
function sweepPastMoves() {
    let n = 0
    const past = Dex.moves.all().filter(m => m.isNonstandard === 'Past' && !m.isZ && !m.isMax && m.num > 0)
    for (const m of past) {
        const gen = ([8, 7, 6, 5, 4] as Generation[]).find(g => !Dex.forGen(g).moves.get(m.id).isNonstandard)
        if (!gen) continue
        const slug = moveSlug(m.id)
        const team = () => [S('mew', [slug, 'tackle', 'swords-dance', 'protect']), S('chansey', ['soft-boiled']), S('skarmory', ['spikes'])]
        const where = `past-move:${slug}@gen${gen}`
        safe(where, () => {
            const e = new BattleEngine({ format: 'singles', seed: ++n, gen, p1: { name: 'A', team: team() }, p2: { name: 'B', team: team() } }, { turnSnapshots: false })
            drive(e, where, 4, scripted(e, { p1: [0, 0, 1, 0], p2: [0, 1, 0, 0] }, n))
        })
        n++
    }
    return past.length
}

// ─── 2. 특성 전수 ─────────────────────────────────────────────
function sweepAbilities() {
    const abilities = legal(Dex.abilities.all())
    let n = 0
    const foeMoves = ['thunderbolt', 'earthquake', 'will-o-wisp', 'u-turn']
    for (const a of abilities) {
        const slug = abilitySlug(a.id)
        const where = `ability:${slug}`
        safe(where, () => {
            const holder = S('mew', ['tackle', 'flamethrower', 'calm-mind', 'u-turn'], { ability: slug })
            const e = new BattleEngine({
                format: 'singles', seed: ++n,
                p1: { name: 'A', team: [holder, S('blissey', ['soft-boiled', 'toxic']), S('mew', ['ice-beam', 'roost'], { ability: slug })] },
                p2: { name: 'B', team: [S('garchomp', foeMoves), S('slowbro', ['scald', 'thunder-wave']), S('gengar', ['shadow-ball', 'hypnosis'])] },
            }, { turnSnapshots: false })
            drive(e, where, 6, scripted(e, { p1: [0, 1, 2, 3], p2: [0, 1, 2, 3] }, n))
        })
    }
    return abilities.length
}

// ─── 3. 아이템 전수 ───────────────────────────────────────────
function sweepItems() {
    const items = legal(Dex.items.all()).filter(i => !i.isPokeball)
    let n = 0
    for (const it of items) {
        const slug = itemSlug(it.id)
        const where = `item:${slug}`
        // 전용 아이템(메가스톤·Z크리스탈·전용 아이템)은 그 포켓몬에게
        const species = it.megaStone ? Object.values(it.megaStone)[0]!.replace(/-Mega.*$/, '')
            : it.itemUser?.[0] ?? (it.zMoveUser?.[0]) ?? 'mew'
        safe(where, () => {
            const e = new BattleEngine({
                format: 'singles', seed: ++n, gen: it.megaStone || it.zMove ? 7 : 9,
                p1: { name: 'A', team: [S(toID(species) === 'mew' ? 'mew' : species, ['tackle', 'protect', 'swords-dance', 'thunderbolt'], { item: slug }), S('blissey', ['soft-boiled'])] },
                p2: { name: 'B', team: [S('garchomp', ['earthquake', 'flamethrower', 'knock-off', 'trick']), S('slowbro', ['scald', 'thunder-wave'])] },
            }, { turnSnapshots: false })
            drive(e, where, 5, scripted(e, { p1: [0, 1, 2, 3, 0], p2: [0, 1, 2, 3, 2] }, n))
        })
    }
    return items.length
}

// ─── 4. 세대별 랜덤배틀 ───────────────────────────────────────
function sweepRandom() {
    let total = 0
    for (const gen of [1, 2, 3, 4, 5, 6, 7, 8, 9] as Generation[]) {
        for (let i = 0; i < RANDOM_PER_GEN; i++) {
            const where = `random:gen${gen}#${i}`
            if (CASE && CASE !== where) continue
            safe(where, () => {
                const e = createRandomBattle({ gen, seed: gen * 100_000 + i, engine: { turnSnapshots: false } })
                const ai = new HeuristicAI({ seed: i }); const rnd = new RandomAI(i)
                drive(e, where, 300, p => (i % 2 ? ai : rnd).chooseAction(e, p))
                if (CASE) { mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/case.log`, e.battle.log.join('\n')) }
            })
            total++
        }
    }
    return total
}

// ─── 5. 더블 랜덤배틀 (9세대, Showdown 선택 문자열) ──────────────
function sweepDoubles() {
    const n = Math.max(20, Math.round(RANDOM_PER_GEN / 2))
    for (let i = 0; i < n; i++) {
        const where = `doubles:#${i}`
        if (CASE && CASE !== where) continue
        safe(where, () => {
            const e = createRandomBattle({ format: 'doubles', seed: 900_000 + i, engine: { turnSnapshots: false } })
            attachChecks(e, where)
            e.start()
            const rng = new PRNG(i)
            for (let g = 0; g < 3000 && !e.battle.ended; g++) {
                for (const p of ['p1', 'p2'] as const) {
                    if (e.battle.ended) break
                    const req = e.getRawRequest(p) as { wait?: boolean } | null
                    if (!req || req.wait || e.battle[p].isChoiceDone()) continue
                    // 숨은 구속(그림자밟기 등)은 원본 요청에 없다 → Showdown 클라이언트처럼 거부되면 다시 고른다
                    try { e.submitChoice(p, randomDoublesChoice(req, rng)) } catch { e.submitChoice(p, 'default') }
                }
            }
            for (const k of e.unhandledProtocol.keys()) report('protocol', k, e.unhandledProtocol.get(k) ?? '', where)
            checkReplay(e, where)
        })
    }
    return n
}

// ─── 실행 ─────────────────────────────────────────────────────
await preloadData({ gens: [1, 2, 3, 4, 5, 6, 7, 8, 9] })
const counts: Record<string, number> = {}
const t0 = Date.now()
if (ONLY.has('moves')) counts.moves = sweepMoves()
if (ONLY.has('moves')) counts.pastMoves = sweepPastMoves()
if (ONLY.has('abilities')) counts.abilities = sweepAbilities()
if (ONLY.has('items')) counts.items = sweepItems()
if (ONLY.has('random')) counts.random = sweepRandom()
if (ONLY.has('random')) counts.doubles = sweepDoubles()
const all = [...findings.values()].sort((a, b) => a.kind.localeCompare(b.kind) || b.count - a.count)
const byKind: Record<string, number> = {}
for (const f of all) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1
mkdirSync(OUT, { recursive: true })
writeFileSync(`${OUT}/findings.json`, JSON.stringify({ counts, byKind, findings: all }, null, 2))
const md = [`# 회귀 점검`, '', `대상: ${JSON.stringify(counts)} · ${((Date.now() - t0) / 1000).toFixed(0)}s`, '',
    ...Object.entries(byKind).map(([k, v]) => `- ${k}: ${v}종`), '',
    ...Object.keys(byKind).flatMap(kind => [`## ${kind}`, '', '| 키 | 횟수 | 예 | 위치 |', '|---|---|---|---|',
        ...all.filter(f => f.kind === kind).map(f => `| ${f.key.replace(/\|/g, '/')} | ${f.count} | ${f.example.replace(/\|/g, '/').slice(0, 140)} | ${f.where} |`), ''])]
writeFileSync(`${OUT}/findings.md`, md.join('\n'))
const unexpected = all.filter(f => !EXPECTED.some(x => x(f)))
console.log(JSON.stringify({ counts, byKind, unexpected: unexpected.length, seconds: Math.round((Date.now() - t0) / 1000) }))
for (const f of unexpected.slice(0, 40)) console.log(`  ${f.kind} | ${f.key} | ${f.count} | ${f.example.slice(0, 120)} | ${f.where}`)
if (unexpected.length && process.argv.includes('--strict')) process.exit(1)
