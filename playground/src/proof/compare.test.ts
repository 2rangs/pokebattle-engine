import { beforeAll, describe, expect, it } from 'vitest'
import { preloadData } from '../../../dist/index.js'
import { compareBattles, engineRun, recordBattle, sha256Hex, showdownDirect } from './compare'

beforeAll(() => preloadData())

describe('verify-now comparison (worker logic)', () => {
  it('sha256Hex matches a known vector', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('recording is deterministic for a seed', () => {
    const a = recordBattle(7), b = recordBattle(7)
    expect(a.inputLog).toEqual(b.inputLog)
    expect(a.turns).toBeGreaterThan(0)
  })

  it('Showdown directly and the engine give byte-identical logs for the same N battles', async () => {
    const progress: number[] = []
    const r = await compareBattles({ n: 12, seedBase: 1000, rounds: 1, onProgress: p => progress.push(p.done) })
    expect(r.battles).toHaveLength(12)
    for (const b of r.battles) {
      expect(b.identical).toBe(true)
      expect(b.engineHash).toBe(b.showdownHash)
      expect(b.engineHash).toMatch(/^[0-9a-f]{64}$/)
    }
    // 배틀마다 해시가 다르다 (같은 로그를 비교한 게 아님)
    expect(new Set(r.battles.map(b => b.engineHash)).size).toBe(12)
    expect(r.turns).toBe(r.battles.reduce((s, b) => s + b.turns, 0))
    expect(r.showdownMs).toBeGreaterThan(0)
    expect(r.engineMs).toBeGreaterThan(0)
    expect(progress.at(-1)).toBe(12 * (1 + 2 + 2))
  })

  it('a second run of the same seeds gives the same hashes', async () => {
    const a = await compareBattles({ n: 4, seedBase: 42, rounds: 1 })
    const b = await compareBattles({ n: 4, seedBase: 42, rounds: 1 })
    expect(b.battles.map(x => x.engineHash)).toEqual(a.battles.map(x => x.engineHash))
  })

  it('detects a difference (the check is not vacuous)', async () => {
    const r = recordBattle(3)
    const tampered = engineRun(r).replace(/\|turn\|2\b/, '|turn|99')
    expect(await sha256Hex(tampered)).not.toBe(await sha256Hex(showdownDirect(r.inputLog)))
  })
})

describe('upstream @pkmn/sim reference', () => {
  it('the unmodified npm package gives the same logs as the engine', async () => {
    const { upstreamShowdown } = await import('./upstream')
    const r = await compareBattles({ n: 6, seedBase: 500, rounds: 1, showdown: upstreamShowdown })
    expect(r.battles.every(b => b.identical)).toBe(true)
  })
})
