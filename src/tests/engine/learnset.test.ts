import { describe, it, expect, beforeAll } from 'vitest'
import { getItem, getLearnset, getSpecies, listItems, preloadData, moveToShowdown } from '../../index'
import { TeamValidator, Dex } from '@pkmn/sim'

describe('getLearnset', () => {
    beforeAll(() => preloadData({ gens: [7] }))

    it('종 자신 + 기본 폼 (로토무 폼은 로토무 기술표를 물려받는다)', () => {
        const wash = getLearnset('rotom-wash')
        expect(wash).toContain('hydro-pump')        // 워시로토무 전용
        expect(wash).toContain('thunderbolt')       // 로토무 기본 폼에서
        expect(getLearnset('rotom')).not.toContain('hydro-pump')
        expect(wash).toEqual([...wash].sort())
        expect(new Set(wash).size).toBe(wash.length)
    })

    it('진화 전(prevo) 기술 포함, 리전 폼은 원래 종 기술표를 섞지 않는다', () => {
        expect(getLearnset('raichu')).toContain('volt-tackle')     // 피카츄·피츄에서
        const alola = getLearnset('ninetales-alola')
        expect(alola).toContain('freeze-dry')
        expect(alola).not.toContain('flamethrower')
        expect(getLearnset('ninetales')).toContain('flamethrower')
    })

    it('기술표가 없는 폼은 기본 폼, Showdown 이름도 받는다', () => {
        expect(getLearnset('charizard-mega-x')).toEqual(getLearnset('charizard'))
        expect(getLearnset('Urshifu-Rapid-Strike')).toContain('surging-strikes')
        expect(getLearnset('urshifu-rapid-strike')).not.toContain('wicked-blow')
    })

    it('9세대에 없는 기술은 빠지고, 세대를 고르면 그 세대 기준', () => {
        expect(getLearnset('garchomp')).not.toContain('return')     // 9세대에 없음
        expect(getLearnset('garchomp', { gen: 7 })).toContain('return')
        expect(getLearnset('garchomp')).toContain('earthquake')
    })

    it('Showdown 검증기가 허용하는 기술과 같다 (표본)', () => {
        const v = TeamValidator.get('gen9customgame')
        for (const species of ['garchomp', 'rotom-wash', 'ninetales-alola', 'pikachu', 'dragapult']) {
            const sp = Dex.species.get(getSpecies(species)!.showdown)
            const learn = getLearnset(species)
            for (const move of learn) expect(v.checkCanLearn(Dex.moves.get(moveToShowdown(move)), sp), `${species} ${move}`).toBe(null)
            // 반대로: 기술표에 없는 기술은 검증기도 막는다 (표본)
            for (const move of ['spore', 'shell-smash', 'v-create']) if (!learn.includes(move)) expect(v.checkCanLearn(Dex.moves.get(moveToShowdown(move)), sp)).not.toBe(null)
        }
    })

    it('모르는 종은 오류', () => {
        expect(() => getLearnset('not-a-pokemon')).toThrow(/알 수 없는/)
    })
})

describe('listItems / getItem', () => {
    it('9세대 도구 (몬스터볼·메가스톤 제외), 한국어 이름', () => {
        const items = listItems()
        const names = items.map(i => i.name)
        expect(names).toContain('choice-scarf')
        expect(names).toContain('leftovers')
        expect(names).toContain('sitrus-berry')
        expect(names).not.toContain('poke-ball')
        expect(names).not.toContain('charizardite-x')
        expect(getItem('leftovers')).toMatchObject({ name: 'leftovers', showdown: 'Leftovers', nameKo: '먹다남은음식', berry: false })
        expect(getItem('sitrus-berry')?.berry).toBe(true)
        expect(getItem('nope')).toBeUndefined()
    })

    it('7세대는 메가스톤·Z크리스탈 포함', () => {
        const names = listItems({ gen: 7 }).map(i => i.name)
        expect(names).toContain('charizardite-x')
        expect(getItem('charizardite-x')?.megaStone).toBe('charizard-mega-x')
        expect(names.some(n => n.endsWith('-z') || n.includes('ium-z'))).toBe(true)
    })

    it('getSpecies().abilities 에 숨겨진 특성', () => {
        expect(getSpecies('garchomp')!.abilities).toEqual([
            { name: 'sand-veil', hidden: false, slot: 1 }, { name: 'rough-skin', hidden: true, slot: 3 },
        ])
    })
})
