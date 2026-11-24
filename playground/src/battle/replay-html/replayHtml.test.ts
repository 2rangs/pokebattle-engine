import { beforeAll, expect, test } from 'vitest'
import type { Action, PlayerID, PokemonSet } from '../lib/engine'
import { buildReplayData, controllerAI, createEngine, frameText, simulateReplay, type BattleSetup } from '../lib/frames'
import { decodeReplay, encodeReplay, type ReplayData } from '../lib/replay'
import { randomTeam } from '../lib/team'
import { ready } from '../lib/setup.test-util'
import { buildReplayHtml, esc, extractEmbeddedReplay, replayFileName } from './replayHtml'

beforeAll(ready)

/** CPU 끼리 한 판 → 리플레이 데이터 */
function cpuBattle(setup: BattleSetup, ctrl: { p1: 'human' | 'normal'; p2: 'normal' }): ReplayData {
  const e = createEngine(setup, ctrl)
  e.start()
  const ais = { p1: controllerAI(setup.rule, 'normal', setup.seed, 'p1'), p2: controllerAI(setup.rule, 'normal', setup.seed, 'p2') }
  const actions: Action[] = []
  for (let n = 0; e.getState().phase !== 'ended' && n < 800; n++) {
    for (const p of ['p1', 'p2'] as PlayerID[]) {
      if (!e.getRequest(p)) continue
      const a = ais[p].chooseAction(e, p) ?? e.getAvailableActions(p)[0]!
      e.submitAction(a)
      actions.push(a)
    }
  }
  return buildReplayData(setup, ctrl, actions)
}

const viewerBase = 'https://example.test/portfolio/pokebattle-engine/#/battle/replay?d='
const demoUrl = 'https://example.test/portfolio/pokebattle-engine/#/battle'
const when = new Date(2026, 10, 24, 9, 5)

async function build(data: ReplayData, lang: 'ko' | 'en') {
  const encoded = await encodeReplay(data)
  const sim = simulateReplay(data)
  return { encoded, sim, ...buildReplayHtml({ data, encoded, sim, lang, viewerBase, demoUrl, savedAt: when }) }
}

test('teams, winner, log lines and embedded data (en)', async () => {
  const setup: BattleSetup = { rule: 'normal', seed: 404, p1Team: randomTeam(11, 3), p2Team: randomTeam(12, 3) }
  const data = cpuBattle(setup, { p1: 'human', p2: 'normal' })
  const { html, encoded, sim, filename } = await build(data, 'en')
  expect(sim.winner).not.toBeNull()
  expect(filename).toBe('pokebattle-replay-you-vs-cpu-2026-11-24-0905.html')
  expect(html).toMatch(/^<!doctype html>/)
  expect(html).toContain('<html lang="en">')
  expect(html).toContain(sim.winner === 'p1' ? 'You won!' : 'You lost…')
  expect(html).toContain(`${sim.turns} turns`)
  expect(html).toContain('Standard · Gen 9')
  // 모든 로그 문장 (데모 로그와 같은 문장, HTML 이스케이프)
  const lines = sim.frames.filter(f => f.event.type !== 'turn_start').map(f => frameText(f, 'en')).filter((x): x is string => x !== null)
  expect(lines.length).toBeGreaterThan(10)
  for (const l of lines) expect(html).toContain(esc(l))
  expect(html).toContain(esc(lines.at(-1)!))
  // 두 팀의 포켓몬·기술
  for (const p of ['p1', 'p2'] as const) {
    for (const mon of sim.frames[0]![p].team) expect(html).toContain(`Lv.${mon.level}`)
  }
  // 뷰어 링크 + 내장 데이터 → 같은 리플레이
  expect(html).toContain(`href="${viewerBase}${encoded}"`)
  const emb = extractEmbeddedReplay(html)
  expect(emb).toEqual({ v: 1, d: encoded })
  expect(await decodeReplay(emb!.d)).toEqual(data)
  // 오프라인 정적 부분: 외부 스크립트 없음
  expect(html).not.toMatch(/<script[^>]+src=/)
  expect(html).toContain('github.com/2rangs/pokebattle-engine')
  expect(html).toContain('Unofficial fan demo')
  expect(html.length).toBeLessThan(100_000)
})

test('Korean text follows the language', async () => {
  const setup: BattleSetup = { rule: 'normal', seed: 505, p1Team: randomTeam(21, 2), p2Team: randomTeam(22, 2) }
  const data = cpuBattle(setup, { p1: 'normal', p2: 'normal' })
  const { html, sim, filename } = await build(data, 'ko')
  expect(filename).toContain('cpu-1-vs-cpu-2')
  expect(html).toContain('<html lang="ko">')
  expect(html).toContain('애니메이션으로 보기')
  expect(html).toContain('배틀 로그')
  expect(html).toContain('일반 배틀 · 9세대')
  const name = sim.winner === 'p1' ? 'CPU 1' : 'CPU 2'
  expect(html).toContain(`${name}의 승리!`)
  const spect = (p: PlayerID) => (p === 'p1' ? 'CPU 1' : 'CPU 2')
  for (const f of sim.frames.filter(x => x.event.type !== 'turn_start')) {
    const l = frameText(f, 'ko', spect)
    if (l) expect(html).toContain(esc(l))
  }
})

test('nicknames are HTML-escaped (no markup injection)', async () => {
  const evil = '<img onerror=a(1)>' // 닉네임은 18자까지
  const team = randomTeam(31, 1)
  const p1Team: PokemonSet[] = [{ ...team[0]!, nickname: evil }]
  const setup: BattleSetup = { rule: 'normal', seed: 606, p1Team, p2Team: randomTeam(32, 1) }
  const data = cpuBattle(setup, { p1: 'human', p2: 'normal' })
  // Showdown 팀 텍스트를 거치며 '=' 는 빠진다 → 리플레이가 실제로 싣는 닉네임으로 확인
  const { html, sim } = await build(data, 'en')
  const nick = sim.frames[0]!.p1.team[0]!.nickname
  expect(nick).toBe(evil)
  expect(html).not.toContain(nick)
  expect(html).not.toContain(evil)
  expect(html).not.toMatch(/<img[^>]*onerror/i)
  expect(html).toContain(esc(nick))
  expect(html).toContain('&lt;img onerror=a(1)&gt;')
  // 생성기 자체: 엔진 제한을 넘는 긴 닉네임도 (프레임을 직접 고쳐) 이스케이프
  const long = '<img onerror=alert(1)>'
  const sim2 = structuredClone(sim)
  for (const f of sim2.frames) for (const m of [...f.p1.team, f.p1.active]) if (m.nickname === nick) m.nickname = long
  const html2 = buildReplayHtml({ data, encoded: await encodeReplay(data), sim: sim2, lang: 'en', viewerBase, demoUrl }).html
  expect(html2).not.toContain(long)
  expect(html2).not.toMatch(/<img[^>]*onerror/i)
  expect(html2).toContain('&lt;img onerror=alert(1)&gt;')
  // </script> 를 끼워 넣어도 내장 JSON 이 끊기지 않는다
  expect(html.match(/<\/script>/g)).toHaveLength(2)
  expect(esc(`"'&<>`)).toBe('&quot;&#39;&amp;&lt;&gt;')
})

test('metronome replay and forfeit tail', async () => {
  const setup: BattleSetup = { rule: 'metronome', seed: 77, metronome: { teamSize: 2, level: 50, p1Team: 'random', p2Team: 'random' } }
  const live = cpuBattle(setup, { p1: 'human', p2: 'normal' })
  const data: ReplayData = { ...live, actions: live.actions.slice(0, 2), forfeit: 'p1' }
  const { html } = await build(data, 'en')
  expect(html).toContain('Metronome')
  expect(html).not.toContain('Gen 9 ·')
  expect(html).toContain('You forfeited!')
  expect(html).toContain('You lost…')
  expect(replayFileName(data, when)).toBe('pokebattle-replay-you-vs-cpu-2026-11-24-0905.html')
})
