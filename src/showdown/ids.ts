// ─── PokeAPI 슬러그 ↔ Pokémon Showdown ID ─────────────────────
// PokeAPI: 'urshifu-single-strike', 'kings-shield', 'heavy-duty-boots'
// Showdown: 'urshifu', 'kingsshield', 'heavydutyboots'
import { Dex, toID } from '@pkmn/sim'

/** PokeAPI 폼 이름 중 규칙으로 안 되는 것 */
const SPECIES_ALIAS: Record<string, string> = {
    'raticate-totem-alola': 'raticatealolatotem',
    'marowak-totem': 'marowakalolatotem',
    'mimikyu-totem-disguised': 'mimikyutotem',
    'mimikyu-totem-busted': 'mimikyubustedtotem',
    'maushold-family-of-four': 'mausholdfour',
    'maushold-family-of-three': 'maushold',
    'squawkabilly-green-plumage': 'squawkabilly',
    'squawkabilly-blue-plumage': 'squawkabillyblue',
    'squawkabilly-yellow-plumage': 'squawkabillyyellow',
    'squawkabilly-white-plumage': 'squawkabillywhite',
    'zygarde-10-power-construct': 'zygarde10',
    'zygarde-50-power-construct': 'zygarde',
    'darmanitan-galar-standard': 'darmanitangalar',
    'tauros-paldea-combat-breed': 'taurospaldeacombat',
    'tauros-paldea-blaze-breed': 'taurospaldeablaze',
    'tauros-paldea-aqua-breed': 'taurospaldeaaqua',
    'rockruff-own-tempo': 'rockruff',
    'pikachu-partner-cap': 'pikachupartner',
}

const canonical = (id: string) => {
    const sp = Dex.species.get(id)
    return sp.exists ? sp.id : id
}

const exists = {
    species: (id: string) => Dex.species.get(id).exists,
    move:    (id: string) => Dex.moves.get(id).exists,
    ability: (id: string) => Dex.abilities.get(id).exists,
    item:    (id: string) => Dex.items.get(id).exists,
}

/** PokeAPI 포켓몬 이름 → Showdown species id */
export function speciesToShowdown(slug: string): string {
    return canonical(speciesToShowdownRaw(slug))
}

function speciesToShowdownRaw(slug: string): string {
    const s = slug.toLowerCase()
    if (SPECIES_ALIAS[s]) return SPECIES_ALIAS[s]!
    const direct = toID(s)
    if (exists.species(direct)) return direct
    let t = s
        .replace(/-(male|normal|standard|incarnate|ordinary|aria|altered|land|shield|disguised|average|baile|midday|solo|red-striped|single-strike|amped|full-belly|zero|curly|two-segment|family-of-three|green-plumage|red-meteor|[a-z]+-meteor)$/, '')
        .replace(/-female$/, '-f')
        .replace(/-(limited|sprinting|swimming|gliding)-build$/, '')
        .replace(/-(low-power|drive|aquatic|glide)-mode$/, '')
        .replace(/-(original|hoenn|sinnoh|unova|kalos|alola|partner|world)-cap$/, '-$1')
        .replace(/-totem$/, 'totem')
    if (exists.species(toID(t))) return toID(t)
    // 뒤에서부터 폼 접미사를 하나씩 제거
    const parts = s.split('-')
    for (let n = parts.length - 1; n >= 1; n--) {
        t = parts.slice(0, n).join('-')
        if (exists.species(toID(t))) return toID(t)
    }
    return direct
}

export function moveToShowdown(slug: string): string {
    const id = toID(slug)
    if (exists.move(id)) return Dex.moves.get(id).id
    // Z기술 물리/특수 표기, 'hidden-power-fire' 등
    const stripped = toID(slug.replace(/--(physical|special)$/, ''))
    return stripped
}

export function abilityToShowdown(slug: string): string {
    const a = Dex.abilities.get(toID(slug))
    return a.exists ? a.id : toID(slug)
}

export function itemToShowdown(slug: string): string {
    const i = Dex.items.get(toID(slug))
    return i.exists ? i.id : toID(slug)
}

export function natureToShowdown(slug: string): string {
    const n = Dex.natures.get(toID(slug))
    return n.exists ? n.name : 'Hardy'
}

export function typeToShowdown(slug: string): string {
    const t = Dex.types.get(toID(slug))
    return t.exists ? t.name : slug.charAt(0).toUpperCase() + slug.slice(1)
}

/** Showdown 이름 → PokeAPI 형식 슬러그 ("King's Shield" → "kings-shield") */
export function toSlug(name: string): string {
    return name
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/['’.:%]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
}
