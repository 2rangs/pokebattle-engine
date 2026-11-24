// 배틀 옵션: 프리셋 → 엔진 규칙, 팀 규칙 검사, 리플레이(옵션·자유 능력치) 왕복, 팀 프리뷰 흐름, 샌드박스
import { beforeAll, describe, expect, test } from 'vitest'
import { BattleEngine, parseShowdownTeam, preloadData, type PokemonSet } from './engine'
import {
  applyLevel, defaultOptions, engineOptions, fitClauses, levelFor, normalizeOptions, optionsSummary, presetOptions, sandboxEngineOptions,
  sandboxPreset, sandboxSet, startErrorLines, teamRuleIssues, withOption, withSandbox,
} from './options'
import { buildReplayData, controllerAI, createEngine, previewPick, simulateReplay, type BattleSetup } from './frames'
import { decodeReplay, encodeReplay } from './replay'
import { randomTeam } from './team'
import { msg } from './messages'
import { sandboxRandomTeam } from './sandbox'

beforeAll(() => preloadData({ gens: [1, 7, 8] }), 120_000)

const t = (k: Parameters<typeof msg>[1], v?: Parameters<typeof msg>[2]) => msg('en', k, v)

describe('프리셋 → 엔진 규칙 (Showdown 규칙 이름)', () => {
  test('자유: 엔진 기본 + Lv.50', () => {
    expect(engineOptions(defaultOptions(9), 9)).toEqual({ level: 50 })
  })
  test('대회식 6→3: 팀 프리뷰 3마리, Lv.50, 같은 종·같은 도구', () => {
    const o = presetOptions('flat', 9)
    expect([o.teamSize, o.pick]).toEqual([6, 3])
    expect(engineOptions(o, 9)).toEqual({ pickedTeamSize: 3, level: 50, speciesClause: true, itemClause: true })
    // 1세대에는 도구가 없어 같은 도구 금지도 없다
    expect(engineOptions(presetOptions('flat', 1), 1)).toEqual({ pickedTeamSize: 3, level: 50, speciesClause: true })
  })
  test('Smogon: 5세대부터 팀 프리뷰, 8세대는 다이맥스 금지', () => {
    const base = { level: 100, speciesClause: true, sleepClause: true, ohkoClause: true, evasionClause: true, endlessBattleClause: true }
    expect(engineOptions(presetOptions('smogon', 4), 4)).toEqual(base)
    expect(engineOptions(presetOptions('smogon', 9), 9)).toEqual({ teamPreview: true, ...base })
    expect(engineOptions(presetOptions('smogon', 8), 8)).toEqual({ teamPreview: true, ...base, dynamax: false })
  })
  test('기믹 끄기는 그 세대에 있는 것만 규칙이 된다', () => {
    const off = { tera: false, mega: false, zmove: true, dynamax: false }
    const o = withOption(defaultOptions(7), { gimmicks: off }, 7)
    expect(engineOptions(o, 7)).toEqual({ level: 50, megaEvolution: false })
    expect(engineOptions(withOption(defaultOptions(9), { gimmicks: off }, 9), 9)).toEqual({ level: 50, terastal: false })
    expect(engineOptions(withOption(defaultOptions(3), { gimmicks: off }, 3), 3)).toEqual({ level: 50 })
  })
  test('세부 설정을 바꾸면 "직접 설정", 프리셋과 같아지면 그 프리셋', () => {
    const o = withOption(defaultOptions(9), { level: 100 }, 9)
    expect(o.preset).toBe('custom')
    expect(withOption(o, { level: 50 }, 9).preset).toBe('free')
    expect(withOption(defaultOptions(9), { teamSize: 1 }, 9).pick).toBeNull()
  })
  test('저장값 정리: 모르는 값은 기본으로', () => {
    expect(normalizeOptions({ teamSize: 7, pick: 9, level: 3, clauses: { species: 'yes' } }, 9)).toEqual(defaultOptions(9))
    expect(normalizeOptions(presetOptions('flat', 9), 9)).toEqual(presetOptions('flat', 9))
  })
  test('한 줄 요약', () => {
    expect(optionsSummary(presetOptions('flat', 9), 9, t)).toBe('Tournament 6→3 · 3 of 6 · Lv. 50 · Gimmicks on · 2 clauses')
    expect(optionsSummary(withOption(defaultOptions(7), { gimmicks: { tera: true, mega: false, zmove: true, dynamax: true } }, 7), 7, t)).toContain('Z-Moves')
  })
  test('레벨 규칙: 랜덤배틀 균형 레벨', () => {
    expect(levelFor('slaking', 'balanced', 9)).toBeGreaterThan(levelFor('koraidon', 'balanced', 9))
    expect(applyLevel([null, { species: 'pikachu', level: 50 } as PokemonSet], 100, 9)[1]!.level).toBe(100)
  })
})

describe('팀 규칙 검사 (시작 전)', () => {
  const set = (species: string, item?: string, moves: string[] = ['tackle'], ability = ''): PokemonSet =>
    ({ species, level: 50, gender: null, ability, nature: 'hardy', item, moves } as unknown as PokemonSet)
  test('같은 종·같은 도구·일격기·회피', () => {
    const o = { ...defaultOptions(9), clauses: { species: true, item: true, sleep: false, ohko: true, evasion: true, endless: false } }
    const issues = teamRuleIssues([set('pikachu', 'leftovers'), set('pikachu', 'leftovers', ['sheer-cold']), set('garchomp', 'bright-powder', ['double-team'], 'sand-veil')], o, 9, 'en')
    expect(issues.map(i => i.key)).toEqual(['clauseSpeciesIssue', 'clauseItemIssue', 'clauseOhkoIssue', 'clauseEvasionIssue', 'clauseEvasionIssue', 'clauseEvasionIssue'])
    expect(t(issues[0]!.key, issues[0]!.vars)).toBe('Species Clause: Pikachu (slots 1 and 2)')
  })
  test('랜덤 팀은 같은 도구 금지에 맞춘다', () => {
    const o = presetOptions('flat', 9)
    const team = fitClauses(randomTeam(5, 6, 50, 9), o, 9)
    expect(teamRuleIssues(team, { ...o, clauses: { ...o.clauses, species: false } }, 9, 'en')).toEqual([])
  })
  test('엔진도 같은 규칙으로 거절한다 (BattleError → 보기 좋은 줄)', () => {
    const team = parseShowdownTeam('Pikachu\n- Thunderbolt\n\nPikachu\n- Thunderbolt')
    const e = new BattleEngine({ format: 'singles', seed: 1, options: { speciesClause: true }, p1: { name: 'a', team }, p2: { name: 'b', team: team.slice(0, 1) } })
    let message = ''
    try { e.start() } catch (err) { message = (err as Error).message }
    expect(message).toMatch(/Species Clause/)
    expect(startErrorLines(message)[0]).toMatch(/Species Clause/)
  })
})

describe('리플레이: 옵션과 자유 능력치 (예전 링크는 기본값)', () => {
  test('옵션·팀 프리뷰 행동이 왕복하고 같은 배틀이 재현된다', async () => {
    const flat = presetOptions('flat', 9)
    const team = (seed: number) => fitClauses(randomTeam(seed, 6, 50, 9), flat, 9) as PokemonSet[]
    const setup: BattleSetup = { rule: 'normal', seed: 7, p1Team: team(1), p2Team: team(2), options: engineOptions(flat, 9) }
    const ctrl = { p1: 'normal', p2: 'hard' } as const
    const e = createEngine(setup, ctrl)
    e.start()
    expect(e.getState().phase).toBe('team_preview')
    const ais = { p1: controllerAI('normal', 'normal', 7, 'p1'), p2: controllerAI('normal', 'hard', 7, 'p2') }
    const actions = []
    for (let i = 0; i < 400 && e.getState().phase !== 'ended'; i++) {
      for (const p of ['p1', 'p2'] as const) {
        if (!e.getRequest(p) && !e.getTeamPreview(p)) continue
        const a = ais[p].chooseAction(e, p) ?? e.getAvailableActions(p)[0]!
        e.submitAction(a)
        actions.push(a)
      }
    }
    expect(actions[0]).toMatchObject({ type: 'team' })
    expect((actions[0] as { order: string[] }).order).toHaveLength(3)
    // 출전한 3마리만 배틀에 나온다
    expect(e.getState().sides.p1.team).toHaveLength(3)
    const data = await decodeReplay(await encodeReplay(buildReplayData(setup, ctrl, actions)))
    expect(data.options).toEqual({ pickedTeamSize: 3, level: 50, speciesClause: true, itemClause: true })
    const sim = simulateReplay(data)
    expect(sim.error).toBeUndefined()
    expect(sim.winner).toBe(e.getState().winner)
  })

  test('옵션이 없는 예전 링크', async () => {
    const setup: BattleSetup = { rule: 'normal', seed: 3, p1Team: randomTeam(1, 1, 50, 9), p2Team: randomTeam(2, 1, 50, 9) }
    const data = await decodeReplay(await encodeReplay(buildReplayData(setup, { p1: 'easy', p2: 'easy' }, [])))
    expect(data.options).toBeUndefined()
  })

  test('잘못된 옵션은 거절', async () => {
    const setup: BattleSetup = { rule: 'normal', seed: 3, p1Team: randomTeam(1, 1, 50, 9), p2Team: randomTeam(2, 1, 50, 9), options: { level: 50 } }
    const data = buildReplayData(setup, { p1: 'easy', p2: 'easy' }, [])
    await expect(decodeReplay(await encodeReplay({ ...data, options: { evil: true } as never }))).rejects.toThrow(/bad option/)
  })

  test('자유 능력치(샌드박스)도 링크에 실린다', async () => {
    const team = randomTeam(4, 2, 50, 9).map((s, i) => (i === 0 ? { ...s, customStats: { hp: 999, speed: 1 } } : s))
    const setup: BattleSetup = { rule: 'normal', seed: 3, p1Team: team, p2Team: randomTeam(5, 2, 50, 9), options: { stackGimmicks: true } }
    const data = await decodeReplay(await encodeReplay(buildReplayData(setup, { p1: 'easy', p2: 'easy' }, [])))
    expect(data.p1.stats).toEqual([{ hp: 999, speed: 1 }, null])
    const sim = simulateReplay(data)
    expect(sim.frames[0]!.p1.team[0]!.max_hp).toBe(999)
  })
})

describe('팀 프리뷰: CPU 선택', () => {
  test('상성 좋은 포켓몬부터 (쉬움은 파티 순서)', () => {
    const mine = parseShowdownTeam('Charmander\n- Ember\n\nSquirtle\n- Water Gun\n\nBulbasaur\n- Vine Whip')
    const foe = parseShowdownTeam('Sandshrew\n- Scratch\n\nGeodude\n- Tackle')
    const e = new BattleEngine({ format: 'singles', seed: 1, options: { pickedTeamSize: 1 }, p1: { name: 'a', team: mine }, p2: { name: 'b', team: foe } })
    e.start()
    const smart = previewPick(e, 'p1', true) as { order: string[] }
    expect(e.getPokemon(smart.order[0]!)!.species).not.toBe('charmander')
    expect((previewPick(e, 'p1', false) as { order: string[] }).order).toEqual(['p1_0'])
  })
})

describe('샌드박스', () => {
  test('메가·원시·울트라 모습은 거다이맥스 모습이 없다 (그대로 다이맥스)', async () => {
    const { gmaxForm } = await import('./gimmick')
    expect(gmaxForm('charizard')).toBe('charizard-gmax')
    expect(gmaxForm('charizard-mega-y')).toBeNull()
    expect(gmaxForm('necrozma-ultra')).toBeNull()
  })
  test('토글 → 엔진 옵션·세트', () => {
    expect(sandboxEngineOptions(sandboxPreset('allGimmicks'))).toEqual({ stackGimmicks: true })
    expect(sandboxEngineOptions(sandboxPreset('metronome'))).toEqual({})
    const s = { species: 'pikachu', level: 7, customStats: { hp: 5 } } as unknown as PokemonSet
    expect(sandboxSet(s, sandboxPreset('allGimmicks'))).toEqual({ species: 'pikachu', level: 50 })
    expect(sandboxSet(s, sandboxPreset('freeform'))).toEqual(s)
    expect(withSandbox(sandboxPreset('allGimmicks'), { freeLevel: true }).preset).toBe('custom')
  })
  test('랜덤 팀: 메가스톤·Z크리스탈(7세대)·거다이맥스(8세대) + 테라 타입, 겹치기 배틀이 돌아간다', () => {
    const team = sandboxRandomTeam(11, 6)
    expect(team).toHaveLength(6)
    expect(team.every(s => s.teraType)).toBe(true)
    const setup: BattleSetup = { rule: 'normal', seed: 9, p1Team: team, p2Team: sandboxRandomTeam(12, 6), options: { stackGimmicks: true } }
    const e = createEngine(setup, { p1: 'hard', p2: 'hard' })
    e.start()
    const ais = { p1: controllerAI('normal', 'hard', 9, 'p1'), p2: controllerAI('normal', 'hard', 9, 'p2') }
    for (let i = 0; i < 600 && e.getState().phase !== 'ended'; i++) {
      for (const p of ['p1', 'p2'] as const) if (e.getRequest(p)) e.submitAction(ais[p].chooseAction(e, p) ?? e.getAvailableActions(p)[0]!)
    }
    expect(e.getState().phase).toBe('ended')
  })
})
