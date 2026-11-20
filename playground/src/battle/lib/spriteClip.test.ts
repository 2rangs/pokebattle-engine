// 스프라이트 래퍼 CSS 회귀 테스트: 기술 애니메이션(돌진 등)은 .bd-sprite-ps / .bd-sprite-anim 을 제자리 밖으로
// 옮긴다. 그 조상(.bd-spot, .bd-sprite)이 평소에 자르면 (clip-path / overflow / clip) 스프라이트가 직선으로 잘려
// 네모난 테두리가 드러난다. 자르기는 기절(.is-fainted, 땅으로 가라앉기) 때만 허용.
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// vitest 는 CSS 를 비워서 들이므로 (?raw 도) 파일을 직접 읽는다
const css = readFileSync(new URL('../battle.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** 가장 안쪽 규칙들 (@media 안 포함): [선택자 하나, 선언] */
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap(m =>
  m[1]!.split(',').map((sel: string) => [sel.trim(), m[2]!] as const),
)

const WRAPPER = /\.bd-(spot|sprite|sprite-anim|sprite-ps)(?![\w-])\s*$/
const CLIPS = /(^|[;\s])(clip-path|overflow|overflow-[xy]|clip|contain)\s*:\s*(?!visible|none)/

describe('battle sprite wrappers', () => {
  it('found the wrapper rules', () => {
    expect(rules.some(([sel]) => sel === '.bd-sprite')).toBe(true)
  })

  it('never clip the sprite while it is alive (contact-move lunges leave the rest box)', () => {
    const bad = rules.filter(([sel, body]) => WRAPPER.test(sel) && !sel.includes('.is-fainted') && CLIPS.test(body))
    expect(bad.map(([sel]) => sel)).toEqual([])
  })

  it('still clips the bottom while fainting so the sprite sinks into the ground', () => {
    const faint = rules.find(([sel, body]) => sel === '.bd-sprite.is-fainted' && /clip-path\s*:\s*inset\(/.test(body))
    expect(faint).toBeTruthy()
  })
})
