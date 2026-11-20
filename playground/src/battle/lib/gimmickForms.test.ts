// 모든 메가진화·원시회귀·울트라버스트·거다이맥스 폼이 자기 그림(2D 키·3D id)을 찾는지
import { expect, test } from 'vitest'
import { getSpecies, listPokeApiSpecies } from './engine'
import { pokeRogueKey } from './pokerogue'
import { spriteIdsOf } from './sprites'

const FORM = /-(mega(-[xyz])?|primal|gmax)$|^necrozma-ultra$/

test('기믹 폼마다 2D·3D 그림이 기본형이 아닌 그 폼', () => {
  const forms = listPokeApiSpecies().map(s => s.slug).filter(s => FORM.test(s) && getSpecies(s))
  expect(forms.length).toBeGreaterThan(80)
  const missing2d: string[] = []
  const missing3d: string[] = []
  for (const slug of forms) {
    const key = pokeRogueKey(slug)
    if (!key || !/mega|primal|gigantamax|ultra/.test(key)) missing2d.push(`${slug}→${key}`)
    const ids = spriteIdsOf(slug)
    if (!ids || ids.form < 10000) missing3d.push(slug)
  }
  expect(missing2d).toEqual([])
  expect(missing3d).toEqual([])
})
