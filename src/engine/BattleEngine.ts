// ─── 배틀 엔진 (Pokémon Showdown 시뮬레이터 래퍼) ───────────────
// 실제 배틀 처리는 Showdown 의 Battle(@pkmn/sim)이 담당하고, 이 클래스는
//  - PokeAPI 슬러그 기반 팀/행동 ↔ Showdown 선택 문자열 변환
//  - Showdown 프로토콜 로그 → 타입이 있는 BattleEvent 변환 (로그가 쓰이는 즉시)
//  - 화면용 상태(BattleState/BattlePokemon) 조회
// 를 담당한다.
import { Battle, Dex, TeamValidator, toID } from '@pkmn/sim'
import type { Pokemon as PSPokemon, Side as PSSide } from '@pkmn/sim'
import type {
    Action, BattleConfig, BattleEvent, BattleEventType, BattleFormat, BattleRequest, BattleRuleOptions, BattleState,
    CantMoveReason, MoveOption, PlayerID, RotateDirection, RotateOption, Side, SwitchReason, TeamPreviewRequest,
} from '../types/battle'
import type { BattlePokemon, PokemonSet, StatStages } from '../types/pokemon'
import type { FieldCondition, PrimaryStatus, SideCondition, Terrain, Weather } from '../types/effect'
import type { MoveData, MoveSlot } from '../types/move'
import { toShowdownSet } from '../showdown/sets'
import { getMove, speciesSlug, abilitySlug, itemSlug, moveSlug, STAT_FROM_PS } from '../data/dex'
import { speciesToShowdown, toSlug } from '../showdown/ids'
import { PRNG } from '../utils/rng'
import { calculateDamage, type CalcPokemonInput, type DamageResult } from '../calc/damage'
import { enableFastPath } from './fastpath'
import { FOE_FRONT_LOC, FRONT, frontLocked, installRotationPatches } from './rotation'

type AnyEventListener = (event: BattleEvent) => void

export interface EngineOptions {
    /** turn_end 이벤트에 상태 스냅샷 포함 (기본 true). 대량 시뮬레이션은 false 권장 */
    turnSnapshots?: boolean
    /**
     * Showdown 핫패스 패치 사용 (기본 true). 결과(프로토콜 로그)는 원본과 같고 더 빠르다.
     * false 면 Showdown 원본 경로 그대로 — 동작이 의심될 때 대조용 (src/engine/fastpath.ts)
     */
    fast?: boolean
}

export class BattleError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'BattleError'
    }
}

// ─── Showdown ↔ 엔진 코드 매핑 ─────────────────────────────────
export const STATUS_FROM_PS: Record<string, PrimaryStatus> = {
    brn: 'burn', par: 'paralysis', slp: 'sleep', frz: 'freeze', psn: 'poison', tox: 'toxic',
}
export const WEATHER_FROM_PS: Record<string, Weather> = {
    sunnyday: 'sun', desolateland: 'harsh_sun', raindance: 'rain', primordialsea: 'heavy_rain',
    sandstorm: 'sandstorm', snow: 'snow', snowscape: 'snow', hail: 'snow', deltastream: 'strong_winds',
}
export const TERRAIN_FROM_PS: Record<string, Terrain> = {
    electricterrain: 'electric', grassyterrain: 'grassy', mistyterrain: 'misty', psychicterrain: 'psychic',
}
const FIELD_FROM_PS: Record<string, FieldCondition> = {
    trickroom: 'trick_room', gravity: 'gravity', magicroom: 'magic_room', wonderroom: 'wonder_room',
    mudsport: 'mud_sport', watersport: 'water_sport',
}
export const SIDE_FROM_PS: Record<string, SideCondition> = {
    reflect: 'reflect', lightscreen: 'light_screen', auroraveil: 'aurora_veil', spikes: 'spikes',
    toxicspikes: 'toxic_spikes', stealthrock: 'stealth_rock', stickyweb: 'sticky_web', tailwind: 'tailwind',
    luckychant: 'lucky_chant', safeguard: 'safeguard', mist: 'mist',
}
const VOLATILE_FROM_PS: Record<string, string> = {
    confusion: 'confusion', flinch: 'flinch', leechseed: 'seeded', partiallytrapped: 'bound', attract: 'infatuation',
    curse: 'curse', nightmare: 'nightmare', aquaring: 'aqua_ring', ingrain: 'ingrain', magnetrise: 'magnet_rise',
    taunt: 'taunt', encore: 'encore', torment: 'torment', disable: 'disable', healblock: 'heal_block',
    embargo: 'embargo', yawn: 'yawn', protect: 'protect', kingsshield: 'kings_shield', spikyshield: 'spiky_shield',
    banefulbunker: 'baneful_bunker', silktrap: 'silk_trap', burningbulwark: 'burning_bulwark', obstruct: 'obstruct',
    endure: 'endure', focusenergy: 'focus_energy', dragoncheer: 'focus_energy', mustrecharge: 'recharging',
    substitute: 'substitute', protosynthesis: 'paradox_boost', quarkdrive: 'paradox_boost', slowstart: 'slow_start',
    unburden: 'unburden', flashfire: 'flash_fire', roost: 'roost', saltcure: 'salt_cure', destinybond: 'destiny_bond',
    stockpile: 'stockpile', charge: 'charge', minimize: 'minimize', defensecurl: 'defense_curl', telekinesis: 'telekinesis',
}
const CANT_FROM_PS: Record<string, CantMoveReason> = {
    par: 'paralysis', slp: 'sleep', frz: 'freeze', flinch: 'flinch', recharge: 'recharge', mustrecharge: 'recharge',
    taunt: 'taunt', nopp: 'no_pp', attract: 'infatuation', truant: 'truant',
}
const PROTECT_EFFECTS = new Set([
    'protect', 'kingsshield', 'spikyshield', 'banefulbunker', 'silktrap', 'burningbulwark', 'obstruct',
    'maxguard', 'detect', 'matblock', 'quickguard', 'wideguard', 'craftyshield',
])
/** 처리할 필요 없는 프로토콜 메시지 */
const IGNORED = new Set([
    't:', 'gametype', 'player', 'gen', 'tier', 'rule', 'start', 'upkeep', '', 'teamsize', 'clearpoke', 'poke',
    'teampreview', 'j', 'l', 'title', 'inactive', 'inactiveoff', 'debug', 'error', 'bigerror', 'request', 'sentchoice',
    'done', 'html', 'uhtml', 'raw', 'seed', 'variation', 'timestamp', 'chat', 'c', 'updatepoke', 'chatmsg',
    'chatmsg-raw', '-mustrecharge', '-anim', '-hint', '-center', '-combine', '-waiting', '-zpower', '-zbroken',
    '-primal', '-burst', '-mega', '-candynamax', '-clearpoke', 'askreg', 'uhtmlchange', 'bigerror',
])

const SIDES: PlayerID[] = ['p1', 'p2']

/** 형식별 한쪽 필드 슬롯 수 */
export const ACTIVE_PER_SIDE: Record<BattleFormat, number> = { singles: 1, doubles: 2, triples: 3, rotation: 3 }

/** rotation: 방향 → 돌아 들어오는 뒷줄 슬롯 */
const ROTATE_SLOT: Record<RotateDirection, number> = { left: 0, right: 2 }

// 형식별 Showdown 기본 포맷과, 그 포맷의 기본 규칙 중 걷어낼 것.
// triples 는 Gen 9 에 커스텀 게임이 없어 래더 포맷(gen9triples)에서 래더 규칙·밴리스트를 걷어낸다.
// rotation 은 Showdown 에 구현이 없어 triples 배틀에 로테이션 규칙을 패치해서 돌린다 (./rotation.ts).
const FORMAT_BASE: Record<BattleFormat, { battle: string; strip: string[]; preview: boolean; validator: string }> = {
    singles: { battle: 'gen9customgame', strip: [], preview: true, validator: 'gen9customgame' },
    doubles: { battle: 'gen9doublescustomgame', strip: [], preview: true, validator: 'gen9doublescustomgame' },
    triples: { battle: 'gen9triples', strip: ['!Standard Doubles', '!Evasion Abilities Clause', 'Cancel Mod'], preview: false, validator: 'gen9doublescustomgame' },
    rotation: { battle: 'gen9triples', strip: ['!Standard Doubles', '!Evasion Abilities Clause', 'Cancel Mod'], preview: false, validator: 'gen9doublescustomgame' },
}

/** BattleRuleOptions → Showdown 규칙 목록. 팀 단위 규칙은 validate 쪽으로 분리 */
export function optionsToRules(options: BattleRuleOptions = {}): { battle: string[]; validate: string[] } {
    const battle: string[] = []
    const validate: string[] = []
    const flag = (on: boolean | undefined, rule: string, list: string[]) => {
        if (on === true) list.push(rule)
    }
    if (options.pickedTeamSize !== undefined) {
        if (!Number.isInteger(options.pickedTeamSize) || options.pickedTeamSize < 1) throw new BattleError('pickedTeamSize 는 1 이상의 정수여야 합니다')
        battle.push(`Picked Team Size = ${options.pickedTeamSize}`)
    }
    for (const [key, rule] of [['level', 'Adjust Level'], ['minLevel', 'Min Level'], ['maxLevel', 'Max Level']] as const) {
        const v = options[key]
        if (v === undefined) continue
        if (!Number.isInteger(v) || v < 1 || v > 9999) throw new BattleError(`${key} 는 1~9999 정수여야 합니다`)
        if (key !== 'level') validate.push(`${rule} = ${v}`)
    }
    if (options.terastal === false) battle.push('Terastal Clause')
    flag(options.sleepClause, 'Sleep Clause Mod', battle)
    flag(options.endlessBattleClause, 'Endless Battle Clause', battle)
    flag(options.speciesClause, 'Species Clause', validate)
    flag(options.itemClause, 'Item Clause = 1', validate)
    flag(options.ohkoClause, 'OHKO Clause', validate)
    flag(options.evasionClause, 'Evasion Clause', validate)
    return { battle, validate }
}

/** config → 배틀용 / 팀 검사용 Showdown 포맷 ID */
function buildFormatId(config: BattleConfig): { formatid: string; validatorid: string | null } {
    const base = FORMAT_BASE[config.format]
    if (!base) throw new BattleError(`알 수 없는 형식: ${config.format}`)
    const opts = config.options ?? {}
    const { battle, validate } = optionsToRules(opts)
    const preview = !!(opts.teamPreview || opts.pickedTeamSize)
    const previewRule = preview === base.preview ? [] : [preview ? 'Team Preview' : '!Team Preview']
    const rules = [...base.strip, ...previewRule, ...battle, ...validate, ...(config.rules ?? [])]
    const root = config.formatid ?? base.battle
    const formatid = rules.length ? `${root}@@@${rules.join(',')}` : root
    if (!Dex.formats.get(formatid).exists) throw new BattleError(`알 수 없는 포맷: ${root}`)
    const validatorid = validate.length ? `${base.validator}@@@!Team Preview,${validate.join(',')}` : null
    return { formatid, validatorid }
}

/** 숫자 시드 → Showdown PRNG 시드 */
function toPSSeed(seed: number): [number, number, number, number] {
    const r = new PRNG(seed)
    return [r.int(0x10000), r.int(0x10000), r.int(0x10000), r.int(0x10000)]
}

/** "[from] item: Life Orb" → 'life-orb' 같은 슬러그 */
function effectSlug(effect: string): string {
    const e = effect.replace(/^\[from\]\s*/, '').trim()
    const m = e.match(/^(item|ability|move):\s*(.+)$/)
    if (m) {
        const name = m[2]!
        if (m[1] === 'item') return itemSlug(name)
        if (m[1] === 'ability') return abilitySlug(name)
        return moveSlug(name)
    }
    const id = toID(e)
    if (STATUS_FROM_PS[id]) return STATUS_FROM_PS[id]!
    if (WEATHER_FROM_PS[id]) return WEATHER_FROM_PS[id]!
    return toSlug(e)
}

const stripPrefix = (s: string | undefined) => (s ?? '').replace(/^(move|ability|item):\s*/, '')

export class BattleEngine {
    readonly battle: Battle
    readonly seed: number
    readonly maxTurns: number
    /** 로테이션 배틀 여부 (앞 = 슬롯 1) */
    readonly rotation: boolean
    private config: BattleConfig
    private listeners: Map<string, AnyEventListener[]> = new Map()
    private started = false
    private ready = false
    private events: BattleEvent[] = []
    private ids = new WeakMap<PSPokemon, string>()
    private byId = new Map<string, PSPokemon>()
    private sets = new Map<string, PokemonSet>()

    // 프로토콜 파서 상태
    private splitState = 0              // 1: 다음 줄이 비밀(정확한 HP), 2: 그 다음 공개 줄은 건너뜀
    private lastHp = new Map<string, number>()
    private lastStatus = new Map<string, string>()
    private replaying = false
    private lastActive: Record<PlayerID, string[]> = { p1: [], p2: [] }
    private pendingHit = new Map<string, { crit?: boolean; eff?: number }>()
    private lastMove: { user: string; move: MoveData } | null = null
    private unknownLines = new Map<string, number>()
    /** rotation: 여러 슬롯을 한꺼번에 채워야 하는 교체 요청에서 지금까지 고른 슬롯 → 포켓몬 */
    private switchPicks: Partial<Record<PlayerID, { req: unknown; picks: Map<number, string> }>> = {}

    readonly options: EngineOptions
    /** 팀 단위 규칙 검사용 포맷 (검사할 규칙이 없으면 null) */
    private validatorFormat: string | null = null

    constructor(config: BattleConfig, options: EngineOptions = {}) {
        this.config = config
        this.options = options
        this.seed = config.seed ?? Math.floor(Math.random() * 0x7fffffff)
        this.maxTurns = config.maxTurns ?? 1000
        this.rotation = config.format === 'rotation'
        if (this.rotation) installRotationPatches()
        if (!config.p1?.team?.length || !config.p2?.team?.length) {
            throw new BattleError('양쪽 팀에 최소 1마리의 포켓몬이 필요합니다')
        }
        const minActive = ACTIVE_PER_SIDE[config.format] ?? 1
        if (minActive > 1 && (config.p1.team.length < minActive || config.p2.team.length < minActive)) {
            throw new BattleError(`${config.format} 배틀은 양쪽 팀에 최소 ${minActive}마리가 필요합니다`)
        }
        const { formatid, validatorid } = buildFormatId(config)
        this.validatorFormat = validatorid
        try {
            this.battle = new Battle({ formatid: formatid as never, seed: toPSSeed(this.seed) as never })
        } catch (err) {
            throw new BattleError(`포맷/규칙 오류: ${(err as Error).message}`)
        }
        if (this.rotation) (this.battle as unknown as { rotation: boolean }).rotation = true
        if (options.fast !== false) enableFastPath(this.battle)
        // 로그가 쓰이는 즉시 이벤트로 변환 (상태가 그 시점과 정확히 일치)
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this
        // 생성자에서 이미 쓰인 줄(|gametype| 등)은 그대로 유지
        const log: string[] = [...(this.battle as unknown as { log: string[] }).log]
        log.push = function (...lines: string[]) {
            const n = Array.prototype.push.apply(this, lines)
            if (self.ready) for (const line of lines) self.parseLine(line)
            return n
        }
        ;(this.battle as unknown as { log: string[] }).log = log
    }

    /** 하위 호환 (데이터가 이미 동기 로드됨) */
    static async create(config: BattleConfig): Promise<BattleEngine> {
        return new BattleEngine(config)
    }

    // ─── 시작 ──────────────────────────────────────────────────
    /** 팀 등록 + 선두 등장. getRequest/submitAction 시 자동 호출된다 */
    start(): void {
        if (this.started) return
        this.started = true
        const level = this.config.options?.level
        const teams = SIDES.map(player => {
            const team = this.config[player].team.slice(0, 6).map(set => (level ? { ...set, level } : set))
            const ps = team.map(set => {
                try {
                    return toShowdownSet(set)
                } catch (err) {
                    throw new BattleError(`${player}: ${(err as Error).message}`)
                }
            })
            if (this.validatorFormat) {
                // 검사기가 세트를 고칠 수 있으므로 복사본으로 검사
                const problems = TeamValidator.get(this.validatorFormat).validateTeam(structuredClone(ps) as never)
                if (problems?.length) throw new BattleError(`${player}: ${problems.join(' ')}`)
            }
            return { player, team, ps }
        })
        this.emit({ type: 'battle_start', p1: this.config.p1.name, p2: this.config.p2.name, seed: this.seed })
        for (const { player, team, ps } of teams) {
            this.battle.setPlayer(player, { name: this.config[player].name, team: ps })
            this.battle[player].pokemon.forEach((p, i) => {
                const id = `${player}_${i}`
                this.ids.set(p, id)
                this.byId.set(id, p)
                this.sets.set(id, team[i]!)
            })
        }
        // 이벤트 기준선 = start() 직후 상태 (두 번째 setPlayer 에서 등장 특성까지 이미 처리됨)
        for (const player of SIDES) for (const p of this.battle[player].pokemon) {
            this.lastHp.set(this.idOf(p), p.hp)
            this.lastStatus.set(this.idOf(p), p.status)
        }
        // 두 번째 setPlayer 에서 배틀이 시작되며 쓰인 로그를 ID 연결 후 처리
        this.ready = true
        this.replaying = true
        for (const line of [...this.battle.log]) this.parseLine(line)
        this.replaying = false
    }

    // ─── 이벤트 ────────────────────────────────────────────────
    on(eventType: BattleEventType | '*', listener: AnyEventListener): () => void {
        if (!this.listeners.has(eventType)) this.listeners.set(eventType, [])
        this.listeners.get(eventType)!.push(listener)
        return () => this.off(eventType, listener)
    }

    off(eventType: BattleEventType | '*', listener: AnyEventListener): void {
        const list = this.listeners.get(eventType)
        if (!list) return
        const idx = list.indexOf(listener)
        if (idx !== -1) list.splice(idx, 1)
    }

    private emit(event: BattleEvent): void {
        this.events.push(event)
        for (const fn of this.listeners.get(event.type) ?? []) fn(event)
        for (const fn of this.listeners.get('*') ?? []) fn(event)
    }

    /** Showdown 원본 프로토콜 로그 */
    get protocolLog(): readonly string[] {
        return this.battle.log
    }

    /** 처리하지 못한 프로토콜 메시지 종류 (테스트에서 0 이어야 함) */
    get unhandledProtocol(): ReadonlyMap<string, number> {
        return this.unknownLines
    }

    // ─── 프로토콜 → 이벤트 ─────────────────────────────────────
    private resolve(ref: string | undefined): PSPokemon | undefined {
        if (!ref) return undefined
        const m = ref.match(/^(p[1-4])([a-c])?:\s*(.*)$/)
        if (!m) return undefined
        const side = this.battle[m[1] as PlayerID]
        if (!side) return undefined
        if (m[2]) {
            const p = side.active[m[2].charCodeAt(0) - 97]
            if (p) return p
        }
        const name = m[3]!.trim()
        return side.pokemon.find(p => p.name === name)
    }

    private idOf(p: PSPokemon | undefined): string {
        return p ? this.ids.get(p) ?? '' : ''
    }

    /**
     * 로그 없이 바뀐 HP/상태 보정 (재생력·자연회복은 Showdown 이 교체 시 조용히 처리한다).
     * 이벤트만으로 상태를 재구성하는 클라이언트가 어긋나지 않도록 보정 이벤트를 낸다.
     */
    private reconcile(p: PSPokemon, reason: string): void {
        const id = this.idOf(p)
        if (!id || this.replaying) return
        const prev = this.lastHp.get(id)
        const now = Math.max(0, p.hp)
        if (prev !== undefined && prev !== now && !p.fainted) {
            this.lastHp.set(id, now)
            const source = now > prev && toID(p.ability) === 'regenerator' ? 'regenerator' : reason
            if (now > prev) this.emit({ type: 'heal', pokemon_id: id, amount: now - prev, source, hp_after: now })
            else this.emit({ type: 'damage', pokemon_id: id, amount: prev - now, source, hp_after: now })
        }
        const prevStatus = this.lastStatus.get(id) ?? ''
        if (prevStatus !== p.status) {
            this.lastStatus.set(id, p.status)
            if (prevStatus && !p.status && !p.fainted) this.emit({ type: 'status_remove', pokemon_id: id, status: STATUS_FROM_PS[prevStatus] ?? prevStatus })
            else if (p.status && !prevStatus) this.emit({ type: 'status_apply', pokemon_id: id, status: STATUS_FROM_PS[p.status] ?? p.status, source: reason })
        }
    }

    private reconcileAll(reason: string): void {
        for (const player of SIDES) for (const p of this.battle[player].pokemon) this.reconcile(p, reason)
    }

    private parseLine(line: string): void {
        if (!line.startsWith('|')) {
            if (this.splitState === 2) this.splitState = 0 // addSplit 의 빈 공개 줄
            return
        }
        const parts = line.slice(1).split('|')
        const cmd = parts[0]!
        if (cmd === 'split') { this.splitState = 1; return }
        if (this.splitState === 1) {
            this.splitState = 2
        } else if (this.splitState === 2) {
            this.splitState = 0
            return // 공개용 줄 (비밀 줄과 같은 내용, HP 만 % 단위)
        }
        const args = parts.slice(1)
        const kw = args.filter(a => a.startsWith('['))
        const from = kw.find(a => a.startsWith('[from]'))
        const pos = args.filter(a => !a.startsWith('['))
        if (IGNORED.has(cmd)) return

        switch (cmd) {
            case 'turn': {
                this.reconcileAll('sync')
                const turn = Number(pos[0])
                if (turn > 1) {
                    // 대량 시뮬레이션에서는 스냅샷 생략 가능 (options.turnSnapshots = false)
                    this.emit({ type: 'turn_end', turn, state: this.options.turnSnapshots === false ? (null as unknown as BattleState) : this.snapshot() })
                }
                this.emit({ type: 'turn_start', turn })
                if (turn > this.maxTurns && !this.battle.ended) this.battle.tie()
                return
            }
            case 'switch':
            case 'drag':
            case 'replace': {
                const p = this.resolve(pos[0])
                const player = pos[0]!.slice(0, 2) as PlayerID
                const slot = Math.max(0, (pos[0]!.charCodeAt(2) || 97) - 97)
                const inId = this.idOf(p)
                const out = this.lastActive[player][slot] ?? ''
                const outPoke = out ? this.byId.get(out) : undefined
                if (outPoke && outPoke !== p) this.reconcile(outPoke, 'switch-out')
                if (p) this.reconcile(p, 'switch-in')
                this.lastActive[player][slot] = inId
                this.emit({ type: 'switch', player, out_id: out === inId ? '' : out, in_id: inId, forced: cmd === 'drag' || undefined })
                return
            }
            case 'move': {
                const user = this.resolve(pos[0])
                const move = getMove(toID(pos[1] ?? '')) ?? ({
                    id: 0, name: toSlug(pos[1] ?? ''), type: 'typeless', category: 'status', power: null, accuracy: null,
                    pp: 1, priority: 0, target: 'selected-pokemon', effect_chance: null, effect: '', meta: null, stat_changes: [],
                } as MoveData)
                this.lastMove = { user: this.idOf(user), move }
                this.emit({ type: 'move_use', pokemon_id: this.idOf(user), move, target_id: this.idOf(this.resolve(pos[2])) })
                return
            }
            case 'cant': {
                const reasonRaw = stripPrefix(pos[1])
                const reason = CANT_FROM_PS[toID(reasonRaw)] ?? 'other'
                this.emit({ type: 'cant_move', pokemon_id: this.idOf(this.resolve(pos[0])), reason, detail: reason === 'other' ? toSlug(reasonRaw) : undefined })
                return
            }
            case '-crit':
            case '-supereffective':
            case '-resisted': {
                const id = this.idOf(this.resolve(pos[0]))
                const cur = this.pendingHit.get(id) ?? {}
                if (cmd === '-crit') cur.crit = true
                else cur.eff = cmd === '-supereffective' ? 2 : 0.5
                this.pendingHit.set(id, cur)
                return
            }
            case '-damage':
            case '-heal':
            case '-sethp': {
                const p = this.resolve(pos[0])
                if (!p) return
                const id = this.idOf(p)
                const prev = this.lastHp.get(id) ?? p.maxhp
                const now = Math.max(0, p.hp)
                this.lastHp.set(id, now)
                const source = from ? effectSlug(from) : cmd === '-sethp' ? 'pain-split' : (this.lastMove?.move.name ?? 'move')
                if (now < prev) {
                    const hit = !from ? this.pendingHit.get(id) : undefined
                    this.pendingHit.delete(id)
                    this.emit({
                        type: 'damage', pokemon_id: id, amount: prev - now, source, hp_after: now,
                        effectiveness: !from && cmd === '-damage' ? (hit?.eff ?? 1) : undefined,
                        crit: hit?.crit || undefined,
                    })
                } else if (now > prev) {
                    this.emit({ type: 'heal', pokemon_id: id, amount: now - prev, source, hp_after: now })
                }
                return
            }
            case 'faint': {
                const p = this.resolve(pos[0])
                if (p) {
                    this.lastHp.set(this.idOf(p), 0)
                    this.lastStatus.set(this.idOf(p), p.status)
                }
                this.emit({ type: 'faint', pokemon_id: this.idOf(p) })
                return
            }
            case '-status': {
                const sp = this.resolve(pos[0])
                if (sp) this.lastStatus.set(this.idOf(sp), sp.status)
                this.emit({ type: 'status_apply', pokemon_id: this.idOf(sp), status: STATUS_FROM_PS[pos[1] ?? ''] ?? pos[1] ?? '', source: from ? effectSlug(from) : this.lastMove?.move.name })
                return
            }
            case '-curestatus': {
                const sp = this.resolve(pos[0])
                if (sp) this.lastStatus.set(this.idOf(sp), sp.status)
                this.emit({ type: 'status_remove', pokemon_id: this.idOf(sp), status: STATUS_FROM_PS[pos[1] ?? ''] ?? pos[1] ?? '' })
                return
            }
            case '-cureteam':
                this.emit({ type: 'activate', pokemon_id: this.idOf(this.resolve(pos[0])) || undefined, effect: 'cure-team' })
                return
            case '-boost':
            case '-unboost': {
                const n = Number(pos[2] ?? 0) * (cmd === '-unboost' ? -1 : 1)
                this.emit({ type: 'stat_change', pokemon_id: this.idOf(this.resolve(pos[0])), stat: STAT_FROM_PS[pos[1] ?? ''] ?? pos[1] ?? '', stages: n, actual: n })
                return
            }
            case '-setboost': case '-clearboost': case '-clearallboost': case '-clearpositiveboost':
            case '-clearnegativeboost': case '-invertboost': case '-swapboost': case '-copyboost':
                this.emit({ type: 'activate', pokemon_id: this.idOf(this.resolve(pos[0])) || undefined, effect: cmd.slice(1) })
                return
            case '-weather': {
                if (kw.includes('[upkeep]')) return
                const w = WEATHER_FROM_PS[toID(pos[0] ?? '')] ?? null
                this.emit({ type: 'weather_change', weather: w, source: from ? effectSlug(from) : (w ? this.lastMove?.move.name ?? 'move' : 'end') })
                return
            }
            case '-fieldstart':
            case '-fieldend': {
                const id = toID(stripPrefix(pos[0]))
                if (TERRAIN_FROM_PS[id]) {
                    this.emit({ type: 'terrain_change', terrain: cmd === '-fieldstart' ? TERRAIN_FROM_PS[id]! : null, source: from ? effectSlug(from) : cmd === '-fieldstart' ? toSlug(stripPrefix(pos[0])) : 'end' })
                } else if (FIELD_FROM_PS[id]) {
                    this.emit({ type: cmd === '-fieldstart' ? 'field_start' : 'field_end', condition: FIELD_FROM_PS[id]! })
                } else {
                    this.emit({ type: 'activate', effect: toSlug(stripPrefix(pos[0])) })
                }
                return
            }
            case '-fieldactivate':
                this.emit({ type: 'activate', effect: toSlug(stripPrefix(pos[0])) })
                return
            case '-sidestart':
            case '-sideend': {
                const player = (pos[0] ?? '').slice(0, 2) as PlayerID
                const id = toID(stripPrefix(pos[1]))
                const cond = SIDE_FROM_PS[id]
                if (!cond) { this.emit({ type: 'activate', effect: toSlug(stripPrefix(pos[1])) }); return }
                if (cmd === '-sidestart') {
                    const layers = (this.battle[player]?.sideConditions[id] as { layers?: number } | undefined)?.layers
                    this.emit({ type: 'side_start', player, condition: cond, layers })
                } else {
                    this.emit({ type: 'side_end', player, condition: cond })
                }
                return
            }
            case 'swap': {
                // 위치 교환: doubles/triples 의 사이드체인지, rotation 의 회전.
                // 로그는 자리를 바꾸기 직전에 쓰이므로 슬롯은 줄에서 읽는다 (a/b/c = 원래 자리, 숫자 = 새 자리)
                const p = this.resolve(pos[0])
                const player = (pos[0] ?? '').slice(0, 2) as PlayerID
                const from = Math.max(0, (pos[0]!.charCodeAt(2) || 97) - 97)
                const to = Number(pos[1] ?? 0)
                const ids = this.lastActive[player]
                const inId = this.idOf(p)
                const outId = ids[to] ?? ''
                ids[from] = outId
                ids[to] = inId
                if (from === to) return
                if (this.rotation) {
                    this.emit({ type: 'rotate', player, direction: from === ROTATE_SLOT.left ? 'left' : 'right', in_id: inId, out_id: outId })
                } else {
                    this.emit({ type: 'activate', pokemon_id: inId, effect: 'ally-switch' })
                }
                return
            }
            case '-swapsideconditions':
                this.emit({ type: 'activate', effect: 'court-change' })
                return
            case '-start':
            case '-end': {
                const p = this.resolve(pos[0])
                const effRaw = stripPrefix(pos[1])
                const effId = toID(effRaw)
                if (effId === 'typechange' || effId === 'typeadd') {
                    this.emit({ type: 'activate', pokemon_id: this.idOf(p), effect: 'typechange', detail: pos[2] })
                    return
                }
                const key = VOLATILE_FROM_PS[effId]
                    ?? (effId.startsWith('protosynthesis') || effId.startsWith('quarkdrive') ? 'paradox_boost'
                        : effId.startsWith('stockpile') ? 'stockpile' : effId.startsWith('perish') ? 'perish_song' : toSlug(effRaw))
                this.emit({ type: cmd === '-start' ? 'volatile_apply' : 'volatile_remove', pokemon_id: this.idOf(p), volatile: key })
                return
            }
            case '-singleturn':
            case '-singlemove': {
                const effId = toID(stripPrefix(pos[1]))
                this.emit({ type: 'volatile_apply', pokemon_id: this.idOf(this.resolve(pos[0])), volatile: VOLATILE_FROM_PS[effId] ?? toSlug(stripPrefix(pos[1])) })
                return
            }
            case '-activate': {
                const p = this.resolve(pos[0])
                const effRaw = stripPrefix(pos[1])
                const effId = toID(effRaw)
                if (PROTECT_EFFECTS.has(effId) && this.lastMove) {
                    this.emit({ type: 'move_fail', pokemon_id: this.lastMove.user, move: this.lastMove.move, reason: 'protect' })
                    return
                }
                if (effId === 'substitute' && kw.includes('[damage]')) {
                    this.emit({ type: 'damage', pokemon_id: this.idOf(p), amount: 0, source: 'substitute' })
                    return
                }
                this.emit({ type: 'activate', pokemon_id: this.idOf(p) || undefined, effect: toSlug(effRaw), detail: pos[2] ? toSlug(stripPrefix(pos[2])) : undefined })
                return
            }
            case '-ability':
                this.emit({ type: 'ability_trigger', pokemon_id: this.idOf(this.resolve(pos[0])), ability: abilitySlug(pos[1] ?? ''), effect: from ? effectSlug(from) : (pos[2] ?? '') })
                return
            case '-endability':
                this.emit({ type: 'activate', pokemon_id: this.idOf(this.resolve(pos[0])), effect: 'ability-suppressed' })
                return
            case '-item':
                this.emit({ type: 'item_activate', pokemon_id: this.idOf(this.resolve(pos[0])), item: itemSlug(pos[1] ?? ''), effect: from ? effectSlug(from) : 'reveal' })
                return
            case '-enditem':
                this.emit({ type: 'item_consume', pokemon_id: this.idOf(this.resolve(pos[0])), item: itemSlug(pos[1] ?? '') })
                return
            case '-terastallize':
                this.emit({ type: 'terastallize', pokemon_id: this.idOf(this.resolve(pos[0])), tera_type: toID(pos[1] ?? '') })
                return
            case 'detailschange':
            case '-formechange':
            case '-transform': {
                const p = this.resolve(pos[0])
                const species = cmd === '-transform'
                    ? speciesSlug(this.resolve(pos[1])?.species.id ?? '')
                    : speciesSlug((pos[1] ?? '').split(',')[0]!)
                this.emit({ type: 'forme_change', pokemon_id: this.idOf(p), species })
                return
            }
            case '-miss':
                this.emit({ type: 'move_miss', pokemon_id: this.idOf(this.resolve(pos[0])), move: this.lastMove?.move ?? getMove('struggle')!, target_id: this.idOf(this.resolve(pos[1])) })
                return
            case '-fail':
            case '-block':
            case '-nothing':
            case '-notarget': {
                const p = this.resolve(pos[0])
                let reason = pos[1] ? toSlug(stripPrefix(pos[1])) : (cmd === '-notarget' ? 'no-target' : 'fail')
                if (reason === 'move' || reason === '') reason = 'fail'
                this.emit({ type: 'move_fail', pokemon_id: this.lastMove?.user || this.idOf(p), move: this.lastMove?.move ?? getMove('struggle')!, reason })
                return
            }
            case '-immune':
                this.emit({ type: 'immune', pokemon_id: this.idOf(this.resolve(pos[0])), source: from ? effectSlug(from) : 'type' })
                return
            case '-hitcount':
                this.emit({ type: 'hit_count', pokemon_id: this.idOf(this.resolve(pos[0])), hits: Number(pos[1] ?? 1) })
                return
            case '-prepare':
                this.emit({ type: 'activate', pokemon_id: this.idOf(this.resolve(pos[0])), effect: 'charging', detail: toSlug(pos[1] ?? '') })
                return
            case '-ohko':
                this.emit({ type: 'activate', effect: 'ohko' })
                return
            case '-message':
            case 'message':
                this.emit({ type: 'message', text: pos[0] ?? '' })
                return
            case 'win':
                this.reconcileAll('sync')
                this.emit({ type: 'battle_end', winner: this.battle.p1.name === pos[0] ? 'p1' : 'p2' })
                return
            case 'tie':
                this.emit({ type: 'battle_end', winner: 'draw' })
                return
            default:
                this.unknownLines.set(cmd, (this.unknownLines.get(cmd) ?? 0) + 1)
        }
    }

    // ─── 상태 조회 ──────────────────────────────────────────────
    get phase(): BattleState['phase'] {
        if (!this.ready) return 'waiting_action'
        if (this.battle.ended) return 'ended'
        if (SIDES.some(p => this.battle[p].requestState === 'teampreview')) return 'team_preview'
        if (SIDES.some(p => this.battle[p].requestState === 'switch')) return 'switching'
        return 'waiting_action'
    }

    /** 현재 상태 (매 호출마다 새로 만든 객체) */
    getState(): BattleState {
        return this.buildState(true)
    }

    /** 상태 (로그 제외) */
    snapshot(): BattleState {
        return this.buildState(false)
    }

    get winner(): PlayerID | 'draw' | null {
        if (!this.ready || !this.battle.ended) return null
        const w = this.battle.winner
        return w === this.battle.p1.name ? 'p1' : w === this.battle.p2.name ? 'p2' : 'draw'
    }

    private buildState(withLog: boolean): BattleState {
        const f = this.battle.field
        const weatherId = f.weather as string
        const terrainId = f.terrain as string
        const pending: Partial<Record<PlayerID, SwitchReason>> = {}
        for (const p of SIDES) {
            const side = this.battle[p]
            if (this.ready && side.requestState === 'switch' && !side.isChoiceDone()) {
                pending[p] = side.active.some(a => a && a.fainted) ? 'faint' : 'self_switch'
            }
        }
        const conditions: Partial<Record<FieldCondition, { turns_remaining: number }>> = {}
        for (const [id, st] of Object.entries(f.pseudoWeather)) {
            const key = FIELD_FROM_PS[id]
            if (key) conditions[key] = { turns_remaining: (st as { duration?: number }).duration ?? Infinity }
        }
        if (!this.ready) {
            return {
                format: this.config.format,
                sides: { p1: this.buildSide('p1'), p2: this.buildSide('p2') },
                field: { weather: null, weather_turns: null, terrain: null, terrain_turns: null, conditions: {}, turn: 0 },
                turn: 1, phase: 'waiting_action', winner: null, log: withLog ? this.events : [], seed: this.seed,
            }
        }
        return {
            format: this.config.format,
            sides: { p1: this.buildSide('p1'), p2: this.buildSide('p2') },
            field: {
                weather: WEATHER_FROM_PS[weatherId] ?? null,
                weather_turns: weatherId ? { turns_remaining: (f.weatherState as { duration?: number }).duration ?? Infinity } : null,
                terrain: TERRAIN_FROM_PS[terrainId] ?? null,
                terrain_turns: terrainId ? { turns_remaining: (f.terrainState as { duration?: number }).duration ?? Infinity } : null,
                conditions,
                turn: this.battle.turn,
            },
            turn: Math.max(1, this.battle.turn),
            phase: this.phase,
            winner: this.winner,
            log: withLog ? this.events : [],
            seed: this.seed,
            pending_switches: Object.keys(pending).length ? pending : undefined,
        }
    }

    private buildSide(player: PlayerID): Side {
        const side: PSSide = this.battle[player]
        if (!this.ready || !side) {
            return { id: player, name: this.config[player].name, team: [], active: [], conditions: {}, used_dynamax: false, dynamax_turns: 0 }
        }
        const team = this.teamOrder(player).map(p => this.view(p))
        const active = side.active.map(p => (p ? team.find(t => t.id === this.idOf(p))! : team[0]!))
        const conditions: Side['conditions'] = {}
        for (const [id, st] of Object.entries(side.sideConditions)) {
            const key = SIDE_FROM_PS[id]
            const s = st as { duration?: number; layers?: number }
            if (key) conditions[key] = { turns_remaining: s.duration ?? Infinity, layers: s.layers ?? 1 }
        }
        const wish = side.slotConditions?.[this.frontSlot]?.['wish'] as { duration?: number; hp?: number } | undefined
        if (wish) conditions.wish = { turns_remaining: wish.duration ?? 1, amount: wish.hp }
        return {
            id: player,
            name: side.name,
            team,
            active,
            conditions,
            used_dynamax: false,
            dynamax_turns: 0,
            used_tera: side.pokemon.some(p => !!p.terastallized),
            fainted_count: side.pokemon.filter(p => p.fainted).length,
        }
    }

    /** 원래 팀 순서 (Showdown 은 교체 시 순서를 바꾼다) */
    private teamOrder(player: PlayerID): PSPokemon[] {
        const idx = (p: PSPokemon) => Number(this.idOf(p).split('_')[1] ?? 0)
        return this.battle[player].pokemon.slice().sort((a, b) => idx(a) - idx(b))
    }

    private viewCache = new WeakMap<PSPokemon, { at: number; v: BattlePokemon }>()

    /** 로그가 늘지 않았으면 (=상태 변화 없음) 같은 뷰 재사용 */
    private view(p: PSPokemon): BattlePokemon {
        const at = this.battle.log.length
        const c = this.viewCache.get(p)
        if (c && c.at === at && this.cacheable) return c.v
        const v = this.buildView(p)
        this.viewCache.set(p, { at, v })
        return v
    }
    private cacheable = true

    private buildView(p: PSPokemon): BattlePokemon {
        const id = this.idOf(p)
        const set = this.sets.get(id)!
        const stages: StatStages = { attack: 0, defense: 0, special_attack: 0, special_defense: 0, speed: 0, accuracy: 0, evasion: 0 }
        for (const [k, v] of Object.entries(p.boosts)) {
            const key = STAT_FROM_PS[k] as keyof StatStages
            if (key) stages[key] = v as number
        }
        const volatile_statuses: BattlePokemon['volatile_statuses'] = {}
        for (const [k, st] of Object.entries(p.volatiles)) {
            const key = (VOLATILE_FROM_PS[k] ?? (k.startsWith('protosynthesis') || k.startsWith('quarkdrive') ? 'paradox_boost' : k)) as keyof BattlePokemon['volatile_statuses']
            volatile_statuses[key] = { turns_remaining: (st as { duration?: number }).duration ?? Infinity }
        }
        const initialSpecies = speciesToShowdown(set.species)
        const species = p.species.id === initialSpecies ? set.species : speciesSlug(p.species.id)
        const moves: MoveSlot[] = p.moveSlots.map(ms => ({
            move: getMove(ms.id) ?? getMove('struggle')!,
            pp: ms.pp,
            max_pp: ms.maxpp,
            disabled: !!ms.disabled,
            encore_locked: false,
        }))
        const sub = p.volatiles['substitute'] as { hp?: number } | undefined
        const choiceLock = p.volatiles['choicelock'] as { move?: string } | undefined
        const st = p.statusState as { time?: number; stage?: number }
        return {
            id,
            side: p.side.id as PlayerID,
            set,
            species,
            nickname: set.nickname ?? set.species,
            level: p.level,
            gender: p.gender === 'M' || p.gender === 'F' ? p.gender : null,
            ability: abilitySlug(p.ability),
            base_ability: abilitySlug(p.baseAbility),
            item: p.item ? itemSlug(p.item) : null,
            types: p.getTypes(false, true).map(t => t.toLowerCase()) as [string, string?],
            original_types: p.baseSpecies.types.map(t => t.toLowerCase()) as [string, string?],
            weight: p.species.weighthg,
            tera_type: p.teraType ? toID(p.teraType) : null,
            terastallized: !!p.terastallized,
            hp: Math.max(0, p.hp),
            max_hp: p.maxhp,
            stats: {
                hp: p.maxhp, attack: p.storedStats.atk, defense: p.storedStats.def,
                special_attack: p.storedStats.spa, special_defense: p.storedStats.spd, speed: p.storedStats.spe,
            },
            stages,
            moves: (moves.length ? moves : [{ move: getMove('struggle')!, pp: 1, max_pp: 1, disabled: false, encore_locked: false }]) as BattlePokemon['moves'],
            status: STATUS_FROM_PS[p.status] ?? null,
            status_turns: st.time ?? st.stage ?? 0,
            volatile_statuses,
            substitute_hp: sub?.hp ?? 0,
            last_move_used: p.lastMove ? moveSlug(p.lastMove.id) : null,
            last_move_target: null,
            must_recharge: !!p.volatiles['mustrecharge'],
            trapped: !!p.trapped,
            transformed: p.transformed,
            fainted: p.fainted || p.hp <= 0,
            active_turns: p.activeTurns,
            choice_lock: choiceLock?.move ? moveSlug(choiceLock.move) : null,
            locked_move: null,
            moved_this_turn: !!p.moveThisTurn,
            damaged_this_turn: typeof p.hurtThisTurn === 'number' ? p.hurtThisTurn : 0,
            item_consumed: p.lastItem ? itemSlug(p.lastItem) : null,
        }
    }

    getPokemon(id: string): BattlePokemon | undefined {
        const p = this.byId.get(id)
        return p ? this.view(p) : undefined
    }

    /** Showdown Pokemon 객체 (고급 사용) */
    getShowdownPokemon(id: string): PSPokemon | undefined {
        return this.byId.get(id)
    }

    /** 행동하는 앞 슬롯 (rotation 은 가운데 1, 나머지는 0) */
    get frontSlot(): number {
        return this.rotation ? FRONT : 0
    }

    /** slot 생략 시 앞 포켓몬 (rotation 은 가운데) */
    getActive(player: PlayerID, slot = this.frontSlot): BattlePokemon {
        this.start()
        const side = this.battle[player]
        return this.view(side.active[slot] ?? side.pokemon[0]!)
    }

    getActivePokemon(player: PlayerID): BattlePokemon[] {
        this.start()
        return this.battle[player].active.filter(Boolean).map(p => this.view(p))
    }

    getSide(player: PlayerID): Side {
        return this.buildSide(player)
    }

    sideOf(pokemon: BattlePokemon | string): PlayerID {
        const id = typeof pokemon === 'string' ? pokemon : pokemon.id
        return id.startsWith('p1') ? 'p1' : 'p2'
    }

    foeOf(player: PlayerID): PlayerID {
        return player === 'p1' ? 'p2' : 'p1'
    }

    /** 구름제거/에어록을 반영한 날씨 */
    effectiveWeather(): Weather {
        return WEATHER_FROM_PS[this.battle.field.effectiveWeather() as string] ?? null
    }

    /** 실제 스피드 (랭크·특성·도구·마비 반영, Showdown 계산) */
    getSpeed(pokemon: BattlePokemon | string): number {
        const p = this.byId.get(typeof pokemon === 'string' ? pokemon : pokemon.id)
        return p ? p.getActionSpeed() : 0
    }

    allActive(): BattlePokemon[] {
        return SIDES.flatMap(p => this.getActivePokemon(p))
    }

    // ─── 요청 / 행동 ───────────────────────────────────────────
    /** Showdown 원본 요청 (doubles 등에서 직접 사용) */
    getRawRequest(player: PlayerID): unknown {
        this.start()
        return this.ready ? this.battle[player].activeRequest : null
    }

    /** 팀 프리뷰 중이면 고를 파티와 출전 수. 아니면 null */
    getTeamPreview(player: PlayerID): TeamPreviewRequest | null {
        this.start()
        if (!this.ready || this.battle.ended) return null
        const side = this.battle[player]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const req = side.activeRequest as any
        if (!req?.teamPreview || side.isChoiceDone()) return null
        const team = side.pokemon.map(p => this.view(p))
        return { player, team, pick: Math.min(req.maxChosenTeamSize ?? team.length, team.length), raw: req }
    }

    /** 플레이어가 지금 내려야 할 결정 (singles / rotation). 필요 없으면 null. 팀 프리뷰는 getTeamPreview */
    getRequest(player: PlayerID): BattleRequest | null {
        this.start()
        if (!this.ready || this.battle.ended) return null
        const side = this.battle[player]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const req = side.activeRequest as any
        if (!req || req.wait || side.isChoiceDone()) return null
        if (req.teamPreview) return null // 팀 프리뷰는 getTeamPreview
        const front = this.frontSlot

        if (req.forceSwitch) {
            // rotation 은 여러 슬롯(앞 + 뒷줄)이 동시에 빌 수 있어 한 슬롯씩 차례로 묻는다
            const picks = this.pendingPicks(player, req)
            const slot = (this.rotation ? [FRONT, 0, 2] : [0]).find(i => req.forceSwitch[i] && !picks.has(i))
            if (slot === undefined) return null
            const active = this.view(side.active[slot] ?? side.pokemon[0]!)
            const picked = new Set(picks.values())
            const options = this.switchOptions(player, req).filter(p => !picked.has(p.id))
            const reviving = req.side?.pokemon?.some((p: { reviving?: boolean }) => p.reviving)
            const reason: SwitchReason = reviving ? 'revival_blessing' : active.fainted ? 'faint' : 'self_switch'
            return { type: 'switch', player, reason, active, switches: options, raw: req }
        }

        const live = side.active[front]
        const a = req.active?.[front]
        if (!a || !live) return null
        const active = this.view(live)
        const bench = this.benchOf(player)
        // 숨은 구속(그림자밟기 등)도 반영: 실제 포켓몬 상태 사용
        const trapped = !!a.trapped || !!a.maybeTrapped && !!live.trapped
        const forced = a.moves.length === 1 && a.moves[0].pp === undefined

        if (this.rotation) {
            const rotate: RotateOption[] = []
            if (!frontLocked(side)) {
                for (const direction of ['left', 'right'] as const) {
                    const slot = ROTATE_SLOT[direction]
                    const back = side.active[slot]
                    const ra = req.active[slot]
                    if (!back || back.fainted || !ra) continue
                    rotate.push({ direction, pokemon: this.view(back), moves: this.moveOptions(ra, back), can_terastallize: !!ra.canTerastallize })
                }
            }
            if (live.fainted) {
                // 앞 자리가 비었고 채울 벤치가 없다 → 반드시 회전
                return { type: 'move', player, active, moves: [], switches: [], can_switch: false, can_terastallize: false, rotate, must_rotate: true, raw: req }
            }
            return {
                type: 'move', player, active, moves: this.moveOptions(a, live),
                switches: trapped ? [] : bench, can_switch: !trapped && bench.length > 0,
                can_terastallize: !!a.canTerastallize, forced, rotate, raw: req,
            }
        }

        return {
            type: 'move',
            player,
            active,
            moves: this.moveOptions(a, live),
            switches: trapped ? [] : bench,
            can_switch: !trapped && bench.length > 0,
            can_terastallize: !!a.canTerastallize,
            forced,
            raw: req,
        }
    }

    /** 교체로 내보낼 수 있는 벤치 (원래 파티 순서) */
    private benchOf(player: PlayerID): BattlePokemon[] {
        const side = this.battle[player]
        // 같은 턴에 이미 예약된 교체 대상은 다시 고를 수 없다 (탈출팩 등 턴 중 강제 교체)
        const queuedIn = new Set<PSPokemon>()
        for (const a of this.battle.queue.list as { choice?: string; target?: PSPokemon; pokemon?: PSPokemon }[]) {
            if ((a.choice === 'switch' || a.choice === 'instaswitch') && a.target && a.pokemon?.side === side) queuedIn.add(a.target)
        }
        return side.pokemon
            .filter(p => !p.isActive && !p.fainted && p.hp > 0 && !queuedIn.has(p))
            .map(p => this.view(p))
            .sort((a, b) => Number(a.id.split('_')[1]) - Number(b.id.split('_')[1]))
    }

    /** 교체 요청에서 고를 수 있는 포켓몬 (부활의기원이면 기절한 포켓몬) */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private switchOptions(player: PlayerID, req: any): BattlePokemon[] {
        if (req.side?.pokemon?.some((p: { reviving?: boolean }) => p.reviving)) {
            return this.battle[player].pokemon.filter(p => p.fainted).map(p => this.view(p))
                .sort((a, b) => Number(a.id.split('_')[1]) - Number(b.id.split('_')[1]))
        }
        return this.benchOf(player)
    }

    /** Showdown 요청의 한 슬롯 → 기술 선택지 */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private moveOptions(a: any, livePoke: PSPokemon | undefined): MoveOption[] {
        return a.moves.map((m: { id: string; pp?: number; maxpp?: number; disabled?: boolean | string }, i: number) => {
            // 숨은 사용 불가(봉인 등)는 요청에 maybeDisabled 로만 표시되므로 실제 슬롯을 확인
            const liveSlot = a.maybeDisabled ? livePoke?.moveSlots.find(ms => ms.id === m.id) : undefined
            const disabled = !!m.disabled || !!liveSlot?.disabled
            return {
                index: i as MoveOption['index'],
                move: getMove(m.id) ?? getMove('struggle')!,
                pp: m.pp ?? 1,
                max_pp: m.maxpp ?? 1,
                disabled,
                disabled_reason: disabled ? (typeof m.disabled === 'string' ? m.disabled : '사용 불가') : undefined,
            }
        })
    }

    /** rotation 교체 요청에서 이미 고른 슬롯들 (요청이 바뀌면 초기화) */
    private pendingPicks(player: PlayerID, req: unknown): Map<number, string> {
        const cur = this.switchPicks[player]
        if (cur && cur.req === req) return cur.picks
        const fresh = { req, picks: new Map<number, string>() }
        this.switchPicks[player] = fresh
        return fresh.picks
    }

    getAvailableActions(player: PlayerID): Action[] {
        // 팀 프리뷰: 파티 순서 그대로 (순서는 경우의 수가 많아 기본값 하나만)
        const preview = this.getTeamPreview(player)
        if (preview) return [{ type: 'team', player, order: preview.team.slice(0, preview.pick).map(p => p.id) }]
        const req = this.getRequest(player)
        if (!req) return []
        const actions: Action[] = []
        if (req.type === 'move') {
            const add = (pokemon_id: string, moves: MoveOption[], tera: boolean, rotate?: RotateDirection) => {
                for (const m of moves) {
                    if (m.disabled) continue
                    actions.push({ type: 'move', player, pokemon_id, move_index: m.index, ...(rotate && { rotate }) })
                    if (tera) actions.push({ type: 'move', player, pokemon_id, move_index: m.index, terastallize: true, ...(rotate && { rotate }) })
                }
            }
            add(req.active.id, req.moves, req.can_terastallize)
            // 쓸 수 있는 기술이 하나도 없으면(숨은 사용 불가 포함) 발버둥
            if (req.moves.length && req.moves.every(m => m.disabled)) actions.push({ type: 'move', player, pokemon_id: req.active.id, move_index: -1 })
            for (const r of req.rotate ?? []) add(r.pokemon.id, r.moves, r.can_terastallize, r.direction)
        }
        for (const p of req.switches) actions.push({ type: 'switch', player, pokemon_id: req.active.id, switch_to_id: p.id })
        return actions
    }

    /** 행동 → Showdown 선택 문자열 */
    toChoice(action: Action): string {
        if (action.type === 'raw') return action.choice
        if (action.type === 'team') {
            const side = this.battle[action.player]
            const idx = action.order.map(id => {
                const p = this.byId.get(id)
                const i = p ? side.pokemon.indexOf(p) : -1
                if (i < 0) throw new BattleError(`${id} 는 ${action.player} 의 포켓몬이 아닙니다`)
                return i + 1
            })
            return `team ${idx.join(', ')}`
        }
        if (action.type === 'switch') {
            const target = this.byId.get(action.switch_to_id)
            const idx = target ? this.battle[action.player].pokemon.indexOf(target) : -1
            if (idx < 0) throw new BattleError(`${action.switch_to_id} 로 교체할 수 없습니다`)
            return this.rotation ? this.slotChoice(FRONT, `switch ${idx + 1}`) : `switch ${idx + 1}`
        }
        const n = action.move_index === -1 ? 1 : action.move_index + 1
        const tera = action.terastallize ? ' terastallize' : ''
        if (!this.rotation) return `move ${n}${tera}`
        // rotation: 행동하는 슬롯만 기술, 나머지는 pass. 상대 쪽 대상은 항상 상대 앞(loc 2)
        const slot = action.rotate ? ROTATE_SLOT[action.rotate] : FRONT
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const reqMove = (this.battle[action.player].activeRequest as any)?.active?.[slot]?.moves?.[n - 1] as { target?: string } | undefined
        const t = reqMove?.target ?? ''
        const loc = ['normal', 'any', 'adjacentFoe'].includes(t) ? ` ${FOE_FRONT_LOC}`
            : ['adjacentAlly', 'adjacentAllyOrSelf'].includes(t) ? ` -${slot + 1}` : ''
        return this.slotChoice(slot, `move ${n}${loc}${tera}`)
    }

    /** rotation: 한 슬롯만 행동하고 나머지는 pass 인 선택 문자열 */
    private slotChoice(slot: number, choice: string): string {
        return [0, 1, 2].map(i => (i === slot ? choice : 'pass')).join(', ')
    }

    submitAction(action: Action): void {
        this.start()
        if (this.battle.ended) throw new BattleError('배틀이 이미 종료되었습니다')
        let final: Action = action
        if (action.type === 'team') {
            const req = this.getTeamPreview(action.player)
            if (!req) throw new BattleError(`${action.player} 는 지금 팀을 고를 차례가 아닙니다`)
            if (new Set(action.order).size !== action.order.length) throw new BattleError('같은 포켓몬을 두 번 고를 수 없습니다')
            if (action.order.length !== req.pick) throw new BattleError(`${req.pick}마리를 골라야 합니다 (${action.order.length}마리 선택됨)`)
        } else if (action.type === 'switch') {
            const req = this.requireRequest(action)
            const to = action.switch_to_id
            if (!req.switches.some(p => p.id === to)) throw new BattleError(`${to} 로 교체할 수 없습니다`)
            if (this.rotation && req.type === 'switch') return this.pickRotationSwitch(action)
        } else if (action.type === 'move') {
            const req = this.requireRequest(action)
            if (req.type === 'switch') throw new BattleError('교체할 포켓몬을 선택해야 합니다')
            let moves = req.moves
            let forced = req.forced
            let canTera = req.can_terastallize
            if (action.rotate) {
                const opt = req.rotate?.find(r => r.direction === action.rotate)
                if (!opt) throw new BattleError(`지금은 ${action.rotate === 'left' ? '왼쪽' : '오른쪽'}으로 돌릴 수 없습니다`)
                moves = opt.moves
                forced = false
                canTera = opt.can_terastallize
            } else if (req.must_rotate) {
                throw new BattleError("앞 자리가 비어 있습니다. rotate: 'left' | 'right' 로 뒷줄 포켓몬을 돌려야 합니다")
            }
            const idx = action.move_index
            const opt = moves.find(m => m.index === idx) ?? (forced || idx === -1 ? moves[0] : undefined)
            if (!opt) throw new BattleError(`기술 슬롯 ${idx} 은(는) 사용할 수 없습니다`)
            const struggle = idx === -1 && moves.every(m => m.disabled) // 모든 기술 사용 불가 → Showdown 이 발버둥으로 처리
            if (opt.disabled && !struggle) throw new BattleError(`${opt.move.name} 은(는) 사용할 수 없습니다 (${opt.disabled_reason})`)
            if (action.terastallize && !canTera) throw new BattleError('테라스탈할 수 없습니다')
            if (opt.index !== idx) final = { ...action, move_index: opt.index }
        }
        this.submitChoice(final.player, this.toChoice(final))
    }

    /** rotation 교체 요청: 슬롯을 하나씩 모았다가 모두 채우면(또는 더 보낼 포켓몬이 없으면) 한 번에 제출 */
    private pickRotationSwitch(action: Extract<Action, { type: 'switch' }>): void {
        const side = this.battle[action.player]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const req = side.activeRequest as any
        const picks = this.pendingPicks(action.player, req)
        const slot = [FRONT, 0, 2].find(i => req.forceSwitch[i] && !picks.has(i))!
        picks.set(slot, action.switch_to_id)
        const picked = new Set(picks.values())
        const open = [FRONT, 0, 2].filter(i => req.forceSwitch[i] && !picks.has(i))
        if (open.length && this.switchOptions(action.player, req).some(p => !picked.has(p.id))) return
        const choice = [0, 1, 2].map(i => {
            const id = picks.get(i)
            return id ? `switch ${side.pokemon.indexOf(this.byId.get(id)!) + 1}` : 'pass'
        }).join(', ')
        delete this.switchPicks[action.player]
        this.submitChoice(action.player, choice)
    }

    private requireRequest(action: Extract<Action, { type: 'move' | 'switch' }>): BattleRequest {
        const req = this.getRequest(action.player)
        if (!req) {
            if (this.getTeamPreview(action.player)) throw new BattleError("팀 프리뷰 중입니다. { type: 'team', order } 로 출전 순서를 먼저 고르세요")
            throw new BattleError(`${action.player} 는 지금 행동을 제출할 필요가 없습니다`)
        }
        const rotateIn = action.type === 'move' && action.rotate && req.type === 'move'
            ? req.rotate?.find(r => r.direction === action.rotate)?.pokemon.id
            : undefined
        if (action.pokemon_id && action.pokemon_id !== req.active.id && action.pokemon_id !== rotateIn) {
            throw new BattleError(`필드의 포켓몬(${req.active.id})이 아닌 ${action.pokemon_id} 로 행동할 수 없습니다`)
        }
        return req
    }

    /** Showdown 선택 문자열 직접 제출 ('move 1', 'switch 3', 'move 2 terastallize, move 1 2' …) */
    submitChoice(player: PlayerID, choice: string): void {
        this.start()
        const ok = this.battle.choose(player, choice)
        if (!ok) {
            const err = this.battle[player].choice.error || 'invalid choice'
            throw new BattleError(`${player}: ${err} (${choice})`)
        }
    }

    submitActions(p1: Action, p2: Action): void {
        this.submitAction(p1)
        this.submitAction(p2)
    }

    // ─── 데미지 미리보기 (@smogon/calc) ─────────────────────────
    private calcInput(p: PSPokemon, tera = false): CalcPokemonInput {
        const boostedVol = Object.keys(p.volatiles).find(k => k.startsWith('protosynthesis') || k.startsWith('quarkdrive'))
        return {
            species: p.species.name,
            level: p.level,
            nature: p.set.nature,
            ability: p.ability,
            item: p.item || null,
            evs: p.set.evs as never,
            ivs: p.set.ivs as never,
            boosts: Object.fromEntries(Object.entries(p.boosts).map(([k, v]) => [STAT_FROM_PS[k] ?? k, v])) as never,
            status: STATUS_FROM_PS[p.status] as CalcPokemonInput['status'],
            curHP: p.hp,
            teraType: p.teraType,
            terastallized: !!p.terastallized || tera,
            alliesFainted: p.side.pokemon.filter(x => x.fainted).length,
            boostedStat: boostedVol ? (boostedVol.slice(-3) as CalcPokemonInput['boostedStat']) : undefined,
        }
    }

    /**
     * 현재 필드 상태로 데미지 미리보기 (singles / rotation 의 앞 포켓몬끼리).
     * moveIndex 는 현재 포켓몬의 기술 슬롯.
     */
    previewDamage(player: PlayerID, moveIndex: number, opts: { terastallize?: boolean } = {}): DamageResult | null {
        this.start()
        const user = this.battle[player].active[this.frontSlot]
        const foe = this.battle[this.foeOf(player)].active[this.frontSlot]
        const slot = user?.moveSlots[moveIndex]
        if (!user || !foe || foe.fainted || !slot) return null
        const move = Dex.moves.get(slot.id)
        if (move.category === 'Status') return null
        const foeSide = this.battle[this.foeOf(player)].sideConditions
        try {
            return calculateDamage(this.calcInput(user, !!opts.terastallize), this.calcInput(foe), move.id, {
                weather: this.effectiveWeather(),
                terrain: TERRAIN_FROM_PS[this.battle.field.terrain as string] ?? null,
                gravity: !!this.battle.field.pseudoWeather['gravity'],
                magicRoom: !!this.battle.field.pseudoWeather['magicroom'],
                wonderRoom: !!this.battle.field.pseudoWeather['wonderroom'],
                reflect: !!foeSide['reflect'],
                lightScreen: !!foeSide['lightscreen'],
                auroraVeil: !!foeSide['auroraveil'],
            })
        } catch {
            return null
        }
    }

    forfeit(player: PlayerID): void {
        this.start()
        if (this.battle.ended) return
        this.battle.win(this.foeOf(player))
    }
}
