import { describe, it, expect, beforeAll } from 'vitest'
import { BattleEngine, createFormatter, fixParticles, getSpecies, koName, loadNames } from '../../index'
import type { BattleEvent, PokemonSet } from '../../index'

// 폼 이름: PokeAPI pokemon_form_names (+ 한국어가 비어 있는 폼은 scripts/fetch-pokeapi.ts 의 보충표)
describe('폼 이름 (ko / ja / en)', () => {
    beforeAll(() => loadNames('ja'))
    const ctx = { getPokemon: () => undefined }
    const name = (locale: string, slug: string) => createFormatter({ ...ctx, locale }).name.species(slug)

    const CASES: [string, string, string, string][] = [
        // slug, ko, ja, en (Showdown 이름)
        ['rotom-wash', '워시로토무', 'ウォッシュロトム', 'Rotom-Wash'],
        ['charizard-mega-x', '메가리자몽X', 'メガリザードンX', 'Charizard-Mega-X'],
        ['ninetales-alola', '나인테일 (알로라의 모습)', 'キュウコン (アローラのすがた)', 'Ninetales-Alola'],
        ['urshifu-rapid-strike', '우라오스 (연격의 태세)', 'ウーラオス (れんげきのかた)', 'Urshifu-Rapid-Strike'],
        ['ogerpon-wellspring-mask', '오거폰 (우물의가면)', 'オーガポン (いどのめん)', 'Ogerpon-Wellspring'],
        ['typhlosion-hisui', '블레이범 (히스이의 모습)', 'バクフーン (ヒスイのすがた)', 'Typhlosion-Hisui'],
    ]
    for (const [slug, ko, ja, en] of CASES) {
        it(slug, () => {
            expect(name('ko', slug)).toBe(ko)
            expect(name('ja', slug)).toBe(ja)
            expect(name('en', slug)).toBe(en)
        })
    }

    it('기본 모습은 종 이름, 테라스탈 오거폰은 가면 이름, 데이터에 없는 폼은 기본 종 이름', () => {
        expect(name('ko', 'urshifu-single-strike')).toBe('우라오스')
        expect(name('ko', 'rotom')).toBe('로토무')
        expect(name('ko', 'ogerpon-wellspring-tera')).toBe('오거폰 (우물의가면)')
        expect(name('ko', 'alcremie-ruby-swirl')).toBe('마휘핑')
        // Showdown 이름도 받는다
        expect(name('ko', 'Rotom-Wash')).toBe('워시로토무')
        expect(name('ja', 'Ninetales-Alola')).toBe('キュウコン (アローラのすがた)')
    })

    it('koName / getSpecies().nameKo 도 폼 이름', () => {
        expect(koName.species('rotom-wash')).toBe('워시로토무')
        expect(getSpecies('ninetales-alola')?.nameKo).toBe('나인테일 (알로라의 모습)')
        expect(getSpecies('ninetales')?.nameKo).toBe('나인테일')
    })

    it('조사: 괄호로 끝나는 이름·영문 끝 글자', () => {
        expect(fixParticles('나인테일 (알로라의 모습)은(는) 쓰러졌다!')).toBe('나인테일 (알로라의 모습)은 쓰러졌다!')
        expect(fixParticles('메가리자몽X이(가) 나왔다')).toBe('메가리자몽X가 나왔다')
        expect(fixParticles('폴리곤Z은(는)')).toBe('폴리곤Z는')
        expect(fixParticles('Pikachu은(는)')).toBe('Pikachu은(는)')
    })

    it('배틀 로그: 폼 이름, 메가진화는 "리자몽은 메가리자몽X로"', () => {
        const e = new BattleEngine({
            format: 'singles', gen: 7, seed: 1,
            p1: { name: 'A', team: [{ species: 'charizard', item: 'charizardite-x', ability: 'blaze', moves: ['flare-blitz'], level: 100 }] as unknown as PokemonSet[] },
            p2: { name: 'B', team: [{ species: 'rotom-wash', ability: 'levitate', moves: ['hydro-pump'], level: 100 }] as unknown as PokemonSet[] },
        })
        const events: BattleEvent[] = []
        e.on('*', ev => events.push(ev))
        e.start()
        e.submitAction({ type: 'move', player: 'p1', pokemon_id: 'p1_0', move_index: 0, mega: true })
        e.submitAction({ type: 'move', player: 'p2', pokemon_id: 'p2_0', move_index: 0 })
        const lines = (locale: string) => events.map(ev => createFormatter({ locale, getPokemon: id => e.getPokemon(id) }).format(ev))
        expect(lines('ko')).toContain('리자몽의 리자몽나이트X와 키스톤이 반응했다! 리자몽은 메가리자몽X로 메가진화했다!')
        expect(lines('ko')).toContain('상대 워시로토무의 하이드로펌프!')
        expect(lines('ja')).toContain('リザードンの リザードナイトＸと キーストーンが 反応した！ リザードンは メガリザードンXに メガシンカした！')
        expect(lines('en')).toContain("Charizard's Charizardite X is reacting to the Key Stone! Charizard has Mega Evolved into Mega Charizard!")
    })
})
