// 세대별 배틀 기믹: 메가진화·원시회귀·울트라버스트·Z기술·다이맥스·거다이맥스의 요청·이벤트·문장
// 문장은 Showdown 클라이언트 문구(data/text/default.ts, battle-text-parser.ts)를 따른다.
import { describe, it, expect, beforeAll } from 'vitest'
import {
    BattleEngine, createFormatter, exportShowdownTeam, parseShowdownTeam, preloadData,
    type BattleEvent, type PokemonSet,
} from '../../index'

beforeAll(async () => { await preloadData({ gens: [8, 7] }) })

const FOE = 'Blissey\nLevel: 100\nAbility: Natural Cure\nEVs: 252 HP / 252 Def\n- Soft-Boiled\n- Whirlwind'

function battle(gen: 6 | 7 | 8, team: string, foe = FOE) {
    const e = new BattleEngine({
        format: 'singles', gen, seed: 1,
        p1: { name: 'A', team: parseShowdownTeam(team) }, p2: { name: 'B', team: parseShowdownTeam(foe) },
    })
    const events: BattleEvent[] = []
    e.on('*', ev => events.push(ev))
    e.start()
    const text = (locale = 'en') => {
        const f = createFormatter({ locale, getPokemon: id => e.getPokemon(id) })
        return events.map(ev => f.format(ev)).filter((t): t is string => !!t)
    }
    const turn = (flags: Record<string, boolean> = {}, move: 0 | 1 | 2 | 3 = 0, foeMove: 0 | 1 | 2 | 3 = 0) => {
        e.submitAction({ type: 'move', player: 'p1', pokemon_id: 'p1_0', move_index: move, ...flags })
        e.submitAction({ type: 'move', player: 'p2', pokemon_id: 'p2_0', move_index: foeMove })
    }
    const req = () => {
        const r = e.getRequest('p1')
        if (!r || r.type !== 'move') throw new Error('no move request')
        return r
    }
    return { e, events, text, turn, req }
}

describe('메가진화', () => {
    it('반응 → 메가진화 두 문장 (ko / en / ja)', () => {
        const b = battle(7, 'Charizard @ Charizardite Y\nAbility: Blaze\n- Flamethrower')
        expect(b.req().can_mega_evolve).toBe(true)
        b.turn({ mega: true })
        expect(b.text('en')).toContain("Charizard's Charizardite Y is reacting to the Key Stone! Charizard has Mega Evolved into Mega Charizard!")
        expect(b.text('ko')).toContain('리자몽의 리자몽나이트Y와(과) 키스톤이 반응했다! 리자몽은 메가리자몽Y로 메가진화했다!')
        // 폼 변화(forme_change)는 메가진화 이벤트 바로 앞, 특성도 메가 폼의 것
        const i = b.events.findIndex(ev => ev.type === 'mega_evolve')
        expect(b.events[i - 1]).toMatchObject({ type: 'forme_change', species: 'charizard-mega-y' })
        expect(b.e.getPokemon('p1_0')!.ability).toBe('drought')
        // 한 배틀에 한 번
        expect(b.req().can_mega_evolve).toBeFalsy()
    })

    it('레쿠쟈: 메가스톤 없이 화룡점정을 알면 (간절한 바람 문장), 모르면 안 된다', () => {
        const ok = battle(7, 'Rayquaza\nAbility: Air Lock\n- Dragon Ascent\n- Extreme Speed')
        expect(ok.req().can_mega_evolve).toBe(true)
        ok.turn({ mega: true })
        expect(ok.text('en')).toContain("Your team's fervent wish has reached Rayquaza! Rayquaza has Mega Evolved into Mega Rayquaza!")
        expect(ok.e.getPokemon('p1_0')!.species).toBe('rayquaza-mega')

        const no = battle(7, 'Rayquaza\nAbility: Air Lock\n- Outrage\n- Extreme Speed')
        expect(no.req().can_mega_evolve).toBeFalsy()
    })

    it('원시회귀: 버튼 없이 나오자마자 자동', () => {
        const b = battle(7, 'Groudon @ Red Orb\nAbility: Drought\n- Precipice Blades')
        expect(b.req().can_mega_evolve).toBeFalsy()
        const i = b.events.findIndex(ev => ev.type === 'mega_evolve')
        expect(b.events[i]).toMatchObject({ kind: 'primal', species: 'groudon-primal', item: 'red-orb' })
        expect(b.events.slice(0, i).some(ev => ev.type === 'switch' && ev.in_id === 'p1_0')).toBe(true)
        expect(b.text('en')).toContain("Groudon's Primal Reversion! It reverted to its primal state!")
        expect(b.text('ko')).toContain('그란돈의 원시회귀! 원시의 모습을 되찾았다!')
    })

    it('울트라버스트 (네크로즈마 + 울트라네크로Z)', () => {
        const b = battle(7, 'Necrozma-Dusk-Mane @ Ultranecrozium Z\nAbility: Prism Armor\n- Sunsteel Strike\n- Photon Geyser')
        expect(b.req().can_ultra_burst).toBe(true)
        b.turn({ ultra_burst: true })
        expect(b.e.getPokemon('p1_0')!.species).toBe('necrozma-ultra')
        expect(b.text('en')).toContain('Bright light is about to burst out of Necrozma! Necrozma regained its true power through Ultra Burst!')
    })

    it('6세대: 메가진화는 되고 Z기술은 없다', () => {
        const b = battle(6, 'Lucario @ Lucarionite\nAbility: Justified\n- Aura Sphere')
        expect(b.req().can_mega_evolve).toBe(true)
        expect(b.req().can_zmove).toBeFalsy()
    })
})

describe('Z기술', () => {
    it('공격 Z기술: Z파워 → 전력의 Z기술 → 기술 이름', () => {
        const b = battle(7, 'Pikachu @ Electrium Z\nAbility: Static\n- Thunderbolt\n- Growl')
        expect(b.req().can_zmove).toBe(true)
        expect(b.req().moves[0]!.zmove).toBeTruthy()
        expect(b.req().moves[1]!.zmove).toBeFalsy()
        b.turn({ zmove: true })
        const en = b.text('en')
        expect(en).toContain('Pikachu surrounded itself with its Z-Power!')
        expect(en).toContain('Pikachu unleashes its full-force Z-Move! Pikachu used Gigavolt Havoc!')
        expect(b.text('ko')).toContain('피카츄는 전력의 Z기술을 펼친다! 피카츄의 스파킹기가볼트!')
        expect(b.req().can_zmove).toBeFalsy()
    })

    it('전용 Z기술 (피카츄Z → 필살피카슛)', () => {
        const b = battle(7, 'Pikachu @ Pikanium Z\nAbility: Static\n- Volt Tackle')
        expect(b.req().moves[0]!.zmove).toMatch(/catastropika/)
        b.turn({ zmove: true })
        expect(b.text('en')).toContain('Pikachu unleashes its full-force Z-Move! Pikachu used Catastropika!')
    })

    it('변화 Z기술의 추가 효과: 랭크 상승 / Z저주 (고스트는 회복)', () => {
        const b = battle(7, 'Clefable @ Fairium Z\nAbility: Magic Guard\n- Moonblast\n- Baby-Doll Eyes')
        b.turn({ zmove: true }, 1)
        expect(b.text('en')).toContain("Clefable boosted its Defense using its Z-Power!")
        expect(b.text('en')).toContain('Clefable used Z-Baby-Doll Eyes!')
        const ghost = battle(7, 'Gengar @ Ghostium Z\nAbility: Cursed Body\n- Curse\n- Shadow Ball')
        ghost.turn({ zmove: true })
        // 고스트 타입의 Z저주: HP 회복 효과 (HP 가 가득이면 문장이 없다) — 기술은 Z저주
        expect(ghost.text('en')).toContain('Gengar used Z-Curse!')
        const normal = battle(7, 'Snorlax @ Ghostium Z\nAbility: Thick Fat\n- Curse')
        normal.turn({ zmove: true })
        expect(normal.text('en')).toContain('Snorlax boosted its Attack using its Z-Power!')
    })
})

describe('다이맥스·거다이맥스', () => {
    it('다이맥스: 3턴, HP 는 문장 없이 늘고 줄며, 끝나면 원래 크기로', () => {
        const b = battle(8, 'Garchomp @ Leftovers\nAbility: Rough Skin\n- Earthquake\n- Swords Dance')
        expect(b.req().can_dynamax).toBe(true)
        const before = b.e.getPokemon('p1_0')!.max_hp
        b.turn({ dynamax: true })
        const p = b.e.getPokemon('p1_0')!
        expect(p.volatile_statuses.dynamax?.turns_remaining).toBe(2)
        expect(p.max_hp).toBe(before * 2)
        b.turn(); b.turn()
        expect(b.e.getPokemon('p1_0')!.volatile_statuses.dynamax).toBeUndefined()
        const en = b.text('en')
        expect(en).toContain('Garchomp Dynamaxed!')
        expect(en).toContain('Garchomp used Max Quake!')
        expect(en).toContain('Garchomp returned to its normal size!')
        // 최대 HP 변화는 데미지·회복 문장이 아니다
        const hp = b.events.filter(ev => (ev.type === 'heal' || ev.type === 'damage') && ev.source === 'dynamax')
        expect(hp.length).toBe(2)
        expect(en.some(t => /^Garchomp restored \d+ HP$/.test(t))).toBe(false)
    })

    it('변화 기술은 다이월 (Max Guard)', () => {
        const b = battle(8, 'Garchomp\nAbility: Rough Skin\n- Swords Dance')
        b.turn({ dynamax: true })
        expect(b.text('en')).toContain('Garchomp used Max Guard!')
    })

    it('다이맥스 포켓몬은 날려버리기에 끌려 나가지 않는다', () => {
        const b = battle(8, 'Garchomp\nAbility: Rough Skin\n- Earthquake\n\nPikachu\nAbility: Static\n- Thunderbolt', FOE)
        b.turn({ dynamax: true }, 0, 1)
        expect(b.text('en')).toContain('The move was blocked by the power of Dynamax!')
    })

    it('거다이맥스: Gigantamax: Yes → 거다이맥스 문장과 거다이맥스 기술', () => {
        const team = 'Charizard @ Life Orb\nAbility: Blaze\nGigantamax: Yes\n- Flamethrower'
        const set = parseShowdownTeam(team)[0]!
        expect(set.gigantamax).toBe(true)
        expect(exportShowdownTeam([set])).toContain('Gigantamax: Yes')
        const b = battle(8, team)
        b.turn({ dynamax: true })
        expect(b.events.find(ev => ev.type === 'volatile_apply' && ev.volatile === 'dynamax')).toMatchObject({ gmax: true })
        const en = b.text('en')
        expect(en).toContain('Charizard Gigantamaxed!')
        expect(en).toContain('Charizard used G-Max Wildfire!')
        expect(b.text('ko')).toContain('리자몽이 거다이맥스했다!')
    })

    it('거다이맥스 플래그가 없으면 보통 다이맥스 기술', () => {
        const b = battle(8, 'Charizard\nAbility: Blaze\n- Flamethrower')
        b.turn({ dynamax: true })
        expect(b.text('en')).toContain('Charizard used Max Flare!')
    })

    it('자시안·자마젠타·무한다이노는 다이맥스할 수 없다', () => {
        for (const sp of ['Zacian-Crowned @ Rusted Sword\nAbility: Intrepid Sword', 'Eternatus\nAbility: Pressure']) {
            const b = battle(8, `${sp}\n- Tackle`)
            expect(b.req().can_dynamax).toBeFalsy()
        }
    })

    it('8세대 랜덤 팀의 거다이맥스 세트는 플래그를 유지한다', async () => {
        const { generateRandomTeam } = await import('../../index')
        let found: PokemonSet | undefined
        for (let seed = 1; seed < 60 && !found; seed++) {
            found = generateRandomTeam({ seed, format: 'gen8randombattle' }).find(s => s.gigantamax)
        }
        expect(found).toBeTruthy()
        expect(found!.species).not.toMatch(/-gmax$/)
    })
})

describe('데미지 미리보기: 기믹을 고른 경우', () => {
    it('Z기술·다이맥스·거다이맥스·메가진화의 기술과 위력', () => {
        const z = battle(7, 'Pikachu @ Pikanium Z\nAbility: Static\n- Volt Tackle\n- Thunderbolt')
        expect(z.e.previewDamage('p1', 0, { zmove: true })).toMatchObject({ moveName: 'catastropika', basePower: 210 })
        expect(z.e.previewDamage('p1', 0)).toMatchObject({ moveName: 'volt-tackle', basePower: 120 })
        const zt = battle(7, 'Raichu @ Electrium Z\nAbility: Static\n- Thunderbolt')
        expect(zt.e.previewDamage('p1', 0, { zmove: true })).toMatchObject({ moveName: 'gigavolt-havoc--special', basePower: 175 })

        const d = battle(8, 'Charizard\nAbility: Blaze\n- Flamethrower')
        expect(d.e.previewDamage('p1', 0, { dynamax: true })).toMatchObject({ moveName: 'max-flare', basePower: 130 })
        const g = battle(8, 'Charizard\nAbility: Blaze\nGigantamax: Yes\n- Flamethrower')
        expect(g.e.previewDamage('p1', 0, { dynamax: true })).toMatchObject({ moveName: 'g-max-wildfire', basePower: 130 })
        // 다이맥스 중에는 고르지 않아도 다이맥스 기술
        g.turn({ dynamax: true })
        expect(g.e.previewDamage('p1', 0)).toMatchObject({ moveName: 'g-max-wildfire' })

        const m = battle(7, 'Charizard @ Charizardite X\nAbility: Blaze\n- Dragon Claw')
        const base = m.e.previewDamage('p1', 0)!
        const mega = m.e.previewDamage('p1', 0, { mega: true })!
        expect(mega.isSTAB).toBe(true)
        expect(base.isSTAB).toBe(false)
        expect(mega.max).toBeGreaterThan(base.max)
    })
})
