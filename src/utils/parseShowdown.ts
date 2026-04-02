import type { PokemonSet, EVs, IVs, Nature } from '../types/pokemon'

export function parseShowdown(text: string): PokemonSet {
    const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean)

    const moves: string[] = []
    let species = ''
    let nickname: string | undefined
    let item: string | undefined
    let ability = ''
    let nature: Nature = 'hardy'
    let teraType: string | undefined
    let shiny = false
    let gender: 'M' | 'F' | null = null
    const evs: EVs = {}
    const ivs: IVs = {}

    // 첫 줄: "Nickname (Species) (Gender) @ Item"
    const firstLine = lines[0]!
    const atSplit = firstLine.split(' @ ')
    item = atSplit[1]?.trim()

    const left = atSplit[0]!.trim()
    // 성별 파싱
    const genderMatch = left.match(/\(([MF])\)\s*$/)
    if (genderMatch) {
        gender = genderMatch[1] as 'M' | 'F'
    }

    // 종족명 + 닉네임 파싱
    // "Dragonite (M)" → species: dragonite, gender: M
    // "Garganacl" → species: garganacl
    // "Tornadus-Therian" → species: tornadus-therian
    const speciesMatch = left.replace(/\s*\([MF]\)\s*$/, '').trim()
    // 닉네임이 있는 경우: "Nickname (Species)"
    const nicknameMatch = speciesMatch.match(/^(.+?)\s+\((.+)\)$/)
    if (nicknameMatch) {
        nickname = nicknameMatch[1]!.trim()
        species = nicknameMatch[2]!.trim().toLowerCase().replace(' ', '-')
    } else {
        species = speciesMatch.toLowerCase().replace(' ', '-')
    }

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i]!

        if (line.startsWith('- ')) {
            moves.push(line.slice(2).trim().toLowerCase().replace(' ', '-'))
            continue
        }

        const [key, ...rest] = line.split(':')
        const value = rest.join(':').trim()

        if (key === 'Ability')     ability = value.toLowerCase().replace(' ', '-')
        if (key === 'Shiny')       shiny = value === 'Yes'
        if (key === 'Tera Type')   teraType = value.toLowerCase()
        if (key === 'Nature')      // "Careful Nature"는 아래에서 처리
        {}
        if (line.endsWith('Nature')) {
            nature = line.replace(' Nature', '').trim().toLowerCase() as Nature
        }
        if (key === 'EVs') {
            value.split('/').map(s => s.trim()).forEach(entry => {
                const [num, stat] = entry.split(' ')
                const mapped = mapStat(stat!)
                if (mapped) (evs as any)[mapped] = parseInt(num!)
            })
        }
        if (key === 'IVs') {
            value.split('/').map(s => s.trim()).forEach(entry => {
                const [num, stat] = entry.split(' ')
                const mapped = mapStat(stat!)
                if (mapped) (ivs as any)[mapped] = parseInt(num!)
            })
        }
    }

    return {
        species,
        nickname,
        level: 50,
        gender,
        ability,
        nature,
        item,
        teraType,
        shiny,
        moves: moves as PokemonSet['moves'],
        evs,
        ivs,
    }
}

// 여러 세트 한 번에 파싱
export function parseShowdownTeam(text: string): PokemonSet[] {
    return text
        .split(/\n\n+/)
        .map(s => s.trim())
        .filter(Boolean)
        .map(parseShowdown)
}

function mapStat(raw: string): keyof EVs | null {
    const map: Record<string, keyof EVs> = {
        'HP':  'hp',
        'Atk': 'attack',
        'Def': 'defense',
        'SpA': 'special_attack',
        'SpD': 'special_defense',
        'Spe': 'speed',
    }
    return map[raw] ?? null
}