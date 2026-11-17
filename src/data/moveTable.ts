// ─── 기술 플래그 / 특수 동작 테이블 ──────────────────────────
// PokeAPI 데이터에 없는 정보(접촉 여부, 소리/펀치/물기 등 분류,
// 자신 교체, 반동턴, 모으기, 고정 데미지 등)를 보완한다.

import type { MoveData, StatChange } from '../types/move'

const set = (...names: string[]) => new Set(names)

// ── 접촉하지 않는 물리 기술 (그 외 물리 기술은 접촉으로 간주) ─────
export const NON_CONTACT_PHYSICAL = set(
    'earthquake', 'magnitude', 'bulldoze', 'fissure', 'dig', 'earth-power', 'precipice-blades', 'stomping-tantrum',
    'rock-slide', 'rock-blast', 'rock-throw', 'rock-tomb', 'stone-edge', 'smack-down', 'diamond-storm',
    'self-destruct', 'explosion', 'misty-explosion', 'razor-wind',
    'bone-club', 'bonemerang', 'bone-rush', 'shadow-bone',
    'bullet-seed', 'pin-missile', 'icicle-spear', 'icicle-crash', 'ice-shard', 'avalanche',
    'seed-bomb', 'gunk-shot', 'poison-sting', 'twineedle', 'fury-attack',
    'egg-bomb', 'barrage', 'spike-cannon', 'magnet-bomb', 'mud-shot',
    'sky-attack', 'drill-run',
    'scale-shot', 'dragon-darts', 'thousand-arrows', 'thousand-waves', 'lands-wrath',
    'pyro-ball', 'fling', 'beat-up', 'present', 'natural-gift', 'secret-power',
    'leafage', 'razor-leaf', 'petal-blizzard', 'grav-apple', 'apple-acid',
    'glacial-lance', 'stone-axe', 'ceaseless-edge', 'salt-cure',
    'tera-blast', 'triple-arrows', 'barb-barrage', 'mountain-gale', 'spirit-shackle',
    'sacred-fire', 'fusion-bolt', 'freeze-shock', 'ice-burn',
    'snipe-shot', 'rock-wrecker', 'meteor-assault',
    'shell-side-arm', 'tachyon-cutter',
    'psycho-cut', 'air-cutter',
)

// 특수 기술 중 접촉하는 기술
export const CONTACT_SPECIAL = set('petal-dance', 'trump-card', 'wring-out', 'grass-knot', 'draining-kiss', 'infestation')

export const SOUND_MOVES = set(
    'boomburst', 'bug-buzz', 'chatter', 'clanging-scales', 'clangorous-soul', 'confide', 'disarming-voice',
    'echoed-voice', 'eerie-spell', 'grass-whistle', 'growl', 'heal-bell', 'howl', 'hyper-voice', 'metal-sound',
    'noble-roar', 'overdrive', 'parting-shot', 'perish-song', 'relic-song', 'roar', 'round', 'screech',
    'sing', 'snarl', 'snore', 'sparkling-aria', 'supersonic', 'uproar', 'torch-song', 'alluring-voice',
    'psychic-noise',
)
export const PUNCH_MOVES = set(
    'bullet-punch', 'comet-punch', 'dizzy-punch', 'double-iron-bash', 'drain-punch', 'dynamic-punch',
    'fire-punch', 'focus-punch', 'hammer-arm', 'headlong-rush', 'ice-hammer', 'ice-punch', 'jet-punch',
    'mach-punch', 'mega-punch', 'meteor-mash', 'plasma-fists', 'power-up-punch', 'rage-fist',
    'shadow-punch', 'sky-uppercut', 'surging-strikes', 'thunder-punch', 'wicked-blow',
)
export const BITE_MOVES = set(
    'bite', 'crunch', 'fire-fang', 'fishious-rend', 'hyper-fang', 'ice-fang', 'jaw-lock',
    'poison-fang', 'psychic-fangs', 'thunder-fang',
)
export const PULSE_MOVES = set('aura-sphere', 'dark-pulse', 'dragon-pulse', 'heal-pulse', 'origin-pulse', 'terrain-pulse', 'water-pulse')
export const BULLET_MOVES = set(
    'acid-spray', 'aura-sphere', 'barrage', 'beak-blast', 'bullet-seed', 'egg-bomb', 'electro-ball',
    'energy-ball', 'focus-blast', 'gyro-ball', 'ice-ball', 'magnet-bomb', 'mist-ball', 'mud-bomb',
    'octazooka', 'pollen-puff', 'pyro-ball', 'rock-blast', 'rock-wrecker', 'searing-shot', 'seed-bomb',
    'shadow-ball', 'sludge-bomb', 'weather-ball', 'zap-cannon',
)
export const SLICING_MOVES = set(
    'aerial-ace', 'air-cutter', 'air-slash', 'aqua-cutter', 'behemoth-blade', 'bitter-blade', 'ceaseless-edge',
    'cross-poison', 'cut', 'fury-cutter', 'kowtow-cleave', 'leaf-blade', 'night-slash', 'population-bomb',
    'psycho-cut', 'razor-leaf', 'razor-shell', 'sacred-sword', 'secret-sword', 'slash', 'solar-blade',
    'stone-axe', 'x-scissor', 'tachyon-cutter', 'mighty-cleave', 'psyblade',
)
export const POWDER_MOVES = set('cotton-spore', 'magic-powder', 'poison-powder', 'powder', 'rage-powder', 'sleep-powder', 'spore', 'stun-spore')
export const WIND_MOVES = set('air-cutter', 'bleakwind-storm', 'blizzard', 'fairy-wind', 'gust', 'heat-wave', 'hurricane', 'icy-wind', 'petal-blizzard', 'sandsear-storm', 'sandstorm', 'springtide-storm', 'tailwind', 'twister', 'whirlwind', 'wildbolt-storm')

// ── 자신 교체 기술 ───────────────────────────────────────────
export const SELF_SWITCH_MOVES = set('u-turn', 'volt-switch', 'flip-turn', 'parting-shot', 'teleport', 'baton-pass', 'shed-tail', 'chilly-reception')

// ── 강제 교체 (상대) ─────────────────────────────────────────
export const FORCE_SWITCH_MOVES = set('roar', 'whirlwind', 'dragon-tail', 'circle-throw')

// ── 반동턴 ───────────────────────────────────────────────────
export const RECHARGE_MOVES = set(
    'hyper-beam', 'giga-impact', 'blast-burn', 'frenzy-plant', 'hydro-cannon', 'rock-wrecker',
    'roar-of-time', 'prismatic-laser', 'eternabeam', 'meteor-assault',
)

// ── 모으기 (2턴) ─────────────────────────────────────────────
export const CHARGE_MOVES: Record<string, { selfBoost?: StatChange[]; skipInWeather?: string[] }> = {
    'solar-beam':    { skipInWeather: ['sun', 'harsh_sun'] },
    'solar-blade':   { skipInWeather: ['sun', 'harsh_sun'] },
    'meteor-beam':   { selfBoost: [{ stat: 'special_attack', change: 1 }] },
    'electro-shot':  { selfBoost: [{ stat: 'special_attack', change: 1 }], skipInWeather: ['rain', 'heavy_rain'] },
    'skull-bash':    { selfBoost: [{ stat: 'defense', change: 1 }] },
    'sky-attack':    {},
    'razor-wind':    {},
    'freeze-shock':  {},
    'ice-burn':      {},
    'geomancy':      {},
}

// ── 난동 (2~3턴 고정 후 혼란) ────────────────────────────────
export const RAMPAGE_MOVES = set('outrage', 'petal-dance', 'thrash', 'raging-fury')

// ── 보호 관통 ────────────────────────────────────────────────
export const BYPASS_PROTECT = set('feint', 'shadow-force', 'phantom-force', 'hyperspace-hole', 'hyperspace-fury')

// ── 첫 턴만 성공 ─────────────────────────────────────────────
export const FIRST_TURN_ONLY = set('fake-out', 'first-impression', 'mat-block')

// ── 고정 데미지 ──────────────────────────────────────────────
export type FixedDamageKind = 'level' | 'half_hp' | 'fixed_20' | 'fixed_40' | 'endeavor' | 'ohko'
export const FIXED_DAMAGE_MOVES: Record<string, FixedDamageKind> = {
    'seismic-toss': 'level', 'night-shade': 'level',
    'super-fang': 'half_hp', 'natures-madness': 'half_hp', 'ruination': 'half_hp',
    'sonic-boom': 'fixed_20', 'dragon-rage': 'fixed_40',
    'endeavor': 'endeavor',
    'fissure': 'ohko', 'guillotine': 'ohko', 'horn-drill': 'ohko', 'sheer-cold': 'ohko',
}

// ── 회복 기술 (최대 HP 비율) ─────────────────────────────────
export const HEAL_MOVES: Record<string, number | 'weather' | 'sand'> = {
    'recover': 0.5, 'roost': 0.5, 'soft-boiled': 0.5, 'slack-off': 0.5, 'milk-drink': 0.5,
    'heal-order': 0.5, 'shore-up': 'sand', 'morning-sun': 'weather', 'synthesis': 'weather', 'moonlight': 'weather',
}

// ── 해저드 / 스크린 / 사이드 ─────────────────────────────────
export const HAZARD_MOVES: Record<string, 'stealth_rock' | 'spikes' | 'toxic_spikes' | 'sticky_web'> = {
    'stealth-rock': 'stealth_rock', 'spikes': 'spikes', 'toxic-spikes': 'toxic_spikes', 'sticky-web': 'sticky_web',
}
export const SCREEN_MOVES: Record<string, 'reflect' | 'light_screen' | 'aurora_veil' | 'tailwind' | 'safeguard' | 'mist' | 'lucky_chant'> = {
    'reflect': 'reflect', 'light-screen': 'light_screen', 'aurora-veil': 'aurora_veil',
    'tailwind': 'tailwind', 'safeguard': 'safeguard', 'mist': 'mist', 'lucky-chant': 'lucky_chant',
}
export const HAZARD_CLEAR_SELF = set('rapid-spin', 'mortal-spin', 'tidy-up')

// ── 날씨 / 필드 기술 ─────────────────────────────────────────
export const WEATHER_MOVES: Record<string, 'sun' | 'rain' | 'sandstorm' | 'snow'> = {
    'sunny-day': 'sun', 'rain-dance': 'rain', 'sandstorm': 'sandstorm', 'snowscape': 'snow', 'hail': 'snow', 'chilly-reception': 'snow',
}
export const TERRAIN_MOVES: Record<string, 'electric' | 'grassy' | 'misty' | 'psychic'> = {
    'electric-terrain': 'electric', 'grassy-terrain': 'grassy', 'misty-terrain': 'misty', 'psychic-terrain': 'psychic',
}

// ── 자기 대상 기술 (PokeAPI target 이 user 가 아닌 것 포함) ──────
export const SELF_TARGET_MOVES = set(
    'rest', 'wish', 'healing-wish', 'lunar-dance', 'substitute', 'belly-drum', 'shell-smash',
    'focus-energy', 'ingrain', 'aqua-ring', 'magnet-rise', 'stockpile', 'charge',
)

// ── 4세대 이후 PokeAPI 메타가 비어있는 기술 보정 ─────────────
// self: 사용자 랭크 변화, target: 대상 랭크 변화, chance: 확률(%)
export interface MovePatch {
    self?:      StatChange[]
    target?:    StatChange[]
    chance?:    number
    ailment?:   string
    ailmentChance?: number
    drain?:     number
    flinch?:    number
    crit?:      number
    minHits?:   number
    maxHits?:   number
}

export const MOVE_PATCHES: Record<string, MovePatch> = {
    'close-combat':     { self: [{ stat: 'defense', change: -1 }, { stat: 'special_defense', change: -1 }] },
    'headlong-rush':    { self: [{ stat: 'defense', change: -1 }, { stat: 'special_defense', change: -1 }] },
    'superpower':       { self: [{ stat: 'attack', change: -1 }, { stat: 'defense', change: -1 }] },
    'make-it-rain':     { self: [{ stat: 'special_attack', change: -1 }] },
    'draco-meteor':     { self: [{ stat: 'special_attack', change: -2 }] },
    'overheat':         { self: [{ stat: 'special_attack', change: -2 }] },
    'leaf-storm':       { self: [{ stat: 'special_attack', change: -2 }] },
    'fleur-cannon':     { self: [{ stat: 'special_attack', change: -2 }] },
    'psycho-boost':     { self: [{ stat: 'special_attack', change: -2 }] },
    'v-create':         { self: [{ stat: 'defense', change: -1 }, { stat: 'special_defense', change: -1 }, { stat: 'speed', change: -1 }] },
    'hammer-arm':       { self: [{ stat: 'speed', change: -1 }] },
    'ice-hammer':       { self: [{ stat: 'speed', change: -1 }] },
    'armor-cannon':     { self: [{ stat: 'defense', change: -1 }, { stat: 'special_defense', change: -1 }] },
    'spin-out':         { self: [{ stat: 'speed', change: -2 }] },
    'rapid-spin':       { self: [{ stat: 'speed', change: 1 }], chance: 100 },
    'flame-charge':     { self: [{ stat: 'speed', change: 1 }], chance: 100 },
    'trailblaze':       { self: [{ stat: 'speed', change: 1 }], chance: 100 },
    'aqua-step':        { self: [{ stat: 'speed', change: 1 }], chance: 100 },
    'power-up-punch':   { self: [{ stat: 'attack', change: 1 }], chance: 100 },
    'torch-song':       { self: [{ stat: 'special_attack', change: 1 }], chance: 100 },
    'tera-blast':       {},
    'ice-spinner':      {},
    'mortal-spin':      { ailment: 'poison', ailmentChance: 100 },
    'salt-cure':        {},
    'kowtow-cleave':    {},
    'bitter-blade':     { drain: 50 },
    'matcha-gotcha':    { drain: 50, ailment: 'burn', ailmentChance: 20 },
    'collision-course': {},
    'electro-drift':    {},
    'flower-trick':     { crit: 3 },
    'wicked-blow':      { crit: 3 },
    'surging-strikes':  { crit: 3, minHits: 3, maxHits: 3 },
    'population-bomb':  { minHits: 10, maxHits: 10 },
    'triple-axel':      { minHits: 3, maxHits: 3 },
    'dragon-darts':     { minHits: 2, maxHits: 2 },
    'double-iron-bash': { minHits: 2, maxHits: 2, flinch: 30 },
    'twin-beam':        { minHits: 2, maxHits: 2 },
    'dual-wingbeat':    { minHits: 2, maxHits: 2 },
    'tachyon-cutter':   { minHits: 2, maxHits: 2 },
    'chilling-water':   { target: [{ stat: 'attack', change: -1 }], chance: 100 },
    'lumina-crash':     { target: [{ stat: 'special_defense', change: -2 }], chance: 100 },
    'spicy-extract':    { self: [], target: [{ stat: 'attack', change: 2 }, { stat: 'defense', change: -2 }] },
    'tidy-up':          { self: [{ stat: 'attack', change: 1 }, { stat: 'speed', change: 1 }] },
    'victory-dance':    { self: [{ stat: 'attack', change: 1 }, { stat: 'defense', change: 1 }, { stat: 'speed', change: 1 }] },
    'shed-tail':        {},
    'fillet-away':      { self: [{ stat: 'attack', change: 2 }, { stat: 'special_attack', change: 2 }, { stat: 'speed', change: 2 }] },
    'ceaseless-edge':   {},
    'stone-axe':        {},
    'esper-wing':       { self: [{ stat: 'speed', change: 1 }], chance: 100, crit: 1 },
    'bleakwind-storm':  { target: [{ stat: 'speed', change: -1 }], chance: 30 },
    'sandsear-storm':   { ailment: 'burn', ailmentChance: 20 },
    'wildbolt-storm':   { ailment: 'paralysis', ailmentChance: 20 },
    'springtide-storm': { target: [{ stat: 'attack', change: -1 }], chance: 30 },
    'blood-moon':       {},
    'ivy-cudgel':       { crit: 1 },
    'hard-press':       {},
    'temper-flare':     {},
    'supercell-slam':   {},
    'psychic-noise':    {},
    'upper-hand':       { flinch: 100 },
    'thunderclap':      {},
    'mighty-cleave':    {},
    'alluring-voice':   {},
    'burning-bulwark':  {},
    'dragon-cheer':     {},
    'fickle-beam':      {},
    'malignant-chain':  { ailment: 'toxic', ailmentChance: 50 },
    'jet-punch':        {},
    'rage-fist':        {},
    'raging-bull':      {},
    'last-respects':    {},
    'axe-kick':         { ailment: 'confusion', ailmentChance: 30 },
    'hyper-drill':      {},
    'double-shock':     {},
    'gigaton-hammer':   {},
    'comeuppance':      {},
    'aqua-cutter':      { crit: 1 },
    'pounce':           { target: [{ stat: 'speed', change: -1 }], chance: 100 },
    'trop-kick':        { target: [{ stat: 'attack', change: -1 }], chance: 100 },
    'syrup-bomb':       {},
    'mystical-power':   { self: [{ stat: 'special_attack', change: 1 }], chance: 100 },
    'barb-barrage':     { ailment: 'poison', ailmentChance: 50 },
    'triple-arrows':    { target: [{ stat: 'defense', change: -1 }], chance: 50, flinch: 30, crit: 1 },
    'infernal-parade':  { ailment: 'burn', ailmentChance: 30 },
    'mountain-gale':    { flinch: 30 },
    'dire-claw':        { ailmentChance: 50 },
    'psyshield-bash':   { self: [{ stat: 'defense', change: 1 }], chance: 100 },
    'chloroblast':      { drain: -50 },
    'wave-crash':       { drain: -33 },
    'head-smash':       { drain: -50 },
}

// ── 위력 변동 (기술 위력 0/null 이지만 데미지가 있는 기술 포함) ──
export const VARIABLE_POWER_MOVES = set(
    'low-kick', 'grass-knot', 'heavy-slam', 'heat-crash', 'gyro-ball', 'electro-ball',
    'eruption', 'water-spout', 'dragon-energy', 'flail', 'reversal', 'facade', 'hex',
    'knock-off', 'acrobatics', 'weather-ball', 'body-press', 'foul-play', 'stored-power', 'power-trip',
    'last-respects', 'rage-fist', 'bolt-beak', 'fishious-rend', 'venoshock', 'brine',
)

// ── 헬퍼 ─────────────────────────────────────────────────────
export function isContact(move: MoveData): boolean {
    if (move.category === 'physical') return !NON_CONTACT_PHYSICAL.has(move.name)
    if (move.category === 'special')  return CONTACT_SPECIAL.has(move.name)
    return false
}

export interface MoveFlags {
    contact: boolean
    sound:   boolean
    punch:   boolean
    bite:    boolean
    pulse:   boolean
    bullet:  boolean
    slicing: boolean
    powder:  boolean
    wind:    boolean
}

export function getMoveFlags(move: MoveData): MoveFlags {
    const n = move.name
    return {
        contact: isContact(move),
        sound:   SOUND_MOVES.has(n),
        punch:   PUNCH_MOVES.has(n),
        bite:    BITE_MOVES.has(n),
        pulse:   PULSE_MOVES.has(n),
        bullet:  BULLET_MOVES.has(n),
        slicing: SLICING_MOVES.has(n),
        powder:  POWDER_MOVES.has(n),
        wind:    WIND_MOVES.has(n),
    }
}

// ── 기술 타겟이 자기 자신 혹은 자기 진영인지 ──────────────────
export function isSelfTargeting(move: MoveData): boolean {
    if (SELF_TARGET_MOVES.has(move.name)) return true
    return ['user', 'users-field', 'user-and-allies', 'all-allies', 'ally', 'user-or-ally'].includes(move.target)
        || move.target === 'entire-field'
        || move.target === 'opponents-field'
}

/** 상대에게 영향을 주는 기술인지 (보호/대타 판정용) */
export function targetsFoe(move: MoveData): boolean {
    return !isSelfTargeting(move)
}

// ── 패치 반영한 메타 조회 ─────────────────────────────────────
export function getStatEffects(move: MoveData): { self: StatChange[]; target: StatChange[]; chance: number } {
    const patch = MOVE_PATCHES[move.name]
    if (patch && (patch.self || patch.target)) {
        return {
            self:   patch.self ?? [],
            target: patch.target ?? [],
            chance: patch.chance ?? 100,
        }
    }
    const changes = move.stat_changes ?? []
    if (changes.length === 0) return { self: [], target: [], chance: 0 }

    const metaCat = move.meta?.category ?? ''
    const rawChance = move.meta?.stat_chance || move.effect_chance || 0
    const chance = rawChance === 0 ? 100 : rawChance

    if (move.category === 'status') {
        // 변화기: 타겟이 user 계열이면 자신, 아니면 대상
        return isSelfTargeting(move) ? { self: changes, target: [], chance: 100 } : { self: [], target: changes, chance: 100 }
    }
    // 공격기: damage-raise 는 사용자, damage-lower 는 대상
    if (metaCat === 'damage-raise') return { self: changes, target: [], chance }
    if (metaCat === 'damage-lower') return { self: [], target: changes, chance }
    // 메타 없음: 하락이면 대상, 상승이면 자신
    return changes.every(c => c.change > 0)
        ? { self: changes, target: [], chance }
        : { self: [], target: changes, chance }
}

export function getMovePatch(name: string): MovePatch | undefined {
    return MOVE_PATCHES[name]
}
