import { describe, it, expect } from 'vitest'
import { listItems, getItem, koName, BattleEngine } from '../../index'

describe('도구 목록: 레전즈 Z-A 메가스톤', () => {
    it('기본 목록에는 없고 include: Future 로 들어온다', () => {
        expect(listItems().some(i => i.name === 'lucarionite-z')).toBe(false)
        const fut = listItems({ include: ['Future'] })
        expect(fut.find(i => i.name === 'lucarionite-z')?.megaStone).toBe('lucario-mega-z')
        expect(fut.filter(i => i.megaStone).length).toBeGreaterThanOrEqual(40)
        expect(listItems().length).toBeLessThan(fut.length)
    })
    it('PokeAPI 에 없는 메가스톤·메가 모습의 한국어 이름', () => {
        expect(koName.item('lucarionite-z')).toBe('루카리오나이트Z')
        expect(koName.item('clefablite')).toBe('픽시나이트')
        expect(koName.item('charizardite-x')).toBe('리자몽나이트X')
        expect(koName.species('lucario-mega-z')).toBe('메가루카리오Z')
        expect(koName.species('raichu-mega-x')).toBe('메가라이츄X')
        expect(getItem('lucarionite-z')?.nameKo).toBe('루카리오나이트Z')
    })
    it('루카리오나이트Z 로 메가진화', () => {
        const set = (species: string, item?: string, move = 'tackle') => ({ species, level: 50, gender: null, ability: '', nature: 'hardy' as const, item, moves: [move] as [string] })
        const e = new BattleEngine({ format: 'singles', seed: 1, p1: { name: 'a', team: [set('lucario', 'lucarionite-z', 'aura-sphere')] }, p2: { name: 'b', team: [set('snorlax')] } })
        expect(e.getRequest('p1')).toMatchObject({ can_mega_evolve: true })
        e.submitActions({ type: 'move', player: 'p1', pokemon_id: 'p1_0', move_index: 0, mega: true }, { type: 'move', player: 'p2', pokemon_id: 'p2_0', move_index: 0 })
        expect(e.getPokemon('p1_0')!.species).toBe('lucario-mega-z')
    })
})
